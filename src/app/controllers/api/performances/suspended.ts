/**
 * 販売停止パフォーマンスAPIコントローラー
 */
import * as cinerinoapi from '@cinerino/sdk';
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import * as createDebug from 'debug';
import * as Email from 'email-templates';
import { Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR, NO_CONTENT } from 'http-status';
// @ts-ignore
import * as difference from 'lodash.difference';
// @ts-ignore
import * as uniq from 'lodash.uniq';
import * as moment from 'moment-timezone';
import * as numeral from 'numeral';

const debug = createDebug('ttts-staff:controllers');

const EMPTY_STRING: string = '-';
// const EV_SERVICE_STATUS_NAMES: any = {
// };
// EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Normal] = EMPTY_STRING;
// EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Slowdown] = '一時休止';
// EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Suspended] = '完全中止';
const REFUND_STATUS_NAMES: any = {
};
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.None] = EMPTY_STRING;
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.NotInstructed] = '未指示';
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.Instructed] = '指示済';
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.Compeleted] = '返金済';

if (process.env.API_CLIENT_ID === undefined) {
    throw new Error('Please set an environment variable \'API_CLIENT_ID\'');
}
const POS_CLIENT_IDS = (typeof process.env.POS_CLIENT_ID === 'string')
    ? process.env.POS_CLIENT_ID.split(',')
    : [];
const FRONTEND_CLIENT_IDS = (typeof process.env.FRONTEND_CLIENT_ID === 'string')
    ? process.env.FRONTEND_CLIENT_ID.split(',')
    : [];

/**
 * 販売中止一覧検索(api)
 */
