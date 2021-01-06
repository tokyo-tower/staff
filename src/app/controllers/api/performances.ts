/**
 * パフォーマンスAPIコントローラー
 */
import * as cinerinoapi from '@cinerino/sdk';
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as createDebug from 'debug';
import * as Email from 'email-templates';
import { Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR, NO_CONTENT } from 'http-status';
import * as moment from 'moment-timezone';
import * as numeral from 'numeral';

import { User } from '../../user';

const debug = createDebug('ttts-staff:controllers');

const POS_CLIENT_IDS = (typeof process.env.POS_CLIENT_ID === 'string')
    ? process.env.POS_CLIENT_ID.split(',')
    : [];
const FRONTEND_CLIENT_IDS = (typeof process.env.FRONTEND_CLIENT_ID === 'string')
    ? process.env.FRONTEND_CLIENT_ID.split(',')
    : [];

export type IReservationOrderItem = cinerinoapi.factory.order.IReservation;
export type ICompoundPriceSpecification = cinerinoapi.factory.chevre.compoundPriceSpecification.IPriceSpecification<any>;

function getUnitPriceByAcceptedOffer(offer: cinerinoapi.factory.order.IAcceptedOffer<any>) {
    let unitPrice: number = 0;

    if (offer.priceSpecification !== undefined) {
        const priceSpecification = <ICompoundPriceSpecification>offer.priceSpecification;
        if (Array.isArray(priceSpecification.priceComponent)) {
            const unitPriceSpec = priceSpecification.priceComponent.find(
                (c) => c.typeOf === cinerinoapi.factory.chevre.priceSpecificationType.UnitPriceSpecification
            );
            if (unitPriceSpec !== undefined && unitPriceSpec.price !== undefined && Number.isInteger(unitPriceSpec.price)) {
                unitPrice = unitPriceSpec.price;
            }
        }
    }

    return unitPrice;
}

/**
 * パフォーマンス検索
 */
