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
EV_SERVICE_STATUS_NAMES[ttts.factory.performance.EvServiceStatus.Slowdown] = '一時休止';
EV_SERVICE_STATUS_NAMES[ttts.factory.performance.EvServiceStatus.Suspended] = '完全中止';
const REFUND_STATUS_NAMES = {};
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.None] = EMPTY_STRING;
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.NotInstructed] = '未指示';
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.Instructed] = '指示済';
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.Compeleted] = '返金済';
if (process.env.API_CLIENT_ID === undefined) {
    throw new Error('Please set an environment variable \'API_CLIENT_ID\'');
}
const FRONTEND_CLIENT_ID = process.env.FRONTEND_CLIENT_ID;
if (FRONTEND_CLIENT_ID === undefined) {
    throw new Error('Please set an environment variable \'FRONTEND_CLIENT_ID\'');
}
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
            const condition4onlineSalesUpdateAt = {};
            if (day1 !== null) {
                condition4onlineSalesUpdateAt.$gte = moment(`${day1}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate();
            }
            if (day2 !== null) {
                condition4onlineSalesUpdateAt.$lt = moment(`${day2}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').add(1, 'day').toDate();
            }
            conditions.push({ 'ttts_extension.online_sales_update_at': condition4onlineSalesUpdateAt });
        }
        // 対象ツアー年月日
        if (performanceDate1 !== null || performanceDate2 !== null) {
            const condition4performanceDay = {};
            if (performanceDate1 !== null) {
                condition4performanceDay.$gte = performanceDate1;
            }
            if (performanceDate2 !== null) {
                condition4performanceDay.$lte = performanceDate2;
            }
            conditions.push({ day: condition4performanceDay });
        }
        // 返金ステータス
        if (refundStatus !== null) {
            conditions.push({ 'ttts_extension.refund_status': refundStatus });
        }
        try {
            // 販売停止パフォーマンス情報を検索
            const { results, totalCount } = yield findSuspendedPerformances(conditions, limit, page);
            res.header('X-Total-Count', totalCount.toString());
            res.json(results);
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
 * 表示一覧取得
 */
function findSuspendedPerformances(conditions, limit, page) {
    return __awaiter(this, void 0, void 0, function* () {
        const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        debug('finfing performances...', conditions);
        const performances = yield performanceRepo.performanceModel
            .find({ $and: conditions })
            .sort({
            day: -1,
            start_time: 1
        })
            .skip(limit * (page - 1))
            .limit(limit)
            .exec().then((docs) => docs.map((doc) => doc.toObject()));
        debug(performances.length, 'suspended performances found.');
        const totalCount = yield performanceRepo.performanceModel.count({ $and: conditions }).exec();
        debug(totalCount, 'total results.');
        const results = yield Promise.all(performances.map((performance) => __awaiter(this, void 0, void 0, function* () {
            const performanceId = performance.id;
            // パフォーマンスに対する予約数
            let numberOfReservations = yield reservationRepo.reservationModel.count({
                purchaser_group: ttts.factory.person.Group.Customer,
                performance: performanceId
            }).exec();
            // 未入場の予約数
            let nubmerOfUncheckedReservations = yield reservationRepo.reservationModel.count({
                purchaser_group: ttts.factory.person.Group.Customer,
                performance: performanceId,
                checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
            }).exec();
            const extension = performance.ttts_extension;
            // 時点での予約
            let reservationsAtLastUpdateDate = performance.ttts_extension.reservationsAtLastUpdateDate;
            if (reservationsAtLastUpdateDate !== undefined) {
                reservationsAtLastUpdateDate = reservationsAtLastUpdateDate
                    .filter((r) => r.status === ttts.factory.reservationStatusType.ReservationConfirmed) // 確定ステータス
                    .filter((r) => r.purchaser_group === ttts.factory.person.Group.Customer) // 購入者一般
                    .filter((r) => r.transaction_agent !== undefined && r.transaction_agent !== null && r.transaction_agent.id === FRONTEND_CLIENT_ID);
                numberOfReservations = reservationsAtLastUpdateDate.length;
                debug(reservationsAtLastUpdateDate.map((r) => r.id));
                nubmerOfUncheckedReservations = yield reservationRepo.reservationModel.count({
                    _id: { $in: reservationsAtLastUpdateDate.map((r) => r.id) },
                    checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
                }).exec();
            }
            return {
                performance_id: performanceId,
                performance_day: moment(performance.day, 'YYYYMMDD').format('YYYY/MM/DD'),
                start_time: performance.start_time,
                end_time: performance.end_time,
                start_date: performance.start_date,
                end_date: performance.end_date,
                tour_number: performance.tour_number,
                ev_service_status: extension.ev_service_status,
                ev_service_status_name: EV_SERVICE_STATUS_NAMES[extension.ev_service_status],
                online_sales_update_at: extension.online_sales_update_at,
                online_sales_update_user: extension.online_sales_update_user,
                canceled: numberOfReservations,
                arrived: numberOfReservations - nubmerOfUncheckedReservations,
                refund_status: extension.refund_status,
                refund_status_name: (extension.refund_status !== undefined) ? REFUND_STATUS_NAMES[extension.refund_status] : undefined,
                refunded: extension.refunded_count
            };
        })));
        return { results, totalCount };
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
            const task = yield ttts.service.order.returnAllByPerformance(process.env.API_CLIENT_ID, req.params.performanceId)(performanceRepo, taskRepo);
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
