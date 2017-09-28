/**
 * ベーシック認証ミドルウェア
 *
 * @module basicAuthMiddleware
 */

import * as basicAuth from 'basic-auth';
import { NextFunction, Request, Response } from 'express';
import { UNAUTHORIZED } from 'http-status';

const BASIC_AUTH_NAME = 'tower333';
const BASIC_AUTH_PASS = 'TTTS!2017';

export default (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'dev4gmo' ||
        process.env.NODE_ENV === 'test4gmo' ||
        process.env.NODE_ENV === 'prod4gmo') {
        next();
        return;
    }

    // SendGridイベント通知に対してはオープンにする
    if (req.originalUrl === '/sendGrid/event/notify') {
        next();
        return;
    }

    const user = basicAuth(req);
    if (user !== undefined && user.name === BASIC_AUTH_NAME && user.pass === BASIC_AUTH_PASS) {
        next();
        return;
    }

    res.statusCode = UNAUTHORIZED;
    res.setHeader('WWW-Authenticate', 'Basic realm="TTTS Authentication"');
    res.end('Unauthorized');
};
