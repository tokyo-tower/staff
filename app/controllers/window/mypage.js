"use strict";
/**
 * 当日窓口マイページコントローラー
 *
 * @namespace controller/window/mypage
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
const chevre_domain_1 = require("@motionpicture/chevre-domain");
const gmo_service_1 = require("@motionpicture/gmo-service");
const moment = require("moment");
const _ = require("underscore");
const DEFAULT_RADIX = 10;
const layout = 'layouts/window/layout';
function index(__1, res, __2) {
    res.render('window/mypage/index', {
        GMOUtil: gmo_service_1.Util,
        ReservationUtil: chevre_domain_1.ReservationUtil,
        layout: layout
    });
}
exports.index = index;
/**
 * マイページ予約検索
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function search(req, res, __) {
    return __awaiter(this, void 0, void 0, function* () {
        // tslint:disable-next-line:no-magic-numbers
        const limit = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, DEFAULT_RADIX) : 10;
        const page = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, DEFAULT_RADIX) : 1;
        const purchaserGroups = (!_.isEmpty(req.query.purchaser_groups)) ? req.query.purchaser_groups.split(',') : [];
        const purchasedDay = (!_.isEmpty(req.query.purchased_day)) ? req.query.purchased_day : null;
        let email = (!_.isEmpty(req.query.email)) ? req.query.email : null;
        let tel = (!_.isEmpty(req.query.tel)) ? req.query.tel : null;
        let purchaserFirstName = (!_.isEmpty(req.query.purchaser_first_name)) ? req.query.purchaser_first_name : null;
        let purchaserLastName = (!_.isEmpty(req.query.purchaser_last_name)) ? req.query.purchaser_last_name : null;
        let paymentNo = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
        const day = (!_.isEmpty(req.query.day)) ? req.query.day : null;
        let filmName = (!_.isEmpty(req.query.film_name)) ? req.query.film_name : null;
        // 検索条件を作成
        const conditions = [];
        // 内部関係者以外がデフォルト
        conditions.push({
            purchaser_group: { $ne: chevre_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF },
            status: {
                $in: [
                    chevre_domain_1.ReservationUtil.STATUS_RESERVED,
                    chevre_domain_1.ReservationUtil.STATUS_WAITING_SETTLEMENT,
                    chevre_domain_1.ReservationUtil.STATUS_WAITING_SETTLEMENT_PAY_DESIGN
                ]
            }
        });
        if (purchaserGroups.length > 0) {
            conditions.push({ purchaser_group: { $in: purchaserGroups } });
        }
        // 購入日条件
        if (purchasedDay !== null) {
            conditions.push({
                purchased_at: {
                    $gte: moment(
                    // tslint:disable-next-line:no-magic-numbers
                    `${purchasedDay.substr(0, 4)}-${purchasedDay.substr(4, 2)}-${purchasedDay.substr(6, 2)}T00:00:00+09:00`),
                    $lte: moment(
                    // tslint:disable-next-line:no-magic-numbers
                    `${purchasedDay.substr(0, 4)}-${purchasedDay.substr(4, 2)}-${purchasedDay.substr(6, 2)}T23:59:59+09:00`)
                }
            });
        }
        if (email !== null) {
            // remove space characters
            email = chevre_domain_1.CommonUtil.toHalfWidth(email.replace(/\s/g, ''));
            conditions.push({ purchaser_email: { $regex: new RegExp(email, 'i') } });
        }
        if (tel !== null) {
            // remove space characters
            tel = chevre_domain_1.CommonUtil.toHalfWidth(tel.replace(/\s/g, ''));
            conditions.push({ purchaser_tel: { $regex: new RegExp(tel, 'i') } });
        }
        // 空白つなぎでAND検索
        if (purchaserFirstName !== null) {
            // trim and to half-width space
            purchaserFirstName = purchaserFirstName.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
            purchaserFirstName.split(' ').forEach((pattern) => {
                if (pattern.length > 0) {
                    conditions.push({ purchaser_first_name: { $regex: new RegExp(pattern, 'i') } });
                }
            });
        }
        // 空白つなぎでAND検索
        if (purchaserLastName !== null) {
            // trim and to half-width space
            purchaserLastName = purchaserLastName.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
            purchaserLastName.split(' ').forEach((pattern) => {
                if (pattern.length > 0) {
                    conditions.push({ purchaser_last_name: { $regex: new RegExp(pattern, 'i') } });
                }
            });
        }
        if (paymentNo !== null) {
            // remove space characters
            paymentNo = chevre_domain_1.CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, ''));
            conditions.push({ payment_no: { $regex: new RegExp(paymentNo, 'i') } });
        }
        if (day !== null) {
            conditions.push({ performance_day: day });
        }
        // 空白つなぎでAND検索
        if (filmName !== null) {
            // trim and to half-width space
            filmName = filmName.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
            filmName.split(' ').forEach((pattern) => {
                if (pattern.length > 0) {
                    const regex = new RegExp(pattern, 'i');
                    conditions.push({
                        $or: [
                            {
                                'film_name.ja': { $regex: regex }
                            },
                            {
                                'film_name.en': { $regex: regex }
                            }
                        ]
                    });
                }
            });
        }
        try {
            // 総数検索
            const count = yield chevre_domain_1.Models.Reservation.count({
                $and: conditions
            }).exec();
            const reservations = yield chevre_domain_1.Models.Reservation.find({ $and: conditions })
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
                return chevre_domain_1.ScreenUtil.sortBySeatCode(a.seat_code, b.seat_code);
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
