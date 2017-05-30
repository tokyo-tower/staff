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
function index(__, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // const theaters = await Models.Theater.find({}, 'name', { sort: { _id: 1 } }).exec();
            // const films = await Models.Film.find({}, 'name', { sort: { _id: 1 } }).exec();
            const owners = yield ttts_domain_1.Models.Owner.find({}, '_id name', { sort: { _id: 1 } }).exec();
            res.render('staff/mypage/index', {
                // theaters: theaters,
                // films: films,
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
 */
// tslint:disable-next-line:max-func-body-length
// tslint:disable-next-line:cyclomatic-complexity
function search(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        // tslint:disable-next-line:no-magic-numbers
        const limit = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, DEFAULT_RADIX) : 10;
        const page = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, DEFAULT_RADIX) : 1;
        const day = (!_.isEmpty(req.query.day)) ? req.query.day : null;
        const startHour1 = (!_.isEmpty(req.query.start_hour1)) ? req.query.start_hour1 : null;
        const startMinute1 = (!_.isEmpty(req.query.start_minute1)) ? req.query.start_minute1 : null;
        const startHour2 = (!_.isEmpty(req.query.start_hour2)) ? req.query.start_hour2 : null;
        const startMinute2 = (!_.isEmpty(req.query.start_minute2)) ? req.query.start_minute2 : null;
        let paymentNo = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
        const owner = (!_.isEmpty(req.query.owner)) ? req.query.owner : null;
        // 　　名前      reservations.？ ※1
        // 　　メアド    reservations.？ ※1
        // 　　電話番号  reservations.？ ※1
        // 　　メモ      reservations.watcher_name ※2
        // const theater: string | null = (!_.isEmpty(req.query.theater)) ? req.query.theater : null;
        // const film: string | null = (!_.isEmpty(req.query.film)) ? req.query.film : null;
        // const updater: string | null = (!_.isEmpty(req.query.updater)) ? req.query.updater : null;
        // 検索条件を作成
        const conditions = [];
        // 管理者の場合、内部関係者の予約全て&確保中
        if (req.staffUser.get('is_admin') === true) {
            conditions.push({
                $or: [
                    {
                        purchaser_group: ttts_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF,
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
                purchaser_group: ttts_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF,
                owner: req.staffUser.get('_id'),
                status: ttts_domain_1.ReservationUtil.STATUS_RESERVED
            });
        }
        // if (film !== null) {
        //     conditions.push({ film: film });
        // }
        // if (theater !== null) {
        //     conditions.push({ theater: theater });
        // }
        if (day !== null) {
            conditions.push({ performance_day: day });
        }
        const startTimeFrom = (startHour1 !== null && startMinute1 !== null) ? startHour1 + startMinute1 : null;
        const startTimeTo = (startHour2 !== null && startMinute2 !== null) ? startHour2 + startMinute2 : null;
        if (startTimeFrom !== null || startTimeTo !== null) {
            const conditionsTime = {};
            // const key: string = 'performance_start_time';
            // 開始時間From
            if (startTimeFrom !== null) {
                // const keyFrom = '$gte';
                conditionsTime.$gte = startTimeFrom;
            }
            // 開始時間To
            if (startTimeTo !== null) {
                // const keyFrom = '$lt';
                conditionsTime.$lt = startTimeTo;
            }
            conditions.push({ performance_start_time: conditionsTime });
        }
        // let startTimeTo: string = '';
        // if (startHour1 !== null && startMinute1 !== null) {
        // }
        // if (startHour1 !== null && startMinute1 !== null) {
        //     conditions.push({
        //         performance_start_time: {
        //             $gte: startHour1 + startMinute1
        //         }
        //     });
        // }
        // if (startHour2 !== null && startMinute2 !== null) {
        //     conditions.push({
        //         performance_end_time: {
        //             $lte: startHour2 + startMinute2
        //         }
        //     });
        // }
        // if (updater !== null) {
        //     conditions.push({
        //         $or: [
        //             {
        //                 owner_signature: { $regex: `${updater}` }
        //             },
        //             {
        //                 watcher_name: { $regex: `${updater}` }
        //             }
        //         ]
        //     });
        // }
        if (paymentNo !== null) {
            // remove space characters
            paymentNo = ttts_domain_1.CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, ''));
            conditions.push({ payment_no: { $regex: `${paymentNo}` } });
        }
        if (owner !== null) {
            conditions.push({ owner: owner });
        }
        try {
            // 総数検索
            const count = yield ttts_domain_1.Models.Reservation.count({
                $and: conditions
            }).exec();
            const reservations = yield ttts_domain_1.Models.Reservation.find({ $and: conditions })
                .skip(limit * (page - 1))
                .limit(limit)
                .lean(true)
                .exec();
            // ソート昇順(上映日→開始時刻→スクリーン→座席コード)
            reservations.sort((a, b) => {
                if (a.performance_day > b.performance_day) {
                    return 1;
                }
                if (a.performance_start_time > b.performance_start_time) {
                    return 1;
                }
                if (a.screen > b.screen) {
                    return 1;
                }
                return ttts_domain_1.ScreenUtil.sortBySeatCode(a.seat_code, b.seat_code);
            });
            res.json({
                success: true,
                results: reservations,
                count: count
            });
        }
        catch (error) {
            console.error(error);
            res.json({
                success: false,
                results: [],
                count: 0
            });
        }
    });
}
exports.search = search;
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