export async function searchSuspendedPerformances(req: Request, res: Response): Promise<void> {
    // tslint:disable-next-line:no-magic-numbers
    const limit: number = (typeof req.query.limit === 'string' && req.query.limit.length > 0) ? Number(req.query.limit) : 10;
    const page: number = (typeof req.query.page === 'string' && req.query.page.length > 0) ? Number(req.query.page) : 1;

    // 入力値またはnull取得
    const getValue = (value: string | null) => {
        return (typeof value === 'string' && value.length > 0) ? value : null;
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
        eventStatus: {
            $in: [tttsapi.factory.chevre.eventStatusType.EventCancelled, tttsapi.factory.chevre.eventStatusType.EventPostponed]
        },
        ttts_extension: {
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
    tour_number?: string;
    // 運転状況
    ev_service_status?: string;
    // 運転状況(名称)
    ev_service_status_name?: string;
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
    // const reservationService = new tttsapi.service.Reservation({
    //     endpoint: <string>process.env.API_ENDPOINT,
    //     auth: req.tttsAuthClient
    // });

    debug('finfing performances...', conditions);
    const searchResults = await eventService.search({
        ...conditions,
        ...{
            countDocuments: '1',
            useExtension: '1'
        }
    });
    const performances = searchResults.data.data;

    const totalCount = <number>searchResults.totalCount;
    const results: ISuspendedPerformances[] = [];

    for (const performance of performances) {
        let numberOfReservations = 0;
        let nubmerOfCheckedReservations = 0;

        const extension = performance.ttts_extension;

        // 時点での予約
        let reservationsAtLastUpdateDate = extension?.reservationsAtLastUpdateDate;
        if (Array.isArray(reservationsAtLastUpdateDate)) {
            reservationsAtLastUpdateDate = reservationsAtLastUpdateDate
                .filter((r) => r.status === tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed) // 確定ステータス
                .filter((r) => FRONTEND_CLIENT_IDS.indexOf(r.transaction_agent?.id) >= 0); // frontendアプリケーションでの購入

            numberOfReservations = reservationsAtLastUpdateDate.length;

            // 時点での予約が存在していれば、そのうちの未入場数を検索
            if (numberOfReservations > 0) {
                const targetReservationIds = reservationsAtLastUpdateDate.map((r) => r.id);

                // その都度、予約検索する場合はコチラ↓
                // const searchReservationsResult = await reservationService.search({
                //     limit: 1,
                //     typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
                //     ids: targetReservationIds,
                //     checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
                // });
                // const nubmerOfUncheckedReservations = <number>searchReservationsResult.totalCount;
                // nubmerOfCheckedReservations = numberOfReservations - nubmerOfUncheckedReservations;

                // performanceに保管された入場済予約から算出する場合はコチラ↓
                const checkedReservations: any[] = (<any>extension)?.checkedReservations;
                if (Array.isArray(checkedReservations)) {
                    nubmerOfCheckedReservations = checkedReservations.filter((r) => targetReservationIds.includes(String(r.id))).length;
                }
            }
        }

        const tourNumber = performance.additionalProperty?.find((p) => p.name === 'tourNumber')?.value;

        // let evServiceStatus = tttsapi.factory.performance.EvServiceStatus.Normal;
        let evServiceStatusName: string = EMPTY_STRING;
        switch (performance.eventStatus) {
            case cinerinoapi.factory.chevre.eventStatusType.EventCancelled:
                // evServiceStatus = tttsapi.factory.performance.EvServiceStatus.Suspended;
                evServiceStatusName = '完全中止';
                break;
            case cinerinoapi.factory.chevre.eventStatusType.EventPostponed:
                // evServiceStatus = tttsapi.factory.performance.EvServiceStatus.Slowdown;
                evServiceStatusName = '一時休止';
                break;
            case cinerinoapi.factory.chevre.eventStatusType.EventScheduled:
                break;

            default:
        }

        results.push({
            performance_id: performance.id,
            performance_day: moment(performance.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD'),
            start_time: moment(performance.startDate).tz('Asia/Tokyo').format('HHmm'),
            end_time: moment(performance.endDate).tz('Asia/Tokyo').format('HHmm'),
            start_date: performance.startDate,
            end_date: performance.endDate,
            tour_number: tourNumber,
            // ev_service_status: evServiceStatus,
            ev_service_status_name: evServiceStatusName,
            online_sales_update_at: extension?.online_sales_update_at,
            online_sales_update_user: extension?.online_sales_update_user,
            canceled: numberOfReservations,
            arrived: nubmerOfCheckedReservations,
            refund_status: extension?.refund_status,
            refund_status_name: (extension?.refund_status !== undefined) ? REFUND_STATUS_NAMES[extension.refund_status] : undefined,
            refunded: extension?.refunded_count
        });

        // レート制限に考慮して、やや時間をおく
        await new Promise((resolve) => {
            setTimeout(
                () => {
                    resolve();
                },
                // tslint:disable-next-line:no-magic-numbers
                300
            );
        });
    }

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

        const performanceId = req.params.performanceId;

        // 返金対象注文を抽出する
        const returningOrders = await searchOrderNumberss4refund(req, performanceId, [...FRONTEND_CLIENT_IDS, ...POS_CLIENT_IDS]);

        // パフォーマンス返金ステータス調整
        await eventService.updateExtension({
            id: performanceId,
            refundStatus: tttsapi.factory.performance.RefundStatus.Instructed,
            refundStatusUpdateAt: new Date(),
            ...{
                refundCount: 0, // 返金済数は最初0
                unrefundCount: returningOrders.length // 未返金数をセット
            }
        });

        await processReturnOrders({
            req: req,
            agentId: <string>process.env.API_CLIENT_ID,
            orders: returningOrders
        });

        res.status(NO_CONTENT)
            .end();
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            errors: [
                { message: error.message }
            ]
        });
    }
}

