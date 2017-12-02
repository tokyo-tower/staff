"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 運行・オンライン販売停止一覧コントローラー
 *
 * @namespace controller/staff/suspensionList
 */
const ttts_domain_1 = require("@motionpicture/ttts-domain");
const moment = require("moment");
const _ = require("underscore");
const suspensionCommon = require("./suspensionCommon");
const DEFAULT_RADIX = 10;
const VIEW_PATH = 'staff/suspension';
const layout = 'layouts/staff/layout';
const EMPTY_STRING = '-';
const EV_SERVICE_STATUS_NAMES = { 0: EMPTY_STRING, 1: '減速', 2: '停止' };
const REFUND_STATUS_NAMES = { 0: EMPTY_STRING, 1: '未指示', 2: '指示済', 3: '返金済' };
/**
 * 運行・オンライン販売停止一覧
 *
 */
function index(__, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            res.render(`${VIEW_PATH}/list`, {
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
 * 販売中止一覧検索(api)
 *
 */
function search(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        // バリデーション
        // const errors = await validate(req);
        // if (Object.keys(errors).length > 0) {
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
        // 入力値またはnull取得
        const getValue = (value) => {
            return (!_.isEmpty(value)) ? value : null;
        };
        // 販売停止処理日
        const day1 = getValue(req.query.input_onlinedate1);
        const day2 = getValue(req.query.input_onlinedate2);
        // 対象ツアー年月日
        const performanceDate1 = getValue(req.query.input_performancedate1);
        const performanceDate2 = getValue(req.query.input_performancedate2);
        // 返金ステータス
        const refundStatus = getValue(req.query.refund_status);
        // 検索条件を作成
        const conditions = [];
        conditions.push({ 'ttts_extension.online_sales_status': ttts_domain_1.PerformanceUtil.ONLINE_SALES_STATUS.SUSPENDED });
        // 販売停止処理日
        if (day1 !== null || day2 !== null) {
            conditions.push({ 'ttts_extension.online_sales_update_at': getConditionsFromTo(day1, day2, true) });
        }
        // 対象ツアー年月日
        if (performanceDate1 !== null || performanceDate2 !== null) {
            conditions.push({ day: getConditionsFromTo(performanceDate1, performanceDate2) });
        }
        // 予約情報
        // 返金ステータス
        const conditionsR = {};
        if (refundStatus !== null) {
            conditionsR.refund_status = refundStatus;
        }
        try {
            // データ検索
            const performances = yield getPerformances(conditions, limit, page);
            const cntPerformances = performances.length;
            let infoR = {};
            if (cntPerformances > 0) {
                // infoR.dicResevations { performance_id : [resevation1, resevationn] }
                infoR = yield getResevations(conditionsR, performances);
            }
            // データから表示用の一覧を作成
            const suspensionList = getSuspensionList(performances, infoR);
            res.json({
                success: true,
                results: suspensionList,
                count: cntPerformances,
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
 * FromTo条件セット
 *
 * @param {string | null} value1
 * @param {string | null} value2
 * @param {boolean} convert
 * @return {any}
 */
function getConditionsFromTo(value1, value2, convert = false) {
    const conditionsFromTo = {};
    if (value1 !== null) {
        value1 = convert ? moment(value1, 'YYYY/MM/DD').format('YYYY/MM/DD HH:mm:ss') : value1;
        conditionsFromTo.$gte = value1;
    }
    if (value2 !== null) {
        value2 = convert ? moment(value2, 'YYYY/MM/DD').add('days', 1).format('YYYY/MM/DD HH:mm:ss') : value2;
        conditionsFromTo.$lt = value2;
    }
    return conditionsFromTo;
}
/**
 * パフォーマンス情報取得
 *
 * @param {any} conditions
 * @param {number} limit
 * @param {number} page
 * @return {any}
 */
function getPerformances(conditions, limit, page) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield ttts_domain_1.Models.Performance
            .find({ $and: conditions })
            .sort({
            day: -1,
            start_time: 1
        })
            .skip(limit * (page - 1))
            .limit(limit)
            .exec();
    });
}
/**
 * 予約情報取得
 *
 * @param {any} conditions
 * @param {any} performances
 * @return {any}
 */
function getResevations(conditions, performances) {
    return __awaiter(this, void 0, void 0, function* () {
        const info = { dicReservations: {} };
        // 予約情報取得
        // { performanceId : [reservation1,reservationn] }
        conditions.status = ttts_domain_1.ReservationUtil.STATUS_RESERVED;
        conditions.purchaser_group = ttts_domain_1.ReservationUtil.PURCHASER_GROUP_CUSTOMER;
        const dicReservations = {};
        const promises = performances.map((performance) => __awaiter(this, void 0, void 0, function* () {
            // パフォーマンスごとに予約情報取得
            const key = performance._id.toString();
            conditions.performance = key;
            dicReservations[key] = yield ttts_domain_1.Models.Reservation.find(conditions).exec();
        }));
        yield Promise.all(promises);
        info.dicReservations = dicReservations;
        return info;
    });
}
/**
 * 表示一覧取得
 *
 * @param {any} performances
 * @param {any} infoR
 * @return {any}
 */
function getSuspensionList(performances, infoR) {
    const suspensionList = [];
    for (const performance of performances) {
        // 予約情報がない時のため、予約関連項目はここで初期化
        const suspension = {};
        const performanceId = performance._id.toString();
        // パフォーマンスIDの並列
        suspension.performance_id = performanceId;
        // 対象ツアー年月日
        suspension.performance_day = moment(performance.day, 'YYYYMMDD').format('YYYY/MM/DD');
        // 対象ツアーNo
        suspension.tour_number = performance.ttts_extension.tour_number === '' ?
            EMPTY_STRING : performance.ttts_extension.tour_number;
        // 運転状況
        suspension.ev_service_status = performance.ttts_extension.ev_service_status;
        // 運転状況(名称)
        suspension.ev_service_status_name = EV_SERVICE_STATUS_NAMES[performance.ttts_extension.ev_service_status];
        // 販売停止処理日時
        suspension.online_sales_update_at = performance.ttts_extension.online_sales_update_at;
        // 処理実施者
        suspension.online_sales_update_user = performance.ttts_extension.online_sales_update_user;
        // 一般予約数
        suspension.canceled = infoR.dicReservations[performanceId].length;
        // 来塔数
        suspension.arrived = getArrivedCount(infoR.dicReservations[performanceId]);
        // 返金状態
        suspension.refund_status = performance.ttts_extension.refund_status;
        // 返金状態(名称)
        suspension.refund_status_name = REFUND_STATUS_NAMES[performance.ttts_extension.refund_status];
        // 返金済数
        suspension.refunded = performance.ttts_extension.refunded_count;
        // 一覧に追加
        suspensionList.push(suspension);
    }
    return suspensionList;
}
/**
 * 来塔数取得
 *
 * @param {any} reservations
 * @return {number}
 */
function getArrivedCount(reservations) {
    let cnt = 0;
    for (const reservation of reservations) {
        if (reservation.checkins.length > 0) {
            cnt += 1;
        }
    }
    return cnt;
}
/**
 * 返金処理(api)
 *
 */
function refundProcess(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        try {
            // パフォーマンスIDセット
            const performanceId = (!_.isEmpty(req.body.performanceId)) ? req.body.performanceId : null;
            if (performanceId === null) {
                res.json({
                    success: false,
                    message: 'req.body.performanceId is empty.'
                });
                return;
            }
            // パフォーマンスと予約情報の返金ステータス更新(指示済に)
            yield updateRefundStatus(performanceId, req.staffUser.username);
            res.json({
                success: true,
                message: null
            });
        }
        catch (error) {
            res.json({
                success: false,
                message: error.message
            });
        }
    });
}
exports.refundProcess = refundProcess;
/**
 * パフォーマンス・予約情報返金ステータス更新
 *
 * @param {string} performanceId
 * @param {string} staffUser
 */
function updateRefundStatus(performanceId, staffUser) {
    return __awaiter(this, void 0, void 0, function* () {
        // 返金対象予約情報取得(入塔記録のない、未指示データ)
        const info = yield suspensionCommon.getTargetReservationsForRefund([performanceId], ttts_domain_1.PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED, false);
        //対象予約(checkinsのない購入番号)の返金ステータスを更新する。
        const now = moment().format('YYYY/MM/DD HH:mm:ss');
        yield ttts_domain_1.Models.Reservation.update({
            _id: { $in: info.targrtIds }
        }, {
            $set: {
                'performance_ttts_extension.refund_status': ttts_domain_1.PerformanceUtil.REFUND_STATUS.INSTRUCTED,
                'performance_ttts_extension.refund_update_user': staffUser,
                'performance_ttts_extension.refund_update_at': now
            }
        }, {
            multi: true
        }).exec();
        // パフォーマンス更新
        yield ttts_domain_1.Models.Performance.findOneAndUpdate({
            _id: performanceId
        }, {
            $set: {
                'ttts_extension.refunded_count': Object.keys(info.refundedInfo).length,
                'ttts_extension.refund_status': ttts_domain_1.PerformanceUtil.REFUND_STATUS.INSTRUCTED,
                'ttts_extension.refund_update_user': staffUser,
                'ttts_extension.refund_update_at': now
            }
        }, {
            new: true
        }).exec();
    });
}
