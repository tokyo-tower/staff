/**
 * パフォーマンスAPIコントローラー
 */
import * as cinerinoapi from '@cinerino/api-nodejs-client';
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as conf from 'config';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR, NO_CONTENT } from 'http-status';
import * as moment from 'moment-timezone';
import * as numeral from 'numeral';

import StaffUser from '../../models/user/staff';

import { getUnitPriceByAcceptedOffer } from '../reserveBase';

const debug = createDebug('ttts-staff:controllers');

const STAFF_CLIENT_ID = <string>process.env.API_CLIENT_ID;
const POS_CLIENT_ID = <string>process.env.POS_CLIENT_ID;
const FRONTEND_CLIENT_ID = <string>process.env.FRONTEND_CLIENT_ID;

export type IReservationOrderItem = cinerinoapi.factory.order.IReservation;

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

        const eventService = new tttsapi.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const reservationService = new tttsapi.service.Reservation({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });

        const updateUser = (<StaffUser>req.staffUser).username;

        await Promise.all(performanceIds.map(async (performanceId) => {
            // パフォーマンスに対する予約検索(1パフォーマンスに対する予約はmax41件なので、これで十分)
            const searchReservationsResult = await reservationService.search({
                limit: 100,
                typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
                reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed],
                reservationFor: { id: performanceId }
            });
            const reservations4performance = searchReservationsResult.data;

            const reservationsAtLastUpdateDate: tttsapi.factory.performance.IReservationAtLastupdateDate[] =
                reservations4performance.map((r) => {
                    let clientId: string = '';
                    let purchaserGroup: string = 'Customer';
                    let paymentMethod: string = '';
                    let orderNumber: string = '';
                    if (r.underName !== undefined && r.underName.identifier !== undefined) {
                        const paymentMethodProperty = r.underName.identifier.find((p) => p.name === 'paymentMethod');
                        if (paymentMethodProperty !== undefined) {
                            paymentMethod = paymentMethodProperty.value;
                        }

                        const orderNumberProperty = r.underName.identifier.find((p) => p.name === 'orderNumber');
                        if (orderNumberProperty !== undefined) {
                            orderNumber = orderNumberProperty.value;
                        }

                        const clientIdProperty = r.underName.identifier.find((p) => p.name === 'clientId');
                        if (clientIdProperty !== undefined) {
                            clientId = clientIdProperty.value;
                        }

                        // クライアントIDがstaffであればStaffグループ(その他はCustomer)
                        if (clientId === STAFF_CLIENT_ID) {
                            purchaserGroup = 'Staff';
                        }
                    }

                    return {
                        id: r.id,
                        status: <tttsapi.factory.chevre.reservationStatusType>r.reservationStatus,
                        purchaser_group: purchaserGroup,
                        transaction_agent: {
                            typeOf: tttsapi.factory.personType.Person,
                            id: clientId
                        },
                        payment_method: <cinerinoapi.factory.paymentMethodType>paymentMethod,
                        order_number: orderNumber
                    };
                });

            await eventService.updateExtension({
                id: performanceId,
                reservationsAtLastUpdateDate: reservationsAtLastUpdateDate,
                onlineSalesStatus: onlineStatus,
                onlineSalesStatusUpdateUser: updateUser,
                onlineSalesStatusUpdateAt: now,
                evServiceStatus: evStatus,
                evServiceStatusUpdateUser: updateUser,
                evServiceStatusUpdateAt: now,
                refundStatus: refundStatus,
                refundStatusUpdateUser: updateUser,
                refundStatusUpdateAt: now
            });
        }));
        debug('performance online_sales_status updated.');

        // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
        if (evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended) {
            try {
                await createEmails(req, res, targetOrders, notice);
            } catch (error) {
                // no op
                debug('createEmails failed', error);
            }
        }

        res.status(NO_CONTENT).end();
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
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
            typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
            reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed],
            // クライアントがfrontend or pos
            underName: {
                identifiers: [
                    { name: 'clientId', value: POS_CLIENT_ID },
                    { name: 'clientId', value: FRONTEND_CLIENT_ID }
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
        const limit = 100;
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
 * @param {Response} res
 * @param {tttsapi.factory.transaction.placeOrder.ITransaction[]} transactions
 * @param {string} notice
 * @return {Promise<void>}
 */
async function createEmails(
    req: Request,
    res: Response,
    orders: cinerinoapi.factory.order.IOrder[],
    notice: string
): Promise<void> {
    if (orders.length === 0) {
        return;
    }

    // 購入単位ごとにメール作成
    await Promise.all(orders.map(async (order) => {
        await createEmail(req, res, order, notice);
    }));
}

/**
 * 運行・オンライン販売停止メール作成(1通)
 * @param {Response} res
 * @param {tttsapi.factory.reservation.event.IReservation[]} reservation
 * @param {string} notice
 * @return {Promise<void>}
 */
// tslint:disable-next-line:max-func-body-length
async function createEmail(
    req: Request,
    res: Response,
    order: cinerinoapi.factory.order.IOrder,
    notice: string
): Promise<void> {
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
    if (Array.isArray(order.identifier)) {
        const confirmationNumberProperty = order.identifier.find((p: any) => p.name === 'confirmationNumber');
        if (confirmationNumberProperty !== undefined) {
            // tslint:disable-next-line:no-magic-numbers
            paymentNo = confirmationNumberProperty.value.slice(-6);
        }
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
    const content: string = `${title}\n${titleEn}\n\n${purchaserName}\n${purchaserNameEn}\n\n${notice}\n\n${paymentTicketInfos.join('\n')}\n\n\n${foot1}\n${foot2}\n${foot3}\n\n${footEn1}\n${footEn2}\n${footEn3}\n\n${access1}\n${access2}\n\n${accessEn1}\n${accessEn2}`;

    // メール編集
    const emailAttributes: cinerinoapi.factory.creativeWork.message.email.IAttributes = {
        typeOf: cinerinoapi.factory.creativeWorkType.EmailMessage,
        sender: {
            name: conf.get<string>('email.fromname'),
            email: conf.get<string>('email.from')
        },
        toRecipient: {
            name: <string>order.customer.name,
            email: <string>order.customer.email
        },
        about: `${title} ${titleEn}`,
        text: content
    };

    // メール作成
    const taskService = new cinerinoapi.service.Task({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    const emailMessage: cinerinoapi.factory.creativeWork.message.email.ICreativeWork = {
        typeOf: cinerinoapi.factory.creativeWorkType.EmailMessage,
        identifier: `updateOnlineStatus-${reservation.id}`,
        name: `updateOnlineStatus-${reservation.id}`,
        sender: {
            typeOf: 'Corporation',
            name: emailAttributes.sender.name,
            email: emailAttributes.sender.email
        },
        toRecipient: {
            typeOf: tttsapi.factory.personType.Person,
            name: emailAttributes.toRecipient.name,
            email: emailAttributes.toRecipient.email
        },
        about: emailAttributes.about,
        text: emailAttributes.text
    };

    // その場で送信ではなく、DBにタスクを登録
    const taskAttributes: cinerinoapi.factory.task.IAttributes<cinerinoapi.factory.taskName.SendEmailMessage> = {
        name: cinerinoapi.factory.taskName.SendEmailMessage,
        project: order.project,
        status: tttsapi.factory.taskStatus.Ready,
        runsAt: new Date(), // なるはやで実行
        remainingNumberOfTries: 10,
        numberOfTried: 0,
        executionResults: [],
        data: {
            actionAttributes: {
                typeOf: cinerinoapi.factory.actionType.SendAction,
                agent: <any>req.staffUser,
                object: emailMessage,
                project: order.project,
                purpose: order,
                recipient: {
                    id: order.customer.id,
                    name: emailAttributes.toRecipient.name,
                    typeOf: tttsapi.factory.personType.Person
                }
            }
            // emailMessage: emailMessage
        }
    };
    await taskService.create(taskAttributes);
    debug('sendEmail task created.');
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
