"use strict";
/**
 * 予約APIコントローラー
 * @namespace controllers.api.reservations
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ttts = require("@motionpicture/ttts-domain");
const conf = require("config");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const moment = require("moment");
const _ = require("underscore");
const debug = createDebug('ttts-staff:controllers:api:reservations');
const redisClient = ttts.redis.createClient({
    host: process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_KEY,
    tls: { servername: process.env.REDIS_HOST }
});
const paymentMethodsForCustomer = conf.get('paymentMethodsForCustomer');
const paymentMethodsForStaff = conf.get('paymentMethodsForStaff');
/**
 * 予約検索
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function search(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const POS_CLIENT_ID = process.env.POS_CLIENT_ID;
        // バリデーション
        const errors = {};
        // 片方入力エラーチェック
        if (!isInputEven(req.query.start_hour1, req.query.start_minute1)) {
            errors.start_hour1 = { msg: '時分Fromが片方しか指定されていません' };
        }
        if (!isInputEven(req.query.start_hour2, req.query.start_minute2)) {
            errors.start_hour2 = { msg: '時分Toが片方しか指定されていません' };
        }
        if (Object.keys(errors).length > 0) {
            res.json({
                success: false,
                results: null,
                count: 0,
                errors: errors
            });
            return;
        }
        // tslint:disable-next-line:no-magic-numbers
        const limit = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, 10) : 10;
        // tslint:disable-next-line:no-magic-numbers
        const page = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, 10) : 1;
        // ご来塔日時
        const day = (!_.isEmpty(req.query.day)) ? req.query.day : null;
        const startHour1 = (!_.isEmpty(req.query.start_hour1)) ? req.query.start_hour1 : null;
        const startMinute1 = (!_.isEmpty(req.query.start_minute1)) ? req.query.start_minute1 : null;
        const startHour2 = (!_.isEmpty(req.query.start_hour2)) ? req.query.start_hour2 : null;
        const startMinute2 = (!_.isEmpty(req.query.start_minute2)) ? req.query.start_minute2 : null;
        // 購入番号
        let paymentNo = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
        // アカウント
        const owner = (!_.isEmpty(req.query.owner)) ? req.query.owner : null;
        // 予約方法
        const purchaserGroup = (!_.isEmpty(req.query.purchaser_group)) ? req.query.purchaser_group : null;
        // 決済手段
        const paymentMethod = (!_.isEmpty(req.query.payment_method)) ? req.query.payment_method : null;
        // 名前
        const purchaserLastName = (!_.isEmpty(req.query.purchaser_last_name)) ? req.query.purchaser_last_name : null;
        const purchaserFirstName = (!_.isEmpty(req.query.purchaser_first_name)) ? req.query.purchaser_first_name : null;
        // メアド
        const purchaserEmail = (!_.isEmpty(req.query.purchaser_email)) ? req.query.purchaser_email : null;
        // 電話番号
        const purchaserTel = (!_.isEmpty(req.query.purchaser_tel)) ? req.query.purchaser_tel : null;
        // メモ
        const watcherName = (!_.isEmpty(req.query.watcher_name)) ? req.query.watcher_name : null;
        // 検索条件を作成
        const conditions = [];
        // 管理者の場合、内部関係者の予約全て&確保中
        conditions.push({
            status: ttts.factory.reservationStatusType.ReservationConfirmed
        });
        // 来塔日
        if (day !== null) {
            conditions.push({ performance_day: day });
        }
        // 開始時間
        const startTimeFrom = (startHour1 !== null && startMinute1 !== null) ? startHour1 + startMinute1 : null;
        const startTimeTo = (startHour2 !== null && startMinute2 !== null) ? startHour2 + startMinute2 : null;
        if (startTimeFrom !== null || startTimeTo !== null) {
            const conditionsTime = {};
            // 開始時間From
            if (startTimeFrom !== null) {
                conditionsTime.$gte = startTimeFrom;
            }
            // 開始時間To
            if (startTimeTo !== null) {
                conditionsTime.$lte = startTimeTo;
            }
            conditions.push({ performance_start_time: conditionsTime });
        }
        // 購入番号
        if (paymentNo !== null) {
            // remove space characters
            paymentNo = ttts.CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, ''));
            conditions.push({ payment_no: { $regex: `${paymentNo}` } });
        }
        // アカウント
        if (owner !== null) {
            conditions.push({ owner_username: owner });
        }
        // 予約方法
        if (purchaserGroup !== null) {
            switch (purchaserGroup) {
                case 'POS':
                    // 取引エージェントがPOS
                    conditions.push({ 'transaction_agent.id': POS_CLIENT_ID });
                    break;
                case ttts.factory.person.Group.Customer:
                    // 購入者区分が一般、かつ、POS購入でない
                    conditions.push({ purchaser_group: purchaserGroup });
                    conditions.push({ 'transaction_agent.id': { $ne: POS_CLIENT_ID } });
                    break;
                default:
                    conditions.push({ purchaser_group: purchaserGroup });
            }
        }
        // 決済手段
        if (paymentMethod !== null) {
            conditions.push({ payment_method: paymentMethod });
        }
        // 名前
        if (purchaserLastName !== null) {
            conditions.push({ purchaser_last_name: new RegExp(purchaserLastName, 'i') }); // 大文字小文字区別しない
        }
        if (purchaserFirstName !== null) {
            conditions.push({ purchaser_first_name: new RegExp(purchaserFirstName, 'i') }); // 大文字小文字区別しない
        }
        // メアド
        if (purchaserEmail !== null) {
            conditions.push({ purchaser_email: purchaserEmail });
        }
        // 電話番号
        if (purchaserTel !== null) {
            conditions.push({ purchaser_tel: new RegExp(`${purchaserTel}$`) });
        }
        // メモ
        if (watcherName !== null) {
            conditions.push({ watcher_name: new RegExp(watcherName, 'i') }); // 大文字小文字区別しない
        }
        debug('searching reservations...', conditions);
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        try {
            // 総数検索
            const count = yield reservationRepo.reservationModel.count({
                $and: conditions
            }).exec();
            debug('reservation count:', count);
            // データ検索(検索→ソート→指定ページ分切取り)
            const reservations = yield reservationRepo.reservationModel.find({ $and: conditions })
                .sort({
                performance_day: 1,
                performance_start_time: 1,
                payment_no: 1,
                ticket_type: 1
            })
                .skip(limit * (page - 1))
                .limit(limit)
                .exec()
                .then((docs) => docs.map((doc) => doc.toObject()));
            // 0件メッセージセット
            const message = (reservations.length === 0) ?
                '検索結果がありません。予約データが存在しないか、検索条件を見直してください' : '';
            const getPaymentMethodName = (method) => {
                if (paymentMethodsForCustomer.hasOwnProperty(method)) {
                    return paymentMethodsForCustomer[method];
                }
                if (paymentMethodsForStaff.hasOwnProperty(method)) {
                    return paymentMethodsForStaff[method];
                }
                return method;
            };
            // 決済手段名称追加
            for (const reservation of reservations) {
                reservation.payment_method_name = getPaymentMethodName(reservation.payment_method);
            }
            res.json({
                results: reservations,
                count: count,
                errors: null,
                message: message
            });
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                errors: [{
                        message: error.message
                    }]
            });
        }
    });
}
exports.search = search;
/**
 * 両方入力チェック(両方入力、または両方未入力の時true)
 *
 * @param {string} value1
 * @param {string} value2
 * @return {boolean}
 */
