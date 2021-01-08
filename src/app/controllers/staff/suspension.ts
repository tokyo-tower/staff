/**
 * 運行・オンライン販売停止一覧コントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import { NextFunction, Request, Response } from 'express';

const layout: string = 'layouts/staff/layout';

/**
 * 運行・オンライン販売停止一覧
 */
export async function index(__: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.render('staff/suspension/list', {
            layout: layout,
            RefundStatus: tttsapi.factory.performance.RefundStatus
        });
    } catch (error) {
        next(error);
    }
}

/**
 * スケジュール選択
 */
export async function performances(__: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // 運行・オンライン販売停止設定画面表示
        res.render('staff/suspension/performances', {
            layout: layout,
            EventStatusType: tttsapi.factory.chevre.eventStatusType
        });
    } catch (error) {
        next(new Error('システムエラーが発生しました。ご不便をおかけして申し訳ありませんがしばらく経ってから再度お試しください。'));
    }
}
