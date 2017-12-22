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
const createDebug = require("debug");
const http_status_1 = require("http-status");
const _ = require("underscore");
const debug = createDebug('ttts-staff:controllers:api:reservations');
/**
 * 予約検索
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function search(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        // バリデーション
        const errors = yield validate(req);
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
        if (req.staffUser.get('is_admin') === true) {
            conditions.push({
                status: ttts.factory.reservationStatusType.ReservationConfirmed
            });
        }
        else {
            conditions.push({
                status: ttts.factory.reservationStatusType.ReservationConfirmed
            });
        }
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
            conditions.push({ owner: owner });
        }
        // 予約方法
        if (purchaserGroup !== null) {
            conditions.push({ purchaser_group: purchaserGroup });
        }
        // 決済手段
        if (paymentMethod !== null) {
            conditions.push({ payment_method: paymentMethod });
        }
        // 名前
        if (purchaserLastName !== null) {
            conditions.push({ purchaser_last_name: { $regex: purchaserLastName } });
            //conditions['name.ja'] = { $regex: managementTypeName };
        }
        if (purchaserFirstName !== null) {
            conditions.push({ purchaser_first_name: { $regex: purchaserFirstName } });
            //conditions.push({ purchaser_first_name: purchaserFirstName });
        }
        // メアド
        if (purchaserEmail !== null) {
            conditions.push({ purchaser_email: purchaserEmail });
        }
        // 電話番号
        if (purchaserTel !== null) {
            conditions.push({
                purchaser_tel: { $regex: new RegExp(`${purchaserTel}$`) }
            });
        }
        // メモ
        if (watcherName !== null) {
            conditions.push({ watcher_name: watcherName });
        }
        debug('searching reservations...', conditions);
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        try {
            // 総数検索
            const count = yield reservationRepo.reservationModel.count({
                $and: conditions
            }).exec();
            debug('reservation count:', count);
            // 2017/11/14 データ検索、切り取り、ソートの順を変更
            // データ検索
            // const reservations = <any[]>await Models.Reservation.find({ $and: conditions })
            //     .skip(limit * (page - 1))
            //     .limit(limit)
            //     .lean(true)
            //     .exec();
            // // ソート昇順(上映日→開始時刻→購入番号→座席コード)
            // reservations.sort((a, b) => {
            //     if (a.performance_day > b.performance_day) {
            //         return 1;
            //     }
            //     if (a.performance_day < b.performance_day) {
            //         return -1;
            //     }
            //     if (a.performance_start_time > b.performance_start_time) {
            //         return 1;
            //     }
            //     if (a.performance_start_time < b.performance_start_time) {
            //         return -1;
            //     }
            //     if (a.payment_no > b.payment_no) {
            //         return 1;
            //     }
            //     if (a.payment_no < b.payment_no) {
            //         return -1;
            //     }
            //     return ScreenUtil.sortBySeatCode(a.seat_code, b.seat_code);
            // });
            // データ検索(検索→ソート→指定ページ分切取り)
            const reservations = yield reservationRepo.reservationModel.find({ $and: conditions })
                .sort({
                performance_day: 1,
                performance_start_time: 1,
                payment_no: 1,
                seat_code: 1
            })
                .skip(limit * (page - 1))
                .limit(limit)
                .exec();
            //---
            res.json({
                results: reservations,
                count: count,
                errors: null
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
 * マイページ予約検索画面検証
 *
 * @param {any} req
 * @return {any}
 */
function validate(req) {
    return __awaiter(this, void 0, void 0, function* () {
        // 来塔日
        req.checkQuery('day', req.__('NoInput{{fieldName}}', { fieldName: req.__('Label.Day') })).notEmpty();
        // 検証
        const validatorResult = yield req.getValidationResult();
        const errors = (!validatorResult.isEmpty()) ? req.validationErrors(true) : {};
        // 片方入力エラーチェック
        if (!isInputEven(req.query.start_hour1, req.query.start_minute1)) {
            errors.start_hour1 = { msg: '時分Fromが片方しか指定されていません' };
        }
        if (!isInputEven(req.query.start_hour2, req.query.start_minute2)) {
            errors.start_hour2 = { msg: '時分Toが片方しか指定されていません' };
        }
        return errors;
    });
}
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
        // 自分の予約のみ
        condition.owner = req.staffUser.get('id');
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        try {
            const reservation = yield reservationRepo.reservationModel.findOneAndUpdate(condition, {
                watcher_name: watcherName,
                watcher_name_updated_at: Date.now(),
                owner_signature: req.staffUser.get('signature')
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
            // 同じseat_code_baseのチケット一式を予約キャンセル(車椅子予約の場合は、システムホールドのデータもキャンセルする必要があるので)
            const cancelingReservations = yield reservationRepo.reservationModel.find({
                performance_day: reservation.performance_day,
                payment_no: reservation.payment_no,
                'reservation_ttts_extension.seat_code_base': reservation.seat_code
            }).exec();
            debug('canceling...', cancelingReservations);
            yield Promise.all(cancelingReservations.map((cancelingReservation) => __awaiter(this, void 0, void 0, function* () {
                // 予約をキャンセル
                yield reservationRepo.reservationModel.findByIdAndUpdate(cancelingReservation.id, { status: ttts.factory.reservationStatusType.ReservationCancelled }).exec();
                // 在庫を空きに(在庫IDに対して、元の状態に戻す)
                yield stockRepo.stockModel.findByIdAndUpdate(cancelingReservation.get('stock'), { availability: cancelingReservation.get('stock_availability_before') }).exec();
            })));
            debug(cancelingReservations.length, 'reservation(s) canceled.');
            // tslint:disable-next-line:no-suspicious-comment
            // TODO 車椅子流入制限解放
            // if (reservation.ticket_ttts_extension !== ttts.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
            //     await ttts.Models.ReservationPerHour.findOneAndUpdate(
            //         { reservation_id: reservationId },
            //         {
            //             $set: { status: ttts.factory.itemAvailability.InStock },
            //             $unset: { expired_at: 1, reservation_id: 1 }
            //         },
            //         {
            //             new: true
            //         }
            //     ).exec();
            // }
        }
        catch (error) {
            return false;
        }
        return true;
    });
}
