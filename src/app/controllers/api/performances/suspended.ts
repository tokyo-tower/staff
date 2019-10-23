/**
 * 販売停止パフォーマンスAPIコントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as createDebug from 'debug';
import { Request, Response } from 'express';
import { CREATED, INTERNAL_SERVER_ERROR } from 'http-status';
import * as moment from 'moment-timezone';
import * as _ from 'underscore';

const debug = createDebug('ttts-staff:controllers');

const EMPTY_STRING: string = '-';
const EV_SERVICE_STATUS_NAMES: any = {
};
EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Normal] = EMPTY_STRING;
EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Slowdown] = '一時休止';
EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Suspended] = '完全中止';
const REFUND_STATUS_NAMES: any = {
};
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.None] = EMPTY_STRING;
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.NotInstructed] = '未指示';
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.Instructed] = '指示済';
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.Compeleted] = '返金済';

if (process.env.API_CLIENT_ID === undefined) {
    throw new Error('Please set an environment variable \'API_CLIENT_ID\'');
}
const POS_CLIENT_ID = <string>process.env.POS_CLIENT_ID;
const FRONTEND_CLIENT_ID = <string>process.env.FRONTEND_CLIENT_ID;
if (FRONTEND_CLIENT_ID === undefined) {
    throw new Error('Please set an environment variable \'FRONTEND_CLIENT_ID\'');
}

/**
 * 販売中止一覧検索(api)
 */
export async function searchSuspendedPerformances(req: Request, res: Response): Promise<void> {
    // tslint:disable-next-line:no-magic-numbers
    const limit: number = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, 10) : 10;
    // tslint:disable-next-line:no-magic-numbers
    const page: number = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, 10) : 1;

    // 入力値またはnull取得
    const getValue = (value: string | null) => {
        return (!_.isEmpty(value)) ? value : null;
    };
    // 販売停止処理日
    const day1: string | null = getValue(req.query.input_onlinedate1);
    const day2: string | null = getValue(req.query.input_onlinedate2);
    // 対象ツアー年月日
    const performanceDate1: string | null = getValue(req.query.input_performancedate1);
    const performanceDate2: string | null = getValue(req.query.input_performancedate2);
    // 返金ステータス
    const refundStatus: string | null = getValue(req.query.refund_status);

    // 検索条件を作成
    const searchConditions: tttsapi.factory.performance.ISearchConditions = {
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
                ? {
                    ...(day1 !== null)
                        ? { $gte: moment(`${day1}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate() }
                        : undefined,
                    ...(day2 !== null)
                        ? { $lt: moment(`${day2}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').add(1, 'day').toDate() }
                        : undefined
                }
                : undefined,
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
        const { results, totalCount } = await findSuspendedPerformances(req, searchConditions);
        res.header('X-Total-Count', totalCount.toString());
        res.json(results);
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            errors: [{
                message: error.message
            }]
        });
    }
}

export interface ISuspendedPerformances {
    performance_id: string;
    // 対象ツアー年月日
    performance_day: string;
    start_time: string;
    end_time: string;
    start_date: Date;
    end_date: Date;
    // 対象ツアーNo
    tour_number: string;
    // 運転状況
    ev_service_status: string;
    // 運転状況(名称)
    ev_service_status_name: string;
    // 販売停止処理日時
    online_sales_update_at?: Date;
    // 処理実施者
    online_sales_update_user?: string;
    // 一般予約数
    canceled: number;
    // 来塔数
    arrived: number;
    // 返金状態
    refund_status?: string;
    // 返金状態(名称)
    refund_status_name?: string;
    // 返金済数
    refunded?: number;
}

/**
 * 表示一覧取得
 */
// tslint:disable-next-line:max-func-body-length
async function findSuspendedPerformances(req: Request, conditions: tttsapi.factory.performance.ISearchConditions): Promise<{
    totalCount: number;
    results: ISuspendedPerformances[];
}> {
    const eventService = new tttsapi.service.Event({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const reservationService = new tttsapi.service.Reservation({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    debug('finfing performances...', conditions);
    const searchResults = await eventService.searchPerformances(conditions);
    debug('suspended performances found.', searchResults);
    const performances = searchResults.data.data;

    const totalCount = searchResults.totalCount;
    debug(totalCount, 'total results.');

    const results = await Promise.all(performances.map(async (performance) => {
        // パフォーマンスに対する予約数
        let searchReservationsResult = await reservationService.search({
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
        searchReservationsResult = await reservationService.search({
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
                searchReservationsResult = await reservationService.search({
                    limit: 1,
                    typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
                    ids: reservationsAtLastUpdateDate.map((r) => r.id),
                    checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
                });
                nubmerOfUncheckedReservations = searchReservationsResult.totalCount;
            }
        }

        let tourNumber: string = (<any>performance).tourNumber; // 古いデーターに対する互換性対応
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
    }));

    return { results, totalCount };
}

/**
 * 返金処理(api)
 */
export async function returnOrders(req: Request, res: Response): Promise<void> {
    try {
        const eventService = new tttsapi.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const taskService = new tttsapi.service.Task({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });

        const performanceId = req.params.performanceId;

        // パフォーマンス終了済かどうか確認
        const performance = await eventService.findPerofrmanceById({ id: performanceId });
        debug('starting returnOrders by performance...', performance.id);
        const now = moment();
        const endDate = moment(performance.endDate);
        debug(now, endDate);
        if (endDate >= now) {
            throw new Error('上映が終了していないので返品処理を実行できません。');
        }

        const task = await taskService.create({
            project: { typeOf: 'Project', id: <string>process.env.PROJECT_ID },
            name: <any>tttsapi.factory.taskName.ReturnOrdersByPerformance,
            status: tttsapi.factory.taskStatus.Ready,
            runsAt: new Date(), // なるはやで実行
            remainingNumberOfTries: 10,
            numberOfTried: 0,
            executionResults: [],
            data: {
                credentials: req.tttsAuthClient.credentials,
                agentId: <string>process.env.API_CLIENT_ID,
                performanceId: performanceId,
                // 返品対象の注文クライアントID
                clientIds: [FRONTEND_CLIENT_ID, POS_CLIENT_ID],
                potentialActions: {
                    returnOrder: {
                        potentialActions: {
                            cancelReservation: [{
                                potentialActions: {
                                    cancelReservation: {
                                        potentialActions: {
                                            informReservation: [
                                                {
                                                    recipient: {
                                                        url: `${<string>process.env.API_ENDPOINT}/webhooks/onReservationCancelled`
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                }
                            }],
                            informOrder: [
                                { recipient: { url: `${<string>process.env.API_ENDPOINT}/webhooks/onReturnOrder` } }
                            ]
                        }
                    }
                }
            }
        });
        debug('returnAllByPerformance task created.', task);

        res.status(CREATED)
            .json(task);
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            errors: [
                { message: error.message }
            ]
        });
    }
}
