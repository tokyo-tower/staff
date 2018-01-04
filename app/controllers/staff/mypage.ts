/**
 * 内部関係者マイページコントローラー
 * @namespace controller/staff/mypage
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as querystring from 'querystring';

const debug = createDebug('ttts-staff:controllers:staff:mypage');
const layout: string = 'layouts/staff/layout';

const redisClient = ttts.redis.createClient({
    host: <string>process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(<string>process.env.REDIS_PORT, 10),
    password: <string>process.env.REDIS_KEY,
    tls: { servername: <string>process.env.REDIS_HOST }
});

/**
 * マイページ(予約一覧)
 */
export async function index(__: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const ownerRepo = new ttts.repository.Owner(ttts.mongoose.connection);
        const owners = await ownerRepo.ownerModel.find().sort({ _id: 1 }).exec();
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
        const ids = req.query.ids;
        debug('printing reservations...ids:', ids);

        // 印刷トークン発行
        const tokenRepo = new ttts.repository.Token(redisClient);
        const printToken = await tokenRepo.createPrintToken(ids);
        debug('printToken created.', printToken);

        const query = querystring.stringify({
            output: req.query.output,
            token: printToken
        });
        const printUrl = `${process.env.RESERVATIONS_PRINT_URL}?${query}`;
        debug('printUrl:', printUrl);

        res.redirect(printUrl);
    } catch (error) {
        next(error);
    }
}
