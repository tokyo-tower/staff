/**
 * パフォーマンスAPIコントローラー
 */
import * as cinerinoapi from '@cinerino/sdk';
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as conf from 'config';
import * as createDebug from 'debug';
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

export function getUnitPriceByAcceptedOffer(offer: cinerinoapi.factory.order.IAcceptedOffer<any>) {
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
        const performanceService = new tttsapi.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });

        const searchResult = await performanceService.search(req.query);

        const performances = searchResult.data.data.map((d) => {
            let evServiceStatus = tttsapi.factory.performance.EvServiceStatus.Normal;
            let onlineSalesStatus = tttsapi.factory.performance.OnlineSalesStatus.Normal;

            switch (d.eventStatus) {
                case cinerinoapi.factory.chevre.eventStatusType.EventCancelled:
                    evServiceStatus = tttsapi.factory.performance.EvServiceStatus.Suspended;
                    onlineSalesStatus = tttsapi.factory.performance.OnlineSalesStatus.Suspended;
                    break;
                case cinerinoapi.factory.chevre.eventStatusType.EventPostponed:
                    evServiceStatus = tttsapi.factory.performance.EvServiceStatus.Slowdown;
                    onlineSalesStatus = tttsapi.factory.performance.OnlineSalesStatus.Suspended;
                    break;
                case cinerinoapi.factory.chevre.eventStatusType.EventScheduled:
                    break;

                default:
            }

            return {
                ...d,
                evServiceStatus: evServiceStatus,
                onlineSalesStatus: onlineSalesStatus
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
            throw new Error(req.__('UnexpectedError'));
        }

        // パフォーマンス・予約(入塔記録のないもの)のステータス更新
        const onlineStatus: tttsapi.factory.performance.OnlineSalesStatus = req.body.onlineStatus;
        const evStatus: tttsapi.factory.performance.EvServiceStatus = req.body.evStatus;
        const notice: string = req.body.notice;
        debug('updating performances...', performanceIds, onlineStatus, evStatus, notice);

        const now = new Date();

        // 返金対象注文情報取得
        const targetOrders = await getTargetReservationsForRefund(req, performanceIds);

        // 返金ステータスセット(運行停止は未指示、減速・再開はNONE)
        const refundStatus: tttsapi.factory.performance.RefundStatus =
            evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended ?
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
                reservationStatuses: [cinerinoapi.factory.chevre.reservationStatusType.ReservationConfirmed],
                reservationFor: { id: performanceId }
                // ...{
                //     noTotalCount: '1'
                // }
            });

            const reservationsAtLastUpdateDate: tttsapi.factory.performance.IReservationAtLastupdateDate[] =
                searchReservationsResult.data.map((r) => {
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

            let newEventStatus = cinerinoapi.factory.chevre.eventStatusType.EventScheduled;
            switch (evStatus) {
                case tttsapi.factory.performance.EvServiceStatus.Slowdown:
                    newEventStatus = cinerinoapi.factory.chevre.eventStatusType.EventPostponed;
                    break;

                case tttsapi.factory.performance.EvServiceStatus.Suspended:
                    newEventStatus = cinerinoapi.factory.chevre.eventStatusType.EventCancelled;
                    break;

                default:
            }

            await performanceService.updateExtension({
                id: performanceId,
                reservationsAtLastUpdateDate: reservationsAtLastUpdateDate,
                eventStatus: newEventStatus,
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
            if (evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended) {
                const targetOrders4performance = targetOrders.filter((o) => {
                    return o.acceptedOffers.some((offer) => {
                        const reservation = <cinerinoapi.factory.order.IReservation>offer.itemOffered;

                        return reservation.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation
                            && reservation.reservationFor.id === performanceId;
                    });
                });
                sendEmailMessageParams = await createEmails(res, targetOrders4performance, notice);
            }

            // Chevreイベントステータスに反映
            await eventService.updatePartially({
                id: performanceId,
                eventStatus: newEventStatus,
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
export async function getTargetReservationsForRefund(req: Request, performanceIds: string[]): Promise<cinerinoapi.factory.order.IOrder[]> {
    const orderService = new cinerinoapi.service.Order({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    const reservationService = new tttsapi.service.Reservation({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    const targetReservations = await reservationService.distinct(
        'underName',
        {
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
            checkins: { $size: 0 }
        }
    );
    const targetOrderNumbers = targetReservations.reduce<string[]>(
        (a, b) => {
            if (Array.isArray(b.identifier)) {
                const orderNumberProperty = b.identifier.find((p: any) => p.name === 'orderNumber');
                if (orderNumberProperty !== undefined) {
                    a.push(orderNumberProperty.value);
                }
            }

            return a;
        },
        []
    );

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
    res: Response,
    orders: cinerinoapi.factory.order.IOrder[],
    notice: string
): Promise<cinerinoapi.factory.action.transfer.send.message.email.IAttributes[]> {
    if (orders.length === 0) {
        return [];
    }

    return Promise.all(orders.map(async (order) => {
        return createEmail(res, order, notice);
    }));
}

/**
 * 運行・オンライン販売停止メール作成(1通)
 */
// tslint:disable-next-line:max-func-body-length
async function createEmail(
    res: Response,
    order: cinerinoapi.factory.order.IOrder,
    notice: string
): Promise<cinerinoapi.factory.action.transfer.send.message.email.IAttributes> {
    const reservation = <IReservationOrderItem>order.acceptedOffers[0].itemOffered;

    // タイトル編集
    // 東京タワー TOP DECK Ticket
    // 東京タワー TOP DECK エレベータ運行停止のお知らせ
    const title = conf.get<string>('emailSus.title');
    const titleEn = conf.get<string>('emailSus.titleEn');

    //トウキョウ タロウ 様
    const purchaserNameJp = `${order.customer.familyName} ${order.customer.givenName}`;
    const purchaserName: string = `${res.__('{{name}}様', { name: purchaserNameJp })}`;
    const purchaserNameEn: string = `${res.__('Mr./Ms.{{name}}', { name: <string>order.customer.name })}`;

    // 購入チケット情報
    const paymentTicketInfos: string[] = [];

    // ご来塔日時 : 2017/12/10 09:15
    const event = reservation.reservationFor;
    const day: string = moment(event.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD');
    const time: string = moment(event.startDate).tz('Asia/Tokyo').format('HH:mm');

    // 購入番号
    let paymentNo = '';
    const paymentNoProperty = order.identifier?.find((p: any) => p.name === 'paymentNo');
    if (paymentNoProperty !== undefined) {
        paymentNo = paymentNoProperty.value;
    }

    paymentTicketInfos.push(`${res.__('PaymentNo')} : ${paymentNo}`);
    paymentTicketInfos.push(`${res.__('EmailReserveDate')} : ${day} ${time}`);
    paymentTicketInfos.push(`${res.__('TicketType')} ${res.__('TicketCount')}`); // 券種 枚数
    const infos = getTicketInfo(order, res.__, res.locale); // TOP DECKチケット(大人) 1枚
    paymentTicketInfos.push(infos.join('\n'));

    // 英語表記を追加
    paymentTicketInfos.push(''); // 日英の間の改行
    paymentTicketInfos.push(`${res.__({ phrase: 'PaymentNo', locale: 'en' })} : ${paymentNo}`);
    paymentTicketInfos.push(`${res.__({ phrase: 'EmailReserveDate', locale: 'en' })} : ${day} ${time}`);
    paymentTicketInfos.push(`${res.__({ phrase: 'TicketType', locale: 'en' })} ${res.__({ phrase: 'TicketCount', locale: 'en' })}`);
    // TOP DECKチケット(大人) 1枚
    const infosEn = getTicketInfo(order, res.__, 'en');
    paymentTicketInfos.push(infosEn.join('\n'));

    // foot
    const foot1 = conf.get<string>('emailSus.EmailFoot1');
    const footEn1 = conf.get<string>('emailSus.EmailFootEn1');
    const foot2 = conf.get<string>('emailSus.EmailFoot2');
    const footEn2 = conf.get<string>('emailSus.EmailFootEn2');
    const foot3 = conf.get<string>('emailSus.EmailFoot3');
    const footEn3 = conf.get<string>('emailSus.EmailFootEn3');
    const access1 = conf.get<string>('emailSus.EmailAccess1');
    const accessEn1 = conf.get<string>('emailSus.EmailAccessEn1');
    const access2 = conf.get<string>('emailSus.EmailAccess2');
    const accessEn2 = conf.get<string>('emailSus.EmailAccessEn2');

    // 本文セット
    // tslint:disable-next-line:max-line-length
    // const content: string = `${title}\n${titleEn}\n\n${purchaserName}\n${purchaserNameEn}\n\n${notice}\n\n${paymentTicketInfos.join('\n')}\n\n\n${foot1}\n${foot2}\n${foot3}\n\n${footEn1}\n${footEn2}\n${footEn3}\n\n${access1}\n${access2}\n\n${accessEn1}\n${accessEn2}`;
    const content: string = `${title}
${titleEn}

${purchaserName}
${purchaserNameEn}

${notice}

${paymentTicketInfos.join('\n')}


${foot1}
${foot2}
${foot3}

${footEn1}
${footEn2}
${footEn3}

${access1}
${access2}

${accessEn1}
${accessEn2}`;

    // メール作成
    const emailMessage: cinerinoapi.factory.creativeWork.message.email.ICreativeWork = {
        project: { typeOf: order.project.typeOf, id: order.project.id },
        typeOf: cinerinoapi.factory.chevre.creativeWorkType.EmailMessage,
        identifier: `updateOnlineStatus-${reservation.id}`,
        name: `updateOnlineStatus-${reservation.id}`,
        sender: {
            typeOf: order.seller.typeOf,
            name: conf.get<string>('email.fromname'),
            email: conf.get<string>('email.from')
        },
        toRecipient: {
            typeOf: order.customer.typeOf,
            name: <string>order.customer.name,
            email: <string>order.customer.email
        },
        about: `${title} ${titleEn}`,
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

/**
 * チケット情報取得
 */
export function getTicketInfo(order: cinerinoapi.factory.order.IOrder, __: Function, locale: string): string[] {
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
        return `${ticketInfos[ticketTypeId].ticket_type_name} ${__('{{n}}Leaf', { n: ticketInfos[ticketTypeId].count })}`;
    });
}
