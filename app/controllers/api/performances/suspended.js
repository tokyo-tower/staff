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
const EV_SERVICE_STATUS_NAMES = {};
EV_SERVICE_STATUS_NAMES[ttts.factory.performance.EvServiceStatus.Normal] = EMPTY_STRING;
EV_SERVICE_STATUS_NAMES[ttts.factory.performance.EvServiceStatus.Slowdown] = '減速';
EV_SERVICE_STATUS_NAMES[ttts.factory.performance.EvServiceStatus.Suspended] = '停止';
const REFUND_STATUS_NAMES = {};
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.None] = EMPTY_STRING;
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.NotInstructed] = '未指示';
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.Instructed] = '指示済';
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.Compeleted] = '返金済';
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
        conditions.push({ 'ttts_extension.online_sales_status': ttts.factory.performance.OnlineSalesStatus.Suspended });
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
            .exec();
        debug('suspended performances found.', performances);
        return Promise.all(performances.map((performance) => __awaiter(this, void 0, void 0, function* () {
            const performanceId = performance.id;
            // パフォーマンスに対する予約数
            const numberOfReservations = yield reservationRepo.reservationModel.count({
                purchaser_group: ttts.factory.person.Group.Customer,
                performance: performanceId
            }).exec();
            // 未入場の予約数
            const nubmerOfUncheckedReservations = yield reservationRepo.reservationModel.count({
                purchaser_group: ttts.factory.person.Group.Customer,
                performance: performanceId,
                checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
            }).exec();
            const extension = performance.get('ttts_extension');
            return {
                performance_id: performanceId,
                performance_day: moment(performance.get('day'), 'YYYYMMDD').format('YYYY/MM/DD'),
                tour_number: extension.tour_number === '' ? EMPTY_STRING : extension.tour_number,
                ev_service_status: extension.ev_service_status,
                ev_service_status_name: EV_SERVICE_STATUS_NAMES[extension.ev_service_status],
                online_sales_update_at: extension.online_sales_update_at,
                online_sales_update_user: extension.online_sales_update_user,
                canceled: numberOfReservations,
                arrived: numberOfReservations - nubmerOfUncheckedReservations,
                refund_status: extension.refund_status,
                refund_status_name: REFUND_STATUS_NAMES[extension.refund_status],
                refunded: extension.refunded_count
            };
        })));
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
