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

import StaffUser from '../../models/user/staff';

const debug = createDebug('ttts-staff:controllers:api:performances');

/**
 * 運行・オンライン販売ステータス変更
 */
export async function updateOnlineStatus(req: Request, res: Response): Promise<void> {
    try {
        // パフォーマンスIDリストをjson形式で受け取る
        const performanceIds = req.body.performanceIds;
        if (!Array.isArray(performanceIds)) {
            throw new Error(req.__('UnexpectedError'));
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
                'ttts_extension.online_sales_update_user': (<StaffUser>req.staffUser).username,
                'ttts_extension.online_sales_update_at': now,
                'ttts_extension.ev_service_status': evStatus,
                'ttts_extension.ev_service_update_user': (<StaffUser>req.staffUser).username,
                'ttts_extension.ev_service_update_at': now,
                'ttts_extension.refund_status': refundStatus,
                'ttts_extension.refund_update_user': (<StaffUser>req.staffUser).username,
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
            purchaser_group: ttts.factory.person.Group.Customer,
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
    // 東京タワー TOP DECK エレベータ運行停止のお知らせ
    const title = conf.get<string>('emailSus.title');
    const titleEn = conf.get<string>('emailSus.titleEn');
    //トウキョウ タロウ 様
    const purchaserNameJp = `${(<any>reservation).purchaser_last_name} ${(<any>reservation).purchaser_first_name}`;
    const purchaserName: string = `${res.__('{{name}}様', { name: purchaserNameJp })}`;
    //const purchaserName: string = `${res.__('{{name}}様', { name: (<any>reservation).purchaser_name })}`;
    const purchaserNameEn: string = `${res.__('Mr{{name}}', { name: (<any>reservation).purchaser_name })}`;

    // 購入チケット情報
    const paymentTicketInfos: string[] = [];
    // 購入番号 : 850000001
    paymentTicketInfos.push(`${res.__('PaymentNo')} : ${reservation.payment_no}`);

    // ご来塔日時 : 2017/12/10 09:15
    const day: string = moment(reservation.performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
    // tslint:disable-next-line:no-magic-numbers
    const time: string = `${reservation.performance_start_time.substr(0, 2)}:${reservation.performance_start_time.substr(2, 2)}`;
    paymentTicketInfos.push(`${res.__('Label.Day')} : ${day} ${time}`);

    // 券種 枚数
    paymentTicketInfos.push(`${res.__('TicketType')} ${res.__('TicketCount')}`);
    // TOP DECKチケット(大人) 1枚
    const infos = getTicketInfo(reservations, res.__, res.locale);
    paymentTicketInfos.push(infos.join('\n'));

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
    const emailAttributes: ttts.factory.creativeWork.message.email.IAttributes = {
        sender: {
            name: conf.get<string>('email.fromname'),
            email: conf.get<string>('email.from')
        },
        toRecipient: {
            // tslint:disable-next-line:max-line-length
            name: reservation.purchaser_name,
            email: reservation.purchaser_email
        },
        about: `${title} ${titleEn}`,
        text: content
    };

    // メール作成
    const taskRepo = new ttts.repository.Task(ttts.mongoose.connection);

    const emailMessage = ttts.factory.creativeWork.message.email.create({
        identifier: `updateOnlineStatus-${reservation.id}`,
        sender: {
            typeOf: 'Corporation',
            name: emailAttributes.sender.name,
            email: emailAttributes.sender.email
        },
        toRecipient: {
            typeOf: ttts.factory.personType.Person,
            name: emailAttributes.toRecipient.name,
            email: emailAttributes.toRecipient.email
        },
        about: emailAttributes.about,
        text: emailAttributes.text
    });

    // その場で送信ではなく、DBにタスクを登録
    const taskAttributes = ttts.factory.task.sendEmailNotification.createAttributes({
        status: ttts.factory.taskStatus.Ready,
        runsAt: new Date(), // なるはやで実行
        remainingNumberOfTries: 10,
        lastTriedAt: null,
        numberOfTried: 0,
        executionResults: [],
        data: {
            emailMessage: emailMessage
        }
    });

    await taskRepo.save(taskAttributes);
    debug('sendEmail task created.');
}

/**
 * チケット情報取得
 *
 */
export function getTicketInfo(reservations: any[], __: Function, locale: string): string[] {
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
        ticketInfoArray.push(`${ticketInfo.ticket_type_name} ${__('{{n}}Leaf', { n: ticketInfo.count })}`);
    });

    return ticketInfoArray;
}
