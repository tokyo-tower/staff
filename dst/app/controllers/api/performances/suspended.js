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
 * 販売停止パフォーマンスAPIコントローラー
 */
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const _ = require("underscore");
const debug = createDebug('ttts-staff:controllers');
const EMPTY_STRING = '-';
const EV_SERVICE_STATUS_NAMES = {};
EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Normal] = EMPTY_STRING;
EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Slowdown] = '一時休止';
EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Suspended] = '完全中止';
const REFUND_STATUS_NAMES = {};
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.None] = EMPTY_STRING;
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.NotInstructed] = '未指示';
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.Instructed] = '指示済';
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.Compeleted] = '返金済';
if (process.env.API_CLIENT_ID === undefined) {
    throw new Error('Please set an environment variable \'API_CLIENT_ID\'');
}
const POS_CLIENT_ID = process.env.POS_CLIENT_ID;
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
        const searchConditions = {
            limit: limit,
            page: page,
            sort: {
                startDate: -1
                // day: -1,
                // start_time: 1
            },
            ttts_extension: {
                online_sales_status: tttsapi.factory.performance.OnlineSalesStatus.Suspended,
                online_sales_update_at: (day1 !== null || day2 !== null)
                    ? Object.assign({}, (day1 !== null)
                        ? { $gte: moment(`${day1}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate() }
                        : undefined, (day2 !== null)
                        ? { $lt: moment(`${day2}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').add(1, 'day').toDate() }
                        : undefined) : undefined,
                refund_status: (refundStatus !== null) ? refundStatus : undefined
            },
            startFrom: (performanceDate1 !== null)
                ? moment(`${performanceDate1}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ')
                    .toDate()
                : undefined,
            startThrough: (performanceDate2 !== null)
                ? moment(`${performanceDate2}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ')
                    .add(1, 'day')
                    .toDate()
                : undefined
        };
        try {
            // 販売停止パフォーマンス情報を検索
            const { results, totalCount } = yield findSuspendedPerformances(req, searchConditions);
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
// tslint:disable-next-line:max-func-body-length
function findSuspendedPerformances(req, conditions) {
    return __awaiter(this, void 0, void 0, function* () {
        const eventService = new tttsapi.service.Event({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const reservationService = new tttsapi.service.Reservation({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        debug('finfing performances...', conditions);
        const searchResults = yield eventService.searchPerformances(conditions);
        debug('suspended performances found.', searchResults);
        const performances = searchResults.data.data;
        const totalCount = searchResults.totalCount;
        debug(totalCount, 'total results.');
        const results = yield Promise.all(performances.map((performance) => __awaiter(this, void 0, void 0, function* () {
            // パフォーマンスに対する予約数
            let searchReservationsResult = yield reservationService.search({
                limit: 1,
                typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
                // クライアントがfrontend or pos
                underName: {
                    identifiers: [
                        { name: 'clientId', value: POS_CLIENT_ID },
                        { name: 'clientId', value: FRONTEND_CLIENT_ID }
                    ]
                },
                // purchaser_group: tttsapi.factory.person.Group.Customer,
                reservationFor: {
                    id: performance.id
                }
            });
            let numberOfReservations = searchReservationsResult.totalCount;
            // 未入場の予約数
            searchReservationsResult = yield reservationService.search({
                limit: 1,
                typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
                // クライアントがfrontend or pos
                underName: {
                    identifiers: [
                        { name: 'clientId', value: POS_CLIENT_ID },
                        { name: 'clientId', value: FRONTEND_CLIENT_ID }
                    ]
                },
                reservationFor: {
                    id: performance.id
                },
                checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
            });
            let nubmerOfUncheckedReservations = searchReservationsResult.totalCount;
            const extension = performance.extension;
            // 時点での予約
            let reservationsAtLastUpdateDate = extension.reservationsAtLastUpdateDate;
            if (reservationsAtLastUpdateDate !== undefined) {
                reservationsAtLastUpdateDate = reservationsAtLastUpdateDate
                    .filter((r) => r.status === tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed) // 確定ステータス
                    // .filter((r) => r.purchaser_group === tttsapi.factory.person.Group.Customer) // 購入者一般
                    // frontendアプリケーションでの購入
                    .filter((r) => r.transaction_agent !== undefined
                    && r.transaction_agent !== null
                    && r.transaction_agent.id === FRONTEND_CLIENT_ID);
                numberOfReservations = reservationsAtLastUpdateDate.length;
                // 時点での予約が存在していれば、そのうちの未入場数を検索
                if (numberOfReservations > 0) {
                    searchReservationsResult = yield reservationService.search({
                        limit: 1,
                        typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
                        ids: reservationsAtLastUpdateDate.map((r) => r.id),
                        checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
                    });
                    nubmerOfUncheckedReservations = searchReservationsResult.totalCount;
                }
            }
            let tourNumber = performance.tourNumber; // 古いデーターに対する互換性対応
            if (performance.additionalProperty !== undefined) {
                const tourNumberProperty = performance.additionalProperty.find((p) => p.name === 'tourNumber');
                if (tourNumberProperty !== undefined) {
                    tourNumber = tourNumberProperty.value;
                }
            }
            return {
                performance_id: performance.id,
                performance_day: moment(performance.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD'),
                start_time: moment(performance.startDate).tz('Asia/Tokyo').format('HHmm'),
                end_time: moment(performance.endDate).tz('Asia/Tokyo').format('HHmm'),
                start_date: performance.startDate,
                end_date: performance.endDate,
                tour_number: tourNumber,
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
            const eventService = new tttsapi.service.Event({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const taskService = new tttsapi.service.Task({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const performanceId = req.params.performanceId;
            // パフォーマンス終了済かどうか確認
            const performance = yield eventService.findPerofrmanceById({ id: performanceId });
            debug('starting returnOrders by performance...', performance.id);
            const now = moment();
            const endDate = moment(performance.endDate);
            debug(now, endDate);
            if (endDate >= now) {
                throw new Error('上映が終了していないので返品処理を実行できません。');
            }
            const task = yield taskService.create({
                project: { typeOf: 'Project', id: process.env.PROJECT_ID },
                name: tttsapi.factory.taskName.ReturnOrdersByPerformance,
                status: tttsapi.factory.taskStatus.Ready,
                runsAt: new Date(),
                remainingNumberOfTries: 10,
                numberOfTried: 0,
                executionResults: [],
                data: {
                    agentId: process.env.API_CLIENT_ID,
                    performanceId: performanceId,
                    // 返品対象の注文クライアントID
                    clientIds: [FRONTEND_CLIENT_ID, POS_CLIENT_ID],
                    potentialActions: {
                        returnOrder: {
                            potentialActions: {
                                cancelReservation: {
                                    potentialActions: {
                                        cancelReservation: {
                                            potentialActions: {
                                                informReservation: [
                                                    {
                                                        recipient: {
                                                            url: `${process.env.API_ENDPOINT}/webhooks/onReservationCancelled`
                                                        }
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                },
                                informOrder: [
                                    { recipient: { url: `${process.env.API_ENDPOINT}/webhooks/onReturnOrder` } }
                                ]
                            }
                        }
                    }
                }
            });
            debug('returnAllByPerformance task created.', task);
            res.status(http_status_1.CREATED)
                .json(task);
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
