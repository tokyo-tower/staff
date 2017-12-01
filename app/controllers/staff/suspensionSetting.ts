/**
 * 運行・オンライン販売停止設定コントローラー
 *
 * @namespace controller/staff/suspensionSetting
 */
import { CommonUtil, Models, PerformanceUtil } from '@motionpicture/ttts-domain';
import * as conf from 'config';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as mongoose from 'mongoose';
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
        const token: string = await CommonUtil.getToken(process.env.API_ENDPOINT);

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

        //59fc92c3fca1c8737f068a
        const executeType: string = req.body.executeType;
        const onlineStatus: string =  executeType === '1' ? req.body.onlineStatus : PerformanceUtil.ONLINE_SALES_STATUS.NORMAL;
        const evStatus: string =  executeType === '1' ? req.body.evStatus : PerformanceUtil.EV_SERVICE_STATUS.NORMAL;
        await updateStatusByIds((<any>req).staffUser.username,
                                performanceIds,
                                onlineStatus,
                                evStatus);
        // 運行停止の時、メール作成
        // if (req.body.ev_service_status === PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED) {
        //     await createEmails((<any>req).staffUser, performanceIds);
        // }
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
async function updateStatusByIds(staffUser: string,
                                 performanceIds: string[],
                                 onlineStatus: string,
                                 evStatus: string) : Promise<void> {
    // パフォーマンスIDをObjectIdに変換
    const ids = performanceIds.map((id) => {
        return new mongoose.Types.ObjectId(id);
    });
    const now = moment().format('YYYY/MM/DD HH:mm:ss');

    // 返金対象予約情報取得(入塔記録のないもの)
    const info = await suspensionCommon.getTargetReservationsForRefund(
                                            performanceIds,
                                            PerformanceUtil.REFUND_STATUS.NONE);
    // 予約情報返金ステータスを未指示に更新
    if (info.reservationIds.length > 0) {
        await Models.Reservation.update(
            {
                _id: { $in: info.reservationIds}
            },
            {
                $set: {
                    'performance_ttts_extension.refund_status': PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED,
                    'performance_ttts_extension.refund_update_user': staffUser,
                    'performance_ttts_extension.refund_update_at': now
                }
            },
            {
                multi: true
            }
        ).exec();
    }

    // パフォーマンス更新
    await Models.Performance.update(
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
                'ttts_extension.refund_status': PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED,
                'ttts_extension.refund_update_user': staffUser,
                'ttts_extension.refund_update_at': now
            }
        },
        {
            multi: true
        }
    ).exec();

    return;
}
