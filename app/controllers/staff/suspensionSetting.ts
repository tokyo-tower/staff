/**
 * 運行・オンライン販売停止設定コントローラー
 * @namespace controller/staff/suspensionSetting
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as conf from 'config';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as httpStatus from 'http-status';
import * as moment from 'moment';
import * as suspensionCommon from './suspensionCommon';

const debug = createDebug('ttts-staff:controllers:staff:suspensionSetting');
const SETTING_PATH: string = '/staff/suspension/setting';
const VIEW_PATH: string = 'staff/suspension';
const layout: string = 'layouts/staff/layout';

/**
 * 開始
 */
export async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
    // 期限指定
    if (moment() < moment(conf.get<string>('datetimes.reservation_start_staffs'))) {
        next(new Error(req.__('Message.OutOfTerm')));

        return;
    }
    try {
        res.redirect(`${SETTING_PATH}/performances`);
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}
/**
 * スケジュール選択
 * @method performances
 * @returns {Promise<void>}
 */
export async function performances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const token = await ttts.CommonUtil.getToken({
            authorizeServerDomain: <string>process.env.API_AUTHORIZE_SERVER_DOMAIN,
            clientId: <string>process.env.API_CLIENT_ID,
            clientSecret: <string>process.env.API_CLIENT_SECRET,
            scopes: [
                `${<string>process.env.API_RESOURECE_SERVER_IDENTIFIER}/performances.read-only`
            ],
            state: ''
        });

        if (req.method !== 'POST') {
            // 運行・オンライン販売停止設定画面表示
            res.render(`${VIEW_PATH}/performances`, {
                token: token,
                layout: layout
            });
        }
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}
/**
 * 運行・オンライン販売停止設定実行api
 *
 */
export async function execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));

        return;
    }

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
        const targetPlaceOrderTransactions = await suspensionCommon.getTargetReservationsForRefund(performanceIds);
        debug('email target placeOrderTransactions:', targetPlaceOrderTransactions);

        // 返金ステータスセット(運行停止は未指示、減速・再開はNONE)
        const refundStatus: string = evStatus === ttts.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED ?
            ttts.PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED :
            ttts.PerformanceUtil.REFUND_STATUS.NONE;

        // パフォーマンス更新
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

        // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
        if (evStatus === ttts.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED) {
            // メール送信情報 [{'20171201_12345': [r1,r2,,,rn]}]
            await createEmails(res, targetPlaceOrderTransactions, notice);
        }

        res.status(httpStatus.NO_CONTENT).end();
    } catch (error) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            message: error.message
        });
    }
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
    const infos = suspensionCommon.getTicketInfo(reservations, leaf, res.locale);
    paymentTicketInfos.push(infos.join('\n'));
    // 本文セット
    const content: string = `${titleEmail}\n\n${purchaserName}\n\n${notice}\n\n${paymentTicketInfos.join('\n')}`;

    // メール編集
    const emailQueue: suspensionCommon.IEmailQueue = {
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
    await ttts.Models.EmailQueue.create(emailQueue);
}
