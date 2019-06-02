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
        const paymentNo = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
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
        const startTimeFrom = (startHour1 !== null && startMinute1 !== null) ? startHour1 + startMinute1 : null;
        const startTimeTo = (startHour2 !== null && startMinute2 !== null) ? startHour2 + startMinute2 : null;
        const searchConditions = {
            limit: limit,
            page: page,
            sort: {
                performance_day: 1,
                performance_start_time: 1,
                payment_no: 1,
                ticket_type: 1
            },
            // 管理者の場合、内部関係者の予約全て&確保中
            status: ttts.factory.reservationStatusType.ReservationConfirmed,
            performance_day: (day !== null) ? day : undefined,
            performanceStartTimeFrom: (startTimeFrom !== null) ? startTimeFrom : undefined,
            performanceStartTimeTo: (startTimeTo !== null) ? startTimeTo : undefined,
            payment_no: (paymentNo !== null) ? ttts.CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, '')) : undefined,
            owner_username: (owner !== null) ? owner : undefined,
            purchaser_group: (purchaserGroup !== null)
                ? (purchaserGroup !== 'POS') ? purchaserGroup : undefined
                : undefined,
            transactionAgentId: (purchaserGroup !== null)
                ? (purchaserGroup === 'POS')
                    ? POS_CLIENT_ID
                    : (purchaserGroup === ttts.factory.person.Group.Customer) ? { $ne: POS_CLIENT_ID } : undefined
                : undefined,
            paymentMethod: (paymentMethod !== null) ? paymentMethod : undefined,
            purchaserLastName: (purchaserLastName !== null) ? purchaserLastName : undefined,
            purchaserFirstName: (purchaserFirstName !== null) ? purchaserFirstName : undefined,
            purchaserEmail: (purchaserEmail !== null) ? purchaserEmail : undefined,
            purchaserTel: (purchaserTel !== null) ? purchaserTel : undefined,
            watcherName: (watcherName !== null) ? watcherName : undefined
        };
        const conditions = [];
        // 予約方法
        // if (purchaserGroup !== null) {
        //     switch (purchaserGroup) {
        //         case 'POS':
        //             // 取引エージェントがPOS
        //             conditions.push({ 'transaction_agent.id': POS_CLIENT_ID });
        //             break;
        //         case ttts.factory.person.Group.Customer:
        //             // 購入者区分が一般、かつ、POS購入でない
        //             conditions.push({ purchaser_group: purchaserGroup });
        //             conditions.push({ 'transaction_agent.id': { $ne: POS_CLIENT_ID } });
        //             break;
        //         default:
        //             conditions.push({ purchaser_group: purchaserGroup });
        //     }
        // }
        debug('searching reservations...', conditions);
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        try {
            // 総数検索
            const count = yield reservationRepo.count(searchConditions);
            debug('reservation count:', count);
            // データ検索(検索→ソート→指定ページ分切取り)
            const reservations = yield reservationRepo.search(searchConditions);
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
            const reservation = yield reservationRepo.updateWatcher(condition, {
                watcher_name: watcherName,
                watcher_name_updated_at: new Date()
            });
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
                try {
                    yield ttts.service.reserve.cancelReservation({ id: id })({
                        reservation: new ttts.repository.Reservation(ttts.mongoose.connection),
                        stock: new ttts.repository.Stock(redisClient),
                        ticketTypeCategoryRateLimit: new ttts.repository.rateLimit.TicketTypeCategory(redisClient)
                    });
                    successIds.push(id);
                }
                catch (error) {
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
