/**
 * 運行・オンライン販売停止設定コントローラー
 *
 * @namespace controller/staff/suspensionSetting
 */
import * as ttts from '@motionpicture/ttts-domain';
import * as conf from 'config';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as suspensionCommon from './suspensionCommon';

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
        // token取得
        const token: string = await ttts.CommonUtil.getToken(<string>process.env.API_ENDPOINT);

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
        const performanceIds = JSON.parse(req.body.performanceIds);
        if (!Array.isArray(performanceIds)) {
            throw new Error(req.__('Message.UnexpectedError'));
        }

        // const executeType: string = req.body.executeType;
        const onlineStatus: string = req.body.onlineStatus;
        const evStatus: string = req.body.evStatus;
        const notice: string = req.body.notice;
        const info: any = await updateStatusByIds(
            (<any>req).staffUser.username,
            performanceIds,
            onlineStatus,
            evStatus);

        // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
        if (evStatus === ttts.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED) {
            // メール送信情報 [{'20171201_12345': [r1,r2,,,rn]}]
            await createEmails(res, info.targrtInfo, notice);
        }
        res.json({
            success: true,
            message: null
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message
        });
    }
}
/**
 * 運行・オンライン販売停止設定処理(idから)
 *
 * @param {string} staffUser
 * @param {string[]} performanceIds
 * @param {string} onlineStatus
 * @param {string} evStatus
 * @return {Promise<boolean>}
 */
async function updateStatusByIds(
    staffUser: string,
    performanceIds: string[],
    onlineStatus: string,
    evStatus: string): Promise<any> {
    // パフォーマンスIDをObjectIdに変換
    const ids = performanceIds.map((id) => {
        return new ttts.mongoose.Types.ObjectId(id);
    });
    const now = moment().format('YYYY/MM/DD HH:mm:ss');
    let info: any = {};

    // オンライン販売停止の時、予約更新
    if (onlineStatus === ttts.PerformanceUtil.ONLINE_SALES_STATUS.SUSPENDED) {
        // 返金対象予約情報取得(入塔記録のないもの)
        info = await suspensionCommon.getTargetReservationsForRefund(
            performanceIds,
            ttts.PerformanceUtil.REFUND_STATUS.NONE,
            evStatus === ttts.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED);

        // 予約情報返金ステータスを未指示に更新
        if (info.targrtIds.length > 0) {
            const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
            await reservationRepo.reservationModel.update(
                {
                    _id: { $in: info.targrtIds }
                },
                {
                    $set: {
                        'performance_ttts_extension.refund_status': ttts.PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED,
                        'performance_ttts_extension.refund_update_user': staffUser,
                        'performance_ttts_extension.refund_update_at': now
                    }
                },
                {
                    multi: true
                }
            ).exec();
        }
    }

    // 販売停止か再開かで返金ステータスセットorクリア決定
    const refundStatus: string = onlineStatus === ttts.PerformanceUtil.ONLINE_SALES_STATUS.SUSPENDED ?
        ttts.PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED :
        ttts.PerformanceUtil.REFUND_STATUS.NONE;
    // パフォーマンス更新
    const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
    await performanceRepo.performanceModel.update(
        {
            _id: { $in: ids }
        },
        {
            $set: {
                'ttts_extension.online_sales_status': onlineStatus,
                'ttts_extension.online_sales_update_user': staffUser,
                'ttts_extension.online_sales_update_at': now,
                'ttts_extension.ev_service_status': evStatus,
                'ttts_extension.ev_service_update_user': staffUser,
                'ttts_extension.ev_service_update_at': now,
                'ttts_extension.refund_status': refundStatus,
                'ttts_extension.refund_update_user': staffUser,
                'ttts_extension.refund_update_at': now
            }
        },
        {
            multi: true
        }
    ).exec();

    return info;
}
/**
 * 運行・オンライン販売停止メール作成
 *
 * @param {Response} res
 * @param {any[]} targrtInfos
 * @param {any} notice
 * @return {Promise<void>}
 */
async function createEmails(
    res: Response,
    targrtInfo: any,
    notice: string): Promise<void> {
    // メール送信情報 [{'20171201_12345': [r1,r2,,,rn]}]
    if (Object.keys(targrtInfo).length === 0) {

        return;
    }
    // 購入単位ごとにメール作成
    const promises = (Object.keys(targrtInfo).map(async (key) => {
        if (targrtInfo[key].length > 0) {
            await createEmail(res, targrtInfo[key], notice);
        }
    }));
    await Promise.all(promises);

    return;
}
/**
 * 運行・オンライン販売停止メール作成(1通)
 *
 * @param {Response} res
 * @param {any} reservation
 * @param {any} notice
 * @return {Promise<void>}
 */
async function createEmail(
    res: Response,
    reservations: any[],
    notice: string): Promise<void> {

    const reservation = reservations[0];
    // タイトル編集
    // 東京タワー TOP DECK Ticket
    const title = res.__('Title');
    // 東京タワー TOP DECK エレベータ運行停止のお知らせ
    const titleEmail = res.__('Email.TitleSus');
    //トウキョウ タロウ 様
    const purchaserName: string = `${res.__('Mr{{name}}', { name: reservation.purchaser_name[res.locale] })}`;

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
