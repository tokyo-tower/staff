"use strict";
/**
 * 内部関係者マイページコントローラー
 *
 * @namespace controller/staff/mypage
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
const ttts_domain_1 = require("@motionpicture/ttts-domain");
const _ = require("underscore");
const DEFAULT_RADIX = 10;
const layout = 'layouts/staff/layout';
/**
 * マイページ(予約一覧)
 *
 */
function index(__, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const owners = yield ttts_domain_1.Models.Owner.find({}, '_id name', { sort: { _id: 1 } }).exec();
            res.render('staff/mypage/index', {
                owners: owners,
                layout: layout
            });
        }
        catch (error) {
            next(error);
        }
    });
}
exports.index = index;
/**
 * マイページ予約検索
 *
 */
// tslint:disable-next-line:max-func-body-length
// tslint:disable-next-line:cyclomatic-complexity
function search(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
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
        //mypageForm(req);
        // const validatorResult = await req.getValidationResult();
        // if (!validatorResult.isEmpty()) {
        //     const errors = req.validationErrors(true);
        //     res.json({
        //         success: false,
        //         results: null,
        //         count: 0,
        //         errors: errors
        //     });
        //     return;
        // }
        // tslint:disable-next-line:no-magic-numbers
        const limit = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, DEFAULT_RADIX) : 10;
        const page = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, DEFAULT_RADIX) : 1;
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
                $or: [
                    {
                        //purchaser_group: ReservationUtil.PURCHASER_GROUP_STAFF,
                        status: ttts_domain_1.ReservationUtil.STATUS_RESERVED
                    },
                    {
                        status: ttts_domain_1.ReservationUtil.STATUS_KEPT_BY_TTTS
                    }
                ]
            });
        }
        else {
            conditions.push({
                //purchaser_group: ReservationUtil.PURCHASER_GROUP_STAFF,
                //owner: req.staffUser.get('_id'),
                status: ttts_domain_1.ReservationUtil.STATUS_RESERVED
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
            paymentNo = ttts_domain_1.CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, ''));
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
            conditions.push({ purchaser_tel: purchaserTel });
        }
        // メモ
        if (watcherName !== null) {
            conditions.push({ watcher_name: watcherName });
        }
        try {
            // 総数検索
            const count = yield ttts_domain_1.Models.Reservation.count({
                $and: conditions
            }).exec();
            // データ検索
            const reservations = yield ttts_domain_1.Models.Reservation.find({ $and: conditions })
                .skip(limit * (page - 1))
                .limit(limit)
                .lean(true)
                .exec();
            // ソート昇順(上映日→開始時刻→購入番号→座席コード)
            reservations.sort((a, b) => {
                if (a.performance_day > b.performance_day) {
                    return 1;
                }
                if (a.performance_day < b.performance_day) {
                    return -1;
                }
                if (a.performance_start_time > b.performance_start_time) {
                    return 1;
                }
                if (a.performance_start_time < b.performance_start_time) {
                    return -1;
                }
                if (a.payment_no > b.payment_no) {
                    return 1;
                }
                if (a.payment_no < b.payment_no) {
                    return -1;
                }
                return ttts_domain_1.ScreenUtil.sortBySeatCode(a.seat_code, b.seat_code);
            });
            res.json({
                success: true,
                results: reservations,
                count: count,
                errors: null
            });
        }
        catch (error) {
            console.error(error);
            res.json({
                success: false,
                results: [],
                errors: null,
                count: 0
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
        req.checkQuery('day', req.__('Message.required{{fieldName}}', { fieldName: req.__('Label.Day') })).notEmpty();
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
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        const reservationId = req.body.reservationId;
        const watcherName = req.body.watcherName;
        const condition = {
            _id: reservationId,
            status: ttts_domain_1.ReservationUtil.STATUS_RESERVED
        };
        // 自分の予約のみ
        condition.owner = req.staffUser.get('_id');
        try {
            const reservation = yield ttts_domain_1.Models.Reservation.findOneAndUpdate(condition, {
                watcher_name: watcherName,
                watcher_name_updated_at: Date.now(),
                owner_signature: req.staffUser.get('signature')
            }, { new: true }).exec();
            if (reservation === null) {
                res.json({
                    success: false,
                    message: req.__('Message.NotFound'),
                    reservationId: null
                });
            }
            else {
                res.json({
                    success: true,
                    reservation: reservation.toObject()
                });
            }
        }
        catch (error) {
            res.json({
                success: false,
                message: req.__('Message.UnexpectedError'),
                reservationId: null
            });
        }
    });
}
exports.updateWatcherName = updateWatcherName;
/**
 * 座席開放
 */
function release(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.method === 'POST') {
            const day = req.body.day;
            if (day === undefined || day === '') {
                res.json({
                    success: false,
                    message: req.__('Message.UnexpectedError')
                });
                return;
            }
            try {
                yield ttts_domain_1.Models.Reservation.remove({
                    performance_day: day,
                    status: ttts_domain_1.ReservationUtil.STATUS_KEPT_BY_TTTS
                }).exec();
                res.json({
                    success: true,
                    message: null
                });
            }
            catch (error) {
                res.json({
                    success: false,
                    message: req.__('Message.UnexpectedError')
                });
            }
        }
        else {
            try {
                // 開放座席情報取得
                const reservations = yield ttts_domain_1.Models.Reservation.find({
                    status: ttts_domain_1.ReservationUtil.STATUS_KEPT_BY_TTTS
                }, 'status seat_code performance_day').exec();
                // 日付ごとに
                const reservationsByDay = {};
                reservations.forEach((reservation) => {
                    if (!reservationsByDay.hasOwnProperty(reservation.get('performance_day'))) {
                        reservationsByDay[reservation.get('performance_day')] = [];
                    }
                    reservationsByDay[reservation.get('performance_day')].push(reservation);
                });
                res.render('staff/mypage/release', {
                    reservationsByDay: reservationsByDay,
                    layout: layout
                });
            }
            catch (error) {
                next(new Error(req.__('Message.UnexpectedError')));
            }
        }
    });
}
exports.release = release;
