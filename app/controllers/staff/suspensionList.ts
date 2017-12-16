/**
 * 運行・オンライン販売停止一覧コントローラー
 * @namespace controller/staff/suspensionList
 */

import { NextFunction, Request, Response } from 'express';

const layout: string = 'layouts/staff/layout';

/**
 * 運行・オンライン販売停止一覧
 */
export async function index(__: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.render('staff/suspension/list', {
            layout: layout
        });
    } catch (error) {
        next(error);
    }
}
