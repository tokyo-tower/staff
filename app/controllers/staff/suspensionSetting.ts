/**
 * 運行・オンライン販売停止設定コントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import { NextFunction, Request, Response } from 'express';

const layout: string = 'layouts/staff/layout';

/**
 * スケジュール選択
 */
export async function performances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // 運行・オンライン販売停止設定画面表示
        res.render('staff/suspension/performances', {
            token: req.tttsAuthClient.credentials,
            layout: layout,
            EvServiceStatus: tttsapi.factory.performance.EvServiceStatus,
            OnlineSalesStatus: tttsapi.factory.performance.OnlineSalesStatus,
            RefundStatus: tttsapi.factory.performance.RefundStatus
        });
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}