function isInputEven(value1, value2) {
    if (_.isEmpty(value1) && _.isEmpty(value2)) {
        return true;
    }
    if (!_.isEmpty(value1) && !_.isEmpty(value2)) {
        return true;
    }
    return false;
}
/**
 * 配布先を更新する
 */
function updateWatcherName(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('UnexpectedError')));
            return;
        }
        const reservationId = req.body.reservationId;
        const watcherName = req.body.watcherName;
        const condition = {
            _id: reservationId,
            status: ttts.factory.reservationStatusType.ReservationConfirmed
        };
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        try {
            const reservation = yield reservationRepo.reservationModel.findOneAndUpdate(condition, {
                watcher_name: watcherName,
                watcher_name_updated_at: Date.now()
            }, { new: true }).exec();
            if (reservation === null) {
                res.status(http_status_1.NOT_FOUND).json(null);
            }
            else {
                res.status(http_status_1.NO_CONTENT).end();
            }
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                errors: [{
                        message: req.__('UnexpectedError')
                    }]
            });
        }
    });
}
exports.updateWatcherName = updateWatcherName;
/**
 * キャンセル実行api
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
function cancel(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('UnexpectedError')));
            return;
        }
        const successIds = [];
        const errorIds = [];
        try {
            const reservationIds = req.body.reservationIds;
            if (!Array.isArray(reservationIds)) {
                throw new Error(req.__('UnexpectedError'));
            }
            const promises = reservationIds.map((id) => __awaiter(this, void 0, void 0, function* () {
                // 予約データの解放
                const result = yield cancelById(id);
                if (result) {
                    successIds.push(id);
                }
                else {
                    errorIds.push(id);
                }
            }));
            yield Promise.all(promises);
            res.status(http_status_1.NO_CONTENT).end();
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                message: error.message,
                successIds: successIds,
                errorIds: errorIds
            });
        }
    });
}
exports.cancel = cancel;
/**
 * キャンセル処理(idから)
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
function cancelById(reservationId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
            const stockRepo = new ttts.repository.Stock(ttts.mongoose.connection);
            // idから予約データ取得
            const reservation = yield reservationRepo.reservationModel.findOne({
                _id: reservationId,
                status: ttts.factory.reservationStatusType.ReservationConfirmed
            }).exec().then((doc) => {
                if (doc === null) {
                    throw new Error('Reservation not found.');
                }
                return doc.toObject();
            });
            debug('canceling a reservation...', reservation.id);
            // 予約をキャンセル
            yield reservationRepo.reservationModel.findByIdAndUpdate(reservation.id, { status: ttts.factory.reservationStatusType.ReservationCancelled }).exec();
            // 在庫を空きに(在庫IDに対して、元の状態に戻す)
            yield Promise.all(reservation.stocks.map((stock) => __awaiter(this, void 0, void 0, function* () {
                yield stockRepo.stockModel.findOneAndUpdate({
                    _id: stock.id,
                    availability: stock.availability_after,
                    holder: stock.holder // 対象取引に保持されている
                }, {
                    $set: { availability: stock.availability_before },
                    $unset: { holder: 1 }
                }).exec();
            })));
            debug(reservation.stocks.length, 'stock(s) returned in stock.');
            // 券種による流入制限解放
            if (reservation.rate_limit_unit_in_seconds > 0) {
                const rateLimitRepo = new ttts.repository.rateLimit.TicketTypeCategory(redisClient);
                yield rateLimitRepo.unlock({
                    ticketTypeCategory: reservation.ticket_ttts_extension.category,
                    performanceStartDate: moment(reservation.performance_start_date).toDate(),
                    unitInSeconds: reservation.rate_limit_unit_in_seconds
                });
                debug('rate limit reset.');
            }
        }
        catch (error) {
            return false;
        }
        return true;
    });
}
