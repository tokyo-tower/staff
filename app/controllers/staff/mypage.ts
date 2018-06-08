/**
 * 内部関係者マイページコントローラー
 * @namespace controllers.staff.mypage
 */

import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
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

const authClient = new tttsapi.auth.OAuth2({
    domain: <string>process.env.API_AUTHORIZE_SERVER_DOMAIN,
    clientId: <string>process.env.API_CLIENT_ID,
    clientSecret: <string>process.env.API_CLIENT_SECRET
});

/**
 * マイページ(予約一覧)
 */
export async function index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const cognitoCredentials = (<Express.ICredentials>(<Express.Session>req.session).cognitoCredentials);
        authClient.setCredentials({
            refresh_token: cognitoCredentials.refreshToken,
            // expiry_date: number;
            access_token: cognitoCredentials.accessToken,
            token_type: cognitoCredentials.tokenType
        });
        const adminService = new tttsapi.service.Admin({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: authClient
        });
        const owners = await adminService.search({ group: 'Staff' });
        const token = authClient.credentials;

        res.render('staff/mypage/index', {
            token: token,
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
            locale: 'ja',
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
