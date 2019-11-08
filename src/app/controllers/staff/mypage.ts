/**
 * 内部関係者マイページコントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as querystring from 'querystring';

import { createPrintToken } from './reserve';

const debug = createDebug('ttts-staff:controllers:staff:mypage');
const layout: string = 'layouts/staff/layout';

/**
 * マイページ(予約一覧)
 */
export async function index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const adminService = new tttsapi.service.Admin({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const owners = await adminService.search({ group: 'Staff' });

        res.render('staff/mypage/index', {
            owners: owners,
            layout: layout
        });
    } catch (error) {
        next(error);
    }
}

/**
 * A4印刷
 */
export async function print(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const ids = <string[]>req.query.ids;
        debug('printing reservations...ids:', ids);

        // 印刷トークン発行
        const token = await createPrintToken(ids);
        debug('printToken created.', token);

        const query = querystring.stringify({
            locale: 'ja',
            output: req.query.output,
            token: token
        });
        const printUrl = `${process.env.RESERVATIONS_PRINT_URL}?${query}`;
        debug('printUrl:', printUrl);

        res.redirect(printUrl);
    } catch (error) {
        next(error);
    }
}