export async function search(req: Request, res: Response): Promise<void> {
    try {
        // Cinerinoで検索
        // query:
        // page: 1,
        // day: ymd,
        // noTotalCount: '1',
        // useLegacySearch: '1'
        const day = String(req.query.day);

        const eventService = new cinerinoapi.service.Event({
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const searchResult = await eventService.search({
            limit: 100,
            page: 1,
            typeOf: cinerinoapi.factory.chevre.eventType.ScreeningEvent,
            // tslint:disable-next-line:no-magic-numbers
            startFrom: moment(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00+09:00`)
                .toDate(),
            // tslint:disable-next-line:no-magic-numbers
            startThrough: moment(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T23:59:59+09:00`)
                .toDate(),
            ...{
                $projection: { aggregateReservation: 0 }
            }
        });

        // const performanceService = new tttsapi.service.Event({
        //     endpoint: <string>process.env.API_ENDPOINT,
        //     auth: req.tttsAuthClient
        // });
        // const searchResult = await performanceService.search(req.query);

        const performances = searchResult.data.map((event) => {
            // 一般座席の残席数に変更
            const remainingAttendeeCapacity = event.aggregateOffer?.offers?.find((o) => o.identifier === '001')?.remainingAttendeeCapacity;

            return {
                ...event,
                remainingAttendeeCapacity: (typeof remainingAttendeeCapacity === 'number') ? remainingAttendeeCapacity : '?'
            };
        });

        res.json({ data: performances });
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR)
            .json({
                message: error.message
            });
    }
}

/**
 * 運行・オンライン販売ステータス変更
 */
// tslint:disable-next-line:max-func-body-length
export async function updateOnlineStatus(req: Request, res: Response): Promise<void> {
    try {
        // パフォーマンスIDリストをjson形式で受け取る
        const performanceIds = req.body.performanceIds;
        if (!Array.isArray(performanceIds)) {
            throw new Error('システムエラーが発生しました。ご不便をおかけして申し訳ありませんがしばらく経ってから再度お試しください。');
        }

        // パフォーマンス・予約(入塔記録のないもの)のステータス更新
        const evStatus: cinerinoapi.factory.chevre.eventStatusType = req.body.evStatus;
        const notice: string = req.body.notice;
        debug('updating performances...', performanceIds, evStatus, notice);

        const now = new Date();

        // 返金対象注文情報取得
        const targetOrders = await getTargetReservationsForRefund(req, performanceIds);

        // 返金ステータスセット(運行停止は未指示、減速・再開はNONE)
        const refundStatus: tttsapi.factory.performance.RefundStatus =
            evStatus === cinerinoapi.factory.chevre.eventStatusType.EventCancelled ?
                tttsapi.factory.performance.RefundStatus.NotInstructed :
                tttsapi.factory.performance.RefundStatus.None;

        // パフォーマンス更新
        debug('updating performance online_sales_status...');

        const performanceService = new tttsapi.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const reservationService = new cinerinoapi.service.Reservation({
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const eventService = new cinerinoapi.service.Event({
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });

        const updateUser = (<User>req.staffUser).username;

        for (const performanceId of performanceIds) {
            // Chevreで予約検索(1パフォーマンスに対する予約はmax41件なので、これで十分)
            const searchReservationsResult = await reservationService.search({
                limit: 100,
                typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
                // 確定ステータスのみ保管すればよい
                reservationStatuses: [cinerinoapi.factory.chevre.reservationStatusType.ReservationConfirmed],
                reservationFor: { id: performanceId }
            });

            const reservationsAtLastUpdateDate: tttsapi.factory.performance.IReservationAtLastupdateDate[] =
                searchReservationsResult.data
                    // frontendアプリケーションでの購入のみ保管すればよい
                    .filter((r) => {
                        const clientId = r.underName?.identifier?.find((p) => p.name === 'clientId')?.value;

                        return typeof clientId === 'string' && FRONTEND_CLIENT_IDS.includes(clientId);
                    })
                    .map((r) => {
                        const clientId = r.underName?.identifier?.find((p) => p.name === 'clientId')?.value;

                        return {
                            id: String(r.id),
                            status: <cinerinoapi.factory.chevre.reservationStatusType>r.reservationStatus,
                            transaction_agent: {
                                typeOf: cinerinoapi.factory.personType.Person,
                                id: (typeof clientId === 'string') ? clientId : ''
                            }
                        };
                    });

            await performanceService.updateExtension({
                id: performanceId,
                reservationsAtLastUpdateDate: reservationsAtLastUpdateDate,
                eventStatus: evStatus,
                onlineSalesStatusUpdateUser: updateUser,
                onlineSalesStatusUpdateAt: now,
                evServiceStatusUpdateUser: updateUser,
                evServiceStatusUpdateAt: now,
                refundStatus: refundStatus,
                refundStatusUpdateUser: updateUser,
                refundStatusUpdateAt: now
            });

            let sendEmailMessageParams: cinerinoapi.factory.action.transfer.send.message.email.IAttributes[] = [];

            // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、Cinerinoにメール送信指定
            if (evStatus === cinerinoapi.factory.chevre.eventStatusType.EventCancelled) {
                const targetOrders4performance = targetOrders.filter((o) => {
                    return o.acceptedOffers.some((offer) => {
                        const reservation = <cinerinoapi.factory.order.IReservation>offer.itemOffered;

                        return reservation.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation
                            && reservation.reservationFor.id === performanceId;
                    });
                });
                sendEmailMessageParams = await createEmails(targetOrders4performance, notice);
            }

            // Chevreイベントステータスに反映
            await eventService.updatePartially({
                id: performanceId,
                eventStatus: evStatus,
                ...{
                    onUpdated: {
                        sendEmailMessage: sendEmailMessageParams
                    }
                }
            });
        }

        res.status(NO_CONTENT)
            .end();
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR)
            .json({
                message: error.message
            });
    }
}

/**
 * 返金対象予約情報取得
 * [一般予約]かつ
 * [予約データ]かつ
 * [同一購入単位に入塔記録のない]予約のid配列
 */
// tslint:disable-next-line:max-func-body-length
async function getTargetReservationsForRefund(req: Request, performanceIds: string[]): Promise<cinerinoapi.factory.order.IOrder[]> {
    const orderService = new cinerinoapi.service.Order({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    const reservationService = new cinerinoapi.service.Reservation({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    // const reservationService = new tttsapi.service.Reservation({
    //     endpoint: <string>process.env.API_ENDPOINT,
    //     auth: req.tttsAuthClient
    // });

    let targetReservations:
        cinerinoapi.factory.chevre.reservation.IReservation<cinerinoapi.factory.chevre.reservationType.EventReservation>[] = [];
    const limit4reservations = 100;
    let page4reservations = 0;
    let numData4reservations: number = limit4reservations;
    while (numData4reservations === limit4reservations) {
        page4reservations += 1;
        const searchReservationsResult = await reservationService.search<cinerinoapi.factory.chevre.reservationType.EventReservation>({
            limit: limit4reservations,
            page: page4reservations,
            typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
            reservationStatuses: [cinerinoapi.factory.chevre.reservationStatusType.ReservationConfirmed],
            // クライアントがfrontend or pos
            underName: {
                identifiers: [
                    ...POS_CLIENT_IDS.map((clientId) => {
                        return { name: 'clientId', value: clientId };
                    }),
                    ...FRONTEND_CLIENT_IDS.map((clientId) => {
                        return { name: 'clientId', value: clientId };
                    })
                ]
            },
            reservationFor: {
                ids: performanceIds
            },
            // checkins: { $size: 0 },
            ...{
                $projection: { underName: 1, useActionExists: 1 }
            }
        });
        numData4reservations = searchReservationsResult.data.length;
        targetReservations.push(...searchReservationsResult.data);
    }
    targetReservations = targetReservations.filter((r) => (<any>r).useActionExists !== true);
    // const targetReservations = await reservationService.distinct(
    //     'underName',
    //     {
    //         typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
    //         reservationStatuses: [cinerinoapi.factory.chevre.reservationStatusType.ReservationConfirmed],
    //         // クライアントがfrontend or pos
    //         underName: {
    //             identifiers: [
    //                 ...POS_CLIENT_IDS.map((clientId) => {
    //                     return { name: 'clientId', value: clientId };
    //                 }),
    //                 ...FRONTEND_CLIENT_IDS.map((clientId) => {
    //                     return { name: 'clientId', value: clientId };
    //                 })
    //             ]
    //         },
    //         reservationFor: {
    //             ids: performanceIds
    //         },
    //         checkins: { $size: 0 }
    //     }
    // );
    const targetOrderNumbers = targetReservations.reduce<string[]>(
        (a, b) => {
            const underNameIdentifier = b.underName?.identifier;
            if (Array.isArray(underNameIdentifier)) {
                const orderNumberProperty = underNameIdentifier.find((p) => p.name === 'orderNumber');
                if (orderNumberProperty !== undefined) {
                    a.push(orderNumberProperty.value);
                }
            }

            return a;
        },
        []
    );
    // const targetOrderNumbers = targetReservations.reduce<string[]>(
    //     (a, b) => {
    //         if (Array.isArray(b.identifier)) {
    //             const orderNumberProperty = b.identifier.find((p: any) => p.name === 'orderNumber');
    //             if (orderNumberProperty !== undefined) {
    //                 a.push(orderNumberProperty.value);
    //             }
    //         }

    //         return a;
    //     },
    //     []
    // );

    // 全注文検索
    const orders: cinerinoapi.factory.order.IOrder[] = [];
    if (targetOrderNumbers.length > 0) {
        const limit = 10;
        let page = 0;
        let numData: number = limit;
        while (numData === limit) {
            page += 1;
            const searchOrdersResult = await orderService.search({
                limit: limit,
                page: page,
                orderNumbers: targetOrderNumbers
            });
            numData = searchOrdersResult.data.length;
            orders.push(...searchOrdersResult.data);
        }
    }

    return orders;
}

/**
 * 運行・オンライン販売停止メール作成
 */
async function createEmails(
    orders: cinerinoapi.factory.order.IOrder[],
    notice: string
): Promise<cinerinoapi.factory.action.transfer.send.message.email.IAttributes[]> {
    if (orders.length === 0) {
        return [];
    }

    return Promise.all(orders.map(async (order) => {
        return createEmail(order, notice);
    }));
}

/**
 * 運行・オンライン販売停止メール作成(1通)
 */
async function createEmail(
    order: cinerinoapi.factory.order.IOrder,
    notice: string
): Promise<cinerinoapi.factory.action.transfer.send.message.email.IAttributes> {
    const purchaserNameJp = `${order.customer.familyName} ${order.customer.givenName}`;
    const purchaserName: string = `${purchaserNameJp}様`;
    const purchaserNameEn: string = `Mr./Ms.${<string>order.customer.name}`;
    const paymentTicketInfoText = createPaymentTicketInfoText(order);

    const email = new Email({
        views: { root: `${__dirname}/../../../../emails` },
        message: {},
        // uncomment below to send emails in development/test env:
        // send: true
        transport: {
            jsonTransport: true
        }
        // htmlToText: false
    });

    const content = await email.render('updateEventStatus', {
        purchaserName,
        purchaserNameEn,
        notice,
        paymentTicketInfos: paymentTicketInfoText
    });

    // メール作成
    const emailMessage: cinerinoapi.factory.creativeWork.message.email.ICreativeWork = {
        project: { typeOf: order.project.typeOf, id: order.project.id },
        typeOf: cinerinoapi.factory.chevre.creativeWorkType.EmailMessage,
        identifier: `updateOnlineStatus-${order.orderNumber}`,
        name: `updateOnlineStatus-${order.orderNumber}`,
        sender: {
            typeOf: order.seller.typeOf,
            name: 'Tokyo Tower TOP DECK TOUR Online Ticket',
            email: <string>process.env.EMAIL_SENDER
        },
        toRecipient: {
            typeOf: order.customer.typeOf,
            name: <string>order.customer.name,
            email: <string>order.customer.email
        },
        about: `東京タワートップデッキツアー中止のお知らせ Tokyo Tower Top Deck Tour Cancelled`,
        text: content
    };

    const purpose: cinerinoapi.factory.order.ISimpleOrder = {
        project: { typeOf: order.project.typeOf, id: order.project.id },
        typeOf: order.typeOf,
        seller: order.seller,
        customer: order.customer,
        confirmationNumber: order.confirmationNumber,
        orderNumber: order.orderNumber,
        price: order.price,
        priceCurrency: order.priceCurrency,
        orderDate: moment(order.orderDate)
            .toDate()
    };

    return {
        typeOf: cinerinoapi.factory.actionType.SendAction,
        agent: {
            typeOf: cinerinoapi.factory.personType.Person,
            id: ''
        },
        object: emailMessage,
        project: { typeOf: order.project.typeOf, id: order.project.id },
        purpose: purpose,
        recipient: {
            id: order.customer.id,
            name: emailMessage.toRecipient.name,
            typeOf: order.customer.typeOf
        }
    };
}

function createPaymentTicketInfoText(order: cinerinoapi.factory.order.IOrder): string {
    const reservation = <IReservationOrderItem>order.acceptedOffers[0].itemOffered;

    // ご来塔日時 : 2017/12/10 09:15
    const event = reservation.reservationFor;
    const day: string = moment(event.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD');
    const time: string = moment(event.startDate).tz('Asia/Tokyo').format('HH:mm');

    // 購入番号
    const paymentNo = order.confirmationNumber;

    // 購入チケット情報
    const paymentTicketInfos: string[] = [];

    paymentTicketInfos.push(`購入番号 : ${paymentNo}`);
    paymentTicketInfos.push(`ご予約日時 : ${day} ${time}`);
    paymentTicketInfos.push(`券種 枚数`); // 券種 枚数
    const infos = getTicketInfo(order, 'ja'); // TOP DECKチケット(大人) 1枚
    paymentTicketInfos.push(infos.join('\n'));

    // 英語表記を追加
    paymentTicketInfos.push(''); // 日英の間の改行
    paymentTicketInfos.push(`Purchase Number : ${paymentNo}`);
    paymentTicketInfos.push(`Date/Time of Tour : ${day} ${time}`);
    paymentTicketInfos.push(`Ticket Type Quantity`);
    // TOP DECKチケット(大人) 1枚
    const infosEn = getTicketInfo(order, 'en');
    paymentTicketInfos.push(infosEn.join('\n'));

    return paymentTicketInfos.join('\n');
}

/**
 * チケット情報取得
 */
function getTicketInfo(order: cinerinoapi.factory.order.IOrder, locale: string): string[] {
    const acceptedOffers = order.acceptedOffers;

    // チケットコード順にソート
    acceptedOffers.sort((a, b) => {
        if ((<IReservationOrderItem>a.itemOffered).reservedTicket.ticketType.identifier
            < (<IReservationOrderItem>b.itemOffered).reservedTicket.ticketType.identifier) {
            return -1;
        }
        if ((<IReservationOrderItem>a.itemOffered).reservedTicket.ticketType.identifier
            > (<IReservationOrderItem>b.itemOffered).reservedTicket.ticketType.identifier) {
            return 1;
        }

        return 0;
    });

    // 券種ごとに合計枚数算出
    const ticketInfos: {
        [ticketTypeId: string]: {
            ticket_type_name: string;
            charge: string;
            count: number;
        };
    } = {};

    for (const acceptedOffer of acceptedOffers) {
        // チケットタイプごとにチケット情報セット
        const reservation = <IReservationOrderItem>acceptedOffer.itemOffered;
        const ticketType = reservation.reservedTicket.ticketType;
        const price = getUnitPriceByAcceptedOffer(acceptedOffer);

        if (ticketInfos[ticketType.identifier] === undefined) {
            ticketInfos[ticketType.identifier] = {
                ticket_type_name: (<any>ticketType.name)[locale],
                charge: `\\${numeral(price).format('0,0')}`,
                count: 1
            };
        } else {
            ticketInfos[ticketType.identifier].count += 1;
        }
    }

    // 券種ごとの表示情報編集
    return Object.keys(ticketInfos).map((ticketTypeId) => {
        return `${ticketInfos[ticketTypeId].ticket_type_name} ${ticketInfos[ticketTypeId].count}枚`;
    });
}
