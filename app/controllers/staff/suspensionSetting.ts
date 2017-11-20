/**
 * 運行・オンライン販売停止設定コントローラー
 *
 * @namespace controller/staff/suspensionSetting
 */
import { CommonUtil, Models } from '@motionpicture/ttts-domain';
import * as conf from 'config';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as mongoose from 'mongoose';

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
        await suspendById((<any>req).staffUser.username,
                          performanceIds,
                          req.body.onlineStatus,
                          req.body.evStatus,
                          req.body.notice);
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
 * @param {string} notice
 * @return {Promise<boolean>}
 */
async function suspendById(staffUser: string,
                           performanceIds: string[],
                           onlineStatus: string,
                           evStatus: string,
                           notice: string) : Promise<boolean> {

    // tslint:disable-next-line:no-console
    console.log(notice);

    // パフォーマンスIDをObjectIdに変換
    const ids = performanceIds.map((id) => {
        return new mongoose.Types.ObjectId(id);
    });
    try {
        // パフォーマンス更新
        await Models.Performance.update(
            {
                _id: { $in: ids }
            },
            {
                $set: {
                    'ttts_extension.online_sales_status': onlineStatus,
                    'ttts_extension.online_sales_update_user': staffUser,
                    'ttts_extension.ev_service_status': evStatus,
                    'ttts_extension.ev_service_update_user': staffUser
                }
            },
            {
                multi: true
            }
        ).exec();
    } catch (error) {

        return false;
    }

    return true;
}