async function searchOrderNumberss4refund(
    req: Request,
    performanceId: string,
    /**
     * 返品対象の注文クライアントID
     */
    clientIds: string[]
): Promise<cinerinoapi.factory.order.IOrder[]> {
    const reservationService = new tttsapi.service.Reservation({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    // パフォーマンスに対する取引リストを、予約コレクションから検索する
    let reservations: tttsapi.factory.reservation.event.IReservation[] = [];
    if (clientIds.length > 0) {
        const searchReservationsResult = await reservationService.search(
            {
                limit: 100,
                typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
                reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed],
                reservationFor: { id: performanceId },
                underName: {
                    identifiers: clientIds.map((clientId) => {
                        return { name: 'clientId', value: clientId };
                    })
                },
                ...{
                    noTotalCount: '1'
                }
            }
        );

        reservations = searchReservationsResult.data;
    }

    // 入場履歴なしの注文番号を取り出す
    let orderNumbers = reservations.map((r) => r.underName?.identifier?.find((p) => p.name === 'orderNumber')?.value);
    const orderNumbersWithCheckins = reservations
        .filter((r) => (r.checkins.length > 0))
        .map((r) => r.underName?.identifier?.find((p) => p.name === 'orderNumber')?.value);
    orderNumbers = uniq(difference(orderNumbers, orderNumbersWithCheckins));

    const returningOrderNumbers = <string[]>orderNumbers.filter((orderNumber) => typeof orderNumber === 'string');

    const orderService = new cinerinoapi.service.Order({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const searchOrdersResult = await orderService.search({
        limit: 100,
        orderNumbers: returningOrderNumbers
    });

    return searchOrdersResult.data;
}

async function processReturnOrders(params: {
    req: Request;
    orders: cinerinoapi.factory.order.IOrder[];
    agentId: string;
}) {
    const returnOrderService = new cinerinoapi.service.transaction.ReturnOrder({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: params.req.tttsAuthClient
    });

    const returnableOrders: cinerinoapi.factory.transaction.returnOrder.IReturnableOrder[] = [];
    const returnOrderActions: cinerinoapi.factory.transaction.returnOrder.IReturnOrderActionParams[] = [];

    await Promise.all(params.orders.map(async (order) => {
        // 返品メール作成
        const emailCustomization = await createEmailMessage4sellerReason(order);

        const paymentMethods = order.paymentMethods;
        const refundCreditCardActionsParams: cinerinoapi.factory.transaction.returnOrder.IRefundCreditCardParams[] =
            paymentMethods
                .filter((p) => p.typeOf === cinerinoapi.factory.paymentMethodType.CreditCard)
                .map((p) => {
                    return {
                        object: {
                            object: [{
                                paymentMethod: {
                                    paymentMethodId: p.paymentMethodId
                                }
                            }]
                        },
                        potentialActions: {
                            sendEmailMessage: {
                                object: {
                                    sender: emailCustomization.sender,
                                    toRecipient: emailCustomization.toRecipient,
                                    about: emailCustomization.about,
                                    text: emailCustomization.text
                                }
                            }
                        }
                    };
                })
            ;

        returnableOrders.push({ orderNumber: order.orderNumber });
        returnOrderActions.push({
            object: { orderNumber: order.orderNumber },
            potentialActions: {
                refundCreditCard: refundCreditCardActionsParams
            }
        });
    }));

    const returnOrderTransaction = await returnOrderService.start({
        expires: moment()
            .add(1, 'minute')
            .toDate(),
        object: {
            order: returnableOrders
        },
        agent: {
            identifier: [
                { name: 'reason', value: cinerinoapi.factory.transaction.returnOrder.Reason.Seller }
            ],
            ...{
                typeOf: cinerinoapi.factory.personType.Person,
                id: params.agentId
            }
        }
    });
    await returnOrderService.confirm({
        id: returnOrderTransaction.id,
        potentialActions: {
            returnOrder: returnOrderActions
        }
    });
}

export type ICompoundPriceSpecification = cinerinoapi.factory.chevre.compoundPriceSpecification.IPriceSpecification<any>;

function getUnitPriceByAcceptedOffer(offer: cinerinoapi.factory.order.IAcceptedOffer<any>) {
    let unitPrice: number = 0;

    if (offer.priceSpecification !== undefined) {
        const priceFromUnitPriceSpec = (<ICompoundPriceSpecification>offer.priceSpecification).priceComponent?.find(
            (c) => c.typeOf === cinerinoapi.factory.chevre.priceSpecificationType.UnitPriceSpecification
        )?.price;
        if (typeof priceFromUnitPriceSpec === 'number') {
            unitPrice = priceFromUnitPriceSpec;
        }
    } else if (typeof offer.price === 'number') {
        unitPrice = offer.price;
    }

    return unitPrice;
}

/**
 * 販売者都合での返品メール作成
 */
async function createEmailMessage4sellerReason(
    order: cinerinoapi.factory.order.IOrder
): Promise<cinerinoapi.factory.creativeWork.message.email.IAttributes> {
    const reservation = <cinerinoapi.factory.order.IReservation>order.acceptedOffers[0].itemOffered;

    const email = new Email({
        views: { root: `${__dirname}/../../../../../emails` },
        message: {},
        // uncomment below to send emails in development/test env:
        // send: true
        transport: {
            jsonTransport: true
        }
        // htmlToText: false
    });

    // 券種ごとに合計枚数算出
    const ticketInfos: {
        [ticketTypeId: string]: {
            name: {
                ja?: string;
                en?: string;
            };
            charge: string;
            count: number;
        };
    } = {};
    order.acceptedOffers.forEach((o) => {
        const r = <cinerinoapi.factory.order.IReservation>o.itemOffered;
        const unitPrice = getUnitPriceByAcceptedOffer(o);

        // チケットタイプごとにチケット情報セット
        if (ticketInfos[<string>r.reservedTicket.ticketType.id] === undefined) {
            ticketInfos[<string>r.reservedTicket.ticketType.id] = {
                name: <cinerinoapi.factory.chevre.multilingualString>r.reservedTicket.ticketType.name,
                charge: `\\${numeral(unitPrice).format('0,0')}`,
                count: 0
            };
        }

        ticketInfos[<string>r.reservedTicket.ticketType.id].count += 1;
    });
    // 券種ごとの表示情報編集 (sort順を変えないよう同期Loop:"for of")
    const ticketInfoJa = Object.keys(ticketInfos).map((ticketTypeId) => {
        const ticketInfo = ticketInfos[ticketTypeId];

        return `${ticketInfo.name.ja} ${ticketInfo.charge} × ${ticketInfo.count}枚`;
    }).join('\n');
    const ticketInfoEn = Object.keys(ticketInfos).map((ticketTypeId) => {
        const ticketInfo = ticketInfos[ticketTypeId];

        return `${ticketInfo.name.en} ${ticketInfo.charge} × ${ticketInfo.count} ticket(s)`;
    }).join('\n');

    const paymentNo = order.confirmationNumber;

    const message = await email.render('returnOrderBySeller', {
        purchaserNameJa: `${order.customer.familyName} ${order.customer.givenName}`,
        purchaserNameEn: order.customer.name,
        paymentNo: paymentNo,
        day: moment(reservation.reservationFor.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD'),
        startTime: moment(reservation.reservationFor.startDate).tz('Asia/Tokyo').format('HH:mm'),
        amount: numeral(order.price).format('0,0'),
        numberOfReservations: order.acceptedOffers.length,
        ticketInfoJa,
        ticketInfoEn
    });

    return {
        typeOf: cinerinoapi.factory.chevre.creativeWorkType.EmailMessage,
        sender: {
            typeOf: cinerinoapi.factory.chevre.organizationType.Corporation,
            name: 'Tokyo Tower TOP DECK TOUR Online Ticket',
            email: 'noreply@tokyotower.co.jp'
        },
        toRecipient: {
            typeOf: cinerinoapi.factory.personType.Person,
            name: (order.customer.name !== undefined) ? String(order.customer.name) : '',
            email: (order.customer.email !== undefined) ? order.customer.email : ''
        },
        about: '東京タワートップデッキツアー 返金完了のお知らせ (Payment Refund Notification for the Tokyo Tower Top Deck Tour)',
        text: message
    };
}
