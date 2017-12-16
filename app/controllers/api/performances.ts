/**
 * パフォーマンスAPIコントローラー
 * @namespace controllers.api.performances
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as conf from 'config';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR, NO_CONTENT } from 'http-status';
import * as moment from 'moment';
import * as numeral from 'numeral';

const debug = createDebug('ttts-staff:controllers:api:performances');

/**
 * 運行・オンライン販売ステータス変更
 */
export async function updateOnlineStatus(req: Request, res: Response): Promise<void> {
    try {
        // パフォーマンスIDリストをjson形式で受け取る
        const performanceIds = req.body.performanceIds;
        if (!Array.isArray(performanceIds)) {
            throw new Error(req.__('Message.UnexpectedError'));
        }

        // パフォーマンス・予約(入塔記録のないもの)のステータス更新
        const onlineStatus: string = req.body.onlineStatus;
        const evStatus: string = req.body.evStatus;
        const notice: string = req.body.notice;
        debug('updating performances...', performanceIds, onlineStatus, evStatus, notice);

        const now = new Date();

        // 返金対象予約情報取得(入塔記録のないもの)
        const targetPlaceOrderTransactions = await getTargetReservationsForRefund(performanceIds);
        debug('email target placeOrderTransactions:', targetPlaceOrderTransactions);

        // 返金ステータスセット(運行停止は未指示、減速・再開はNONE)
        const refundStatus: string = evStatus === ttts.factory.performance.EvServiceStatus.Suspended ?
            ttts.factory.performance.RefundStatus.NotInstructed :
            ttts.factory.performance.RefundStatus.None;

        // パフォーマンス更新
        debug('updating performance online_sales_status...');
        const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
        await performanceRepo.performanceModel.update(
            { _id: { $in: performanceIds } },
            {
                'ttts_extension.online_sales_status': onlineStatus,
                'ttts_extension.online_sales_update_user': req.staffUser,
                'ttts_extension.online_sales_update_at': now,
                'ttts_extension.ev_service_status': evStatus,
                'ttts_extension.ev_service_update_user': req.staffUser,
                'ttts_extension.ev_service_update_at': now,
                'ttts_extension.refund_status': refundStatus,
                'ttts_extension.refund_update_user': req.staffUser,
                'ttts_extension.refund_update_at': now
            },
            { multi: true }
        ).exec();
        debug('performance online_sales_status updated.');

        // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
        if (evStatus === ttts.factory.performance.EvServiceStatus.Suspended) {
            try {
                await createEmails(res, targetPlaceOrderTransactions, notice);
            } catch (error) {
                // no op
                console.error(error);
            }
        }

        res.status(NO_CONTENT).end();
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            message: error.message
        });
    }
}

export type IPlaceOrderTransaction = ttts.factory.transaction.placeOrder.ITransaction;

/**
 * 返金対象予約情報取得
 *  [一般予約]かつ
 *  [予約データ]かつ
 *  [同一購入単位に入塔記録のない]予約のid配列
 * @param {string} performanceIds
 * @return {Promise<IPlaceOrderTransaction[]>}
 */
export async function getTargetReservationsForRefund(performanceIds: string[]): Promise<IPlaceOrderTransaction[]> {
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
    const transactionRepo = new ttts.repository.Transaction(ttts.mongoose.connection);

    // 返品されていない、かつ、入場履歴なし、の予約から、取引IDリストを取得
    const targetTransactionIds = await reservationRepo.reservationModel.distinct(
        'transaction',
        {
            status: ttts.factory.reservationStatusType.ReservationConfirmed,
            purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
            performance: { $in: performanceIds },
            checkins: { $size: 0 }
        }
    ).exec();

    return transactionRepo.transactionModel.find(
        {
            _id: { $in: targetTransactionIds }
        }
    ).exec().then((docs) => docs.map((doc) => <IPlaceOrderTransaction>doc.toObject()));
}

/**
 * メールキューインタフェース
 *
 * @interface IEmailQueue
 */
export interface IEmailQueue {
    // tslint:disable-next-line:no-reserved-keywords
    from: { // 送信者
        address: string;
        name: string;
    };
    to: { // 送信先
        address: string;
        name?: string;
    };
    subject: string;
    content: { // 本文
        mimetype: string;
        text: string;
    };
    status: string;
}

