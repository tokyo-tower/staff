"use strict";
/**
 * 販売停止パフォーマンスAPIコントローラー
 * @namespace controllers.api.performances.suspended
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
const moment = require("moment");
const _ = require("underscore");
const debug = createDebug('ttts-staff:controllers:api:performances');
const EMPTY_STRING = '-';
const EV_SERVICE_STATUS_NAMES = { 0: EMPTY_STRING, 1: '減速', 2: '停止' };
const REFUND_STATUS_NAMES = { 0: EMPTY_STRING, 1: '未指示', 2: '指示済', 3: '返金済' };
/**
 * 販売中止一覧検索(api)
 */
function searchSuspendedPerformances(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        // tslint:disable-next-line:no-magic-numbers
        const limit = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, 10) : 10;
        // tslint:disable-next-line:no-magic-numbers
        const page = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, 10) : 1;
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
        conditions.push({ 'ttts_extension.online_sales_status': ttts.PerformanceUtil.ONLINE_SALES_STATUS.SUSPENDED });
        // 販売停止処理日
        if (day1 !== null || day2 !== null) {
            conditions.push({ 'ttts_extension.online_sales_update_at': getConditionsFromTo(day1, day2, true) });
        }
        // 対象ツアー年月日
        if (performanceDate1 !== null || performanceDate2 !== null) {
            conditions.push({ day: getConditionsFromTo(performanceDate1, performanceDate2) });
        }
        // 返金ステータス
        if (refundStatus !== null) {
            conditions.push({ 'ttts_extension.refund_status': refundStatus });
        }
        try {
            // 販売停止パフォーマンス情報を検索
            const suspensionList = yield findSuspendedPerformances(conditions, limit, page);
            res.json(suspensionList);
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
exports.searchSuspendedPerformances = searchSuspendedPerformances;
/**
 * FromTo条件セット
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
 * 表示一覧取得
 */
function findSuspendedPerformances(conditions, limit, page) {
    return __awaiter(this, void 0, void 0, function* () {
        const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const performances = yield performanceRepo.performanceModel
            .find({ $and: conditions })
            .sort({
            day: -1,
            start_time: 1
        })
            .skip(limit * (page - 1))
            .limit(limit)
            .lean()
            .exec();
        debug('suspended performances found.', performances);
        const infoR = {};
        // 予約情報取得
        const dicReservations = {};
        yield Promise.all(performances.map((performance) => __awaiter(this, void 0, void 0, function* () {
            // パフォーマンスごとに予約情報取得
            dicReservations[performance._id.toString()] = yield reservationRepo.reservationModel.find({
                status: ttts.factory.reservationStatusType.ReservationConfirmed,
                purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
                performance: performance._id.toString()
            }).exec();
        })));
        infoR.dicReservations = dicReservations;
        return performances.map((performance) => {
            const performanceId = performance._id.toString();
            return {
                performance_id: performanceId,
                performance_day: moment(performance.day, 'YYYYMMDD').format('YYYY/MM/DD'),
                tour_number: performance.ttts_extension.tour_number === '' ?
                    EMPTY_STRING : performance.ttts_extension.tour_number,
                ev_service_status: performance.ttts_extension.ev_service_status,
                ev_service_status_name: EV_SERVICE_STATUS_NAMES[performance.ttts_extension.ev_service_status],
                online_sales_update_at: performance.ttts_extension.online_sales_update_at,
                online_sales_update_user: performance.ttts_extension.online_sales_update_user,
                canceled: infoR.dicReservations[performanceId].length,
                arrived: infoR.dicReservations[performanceId].filter((r) => r.checkins.length > 0).length,
                refund_status: performance.ttts_extension.refund_status,
                refund_status_name: REFUND_STATUS_NAMES[performance.ttts_extension.refund_status],
                refunded: performance.ttts_extension.refunded_count
            };
        });
    });
}
/**
 * 返金処理(api)
 */
function returnOrders(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // パフォーマンスと予約情報の返金ステータス更新(指示済に)
            const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
            const taskRepo = new ttts.repository.Task(ttts.mongoose.connection);
            const task = yield ttts.service.order.returnAllByPerformance(req.params.performanceId)(performanceRepo, taskRepo);
            debug('returnAllByPerformance task created.', task);
            res.status(http_status_1.CREATED).json(task);
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                errors: [
                    { message: error.message }
                ]
            });
        }
    });
}
exports.returnOrders = returnOrders;