/**
 * 運行・オンライン販売停止メール作成
 * @param {Response} res
 * @param {ttts.factory.transaction.placeOrder.ITransaction[]} transactions
 * @param {any} notice
 * @return {Promise<void>}
 */
async function createEmails(
    res: Response,
    transactions: ttts.factory.transaction.placeOrder.ITransaction[],
    notice: string
): Promise<void> {
    if (transactions.length === 0) {
        return;
    }

    // 購入単位ごとにメール作成
    await Promise.all(transactions.map(async (transaction) => {
        const result = <ttts.factory.transaction.placeOrder.IResult>transaction.result;
        await createEmail(res, result.eventReservations, notice);
    }));
}

/**
 * 運行・オンライン販売停止メール作成(1通)
 * @param {Response} res
 * @param {ttts.factory.reservation.event.IReservation[]} reservation
 * @param {string} notice
 * @return {Promise<void>}
 */
async function createEmail(res: Response, reservations: ttts.factory.reservation.event.IReservation[], notice: string): Promise<void> {
    const reservation = reservations[0];
    // タイトル編集
    // 東京タワー TOP DECK Ticket
    const title = res.__('Title');
    // 東京タワー TOP DECK エレベータ運行停止のお知らせ
    const titleEmail = res.__('Email.TitleSus');
    //トウキョウ タロウ 様
    const purchaserName: string = `${res.__('Mr{{name}}', { name: (<any>reservation).purchaser_name[res.locale] })}`;

    // 購入チケット情報
    const paymentTicketInfos: string[] = [];
    // 購入番号 : 850000001
    paymentTicketInfos.push(`${res.__('Label.PaymentNo')} : ${reservation.payment_no}`);

    // ご来塔日時 : 2017/12/10 09:15
    const day: string = moment(reservation.performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
    // tslint:disable-next-line:no-magic-numbers
    const time: string = `${reservation.performance_start_time.substr(0, 2)}:${reservation.performance_start_time.substr(2, 2)}`;
    paymentTicketInfos.push(`${res.__('Label.Day')} : ${day} ${time}`);

    // 券種 枚数
    paymentTicketInfos.push(`${res.__('Label.TicketType')} ${res.__('Label.TicketCount')}`);
    // TOP DECKチケット(大人) 1枚
    const leaf: string = res.__('Email.Leaf');
    const infos = getTicketInfo(reservations, leaf, res.locale);
    paymentTicketInfos.push(infos.join('\n'));
    // 本文セット
    const content: string = `${titleEmail}\n\n${purchaserName}\n\n${notice}\n\n${paymentTicketInfos.join('\n')}`;

    // メール編集
    const emailQueue: IEmailQueue = {
        from: {
            address: conf.get<string>('email.from'),
            name: conf.get<string>('email.fromname')
        },
        to: {
            address: reservation.purchaser_email
        },
        subject: `${title} ${titleEmail}`,
        content: {
            mimetype: 'text/plain',
            text: content
        },
        status: ttts.EmailQueueUtil.STATUS_UNSENT
    };

    // メール作成
    debug('creating email queue...', emailQueue);
    await ttts.Models.EmailQueue.create(emailQueue);
    debug('email queue created.');
}

/**
 * チケット情報取得
 *
 */
export function getTicketInfo(reservations: any[], leaf: string, locale: string): string[] {
    // 券種ごとに合計枚数算出
    const keyName: string = 'ticket_type';
    const ticketInfos: {} = {};
    for (const reservation of reservations) {
        // チケットタイプセット
        const dataValue = reservation[keyName];
        // チケットタイプごとにチケット情報セット
        if (!ticketInfos.hasOwnProperty(dataValue)) {
            (<any>ticketInfos)[dataValue] = {
                ticket_type_name: reservation.ticket_type_name[locale],
                charge: `\\${numeral(reservation.charge).format('0,0')}`,
                count: 1
            };
        } else {
            (<any>ticketInfos)[dataValue].count += 1;
        }
    }
    // 券種ごとの表示情報編集
    const ticketInfoArray: string[] = [];
    Object.keys(ticketInfos).forEach((key) => {
        const ticketInfo = (<any>ticketInfos)[key];
        ticketInfoArray.push(`${ticketInfo.ticket_type_name} ${ticketInfo.count}${leaf}`);
    });

    return ticketInfoArray;
}
