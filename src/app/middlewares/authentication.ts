/**
 * ユーザー認証ミドルウェア
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import { NextFunction, Request, Response } from 'express';

import { User } from '../user';

export default async (req: Request, res: Response, next: NextFunction) => {
    req.staffUser = User.PARSE(req.session, req.hostname);

    // 既ログインの場合
    if (req.staffUser.isAuthenticated()) {
        // tttsapi認証クライアントをリクエストオブジェクトにセット
        const cognitoCredentials = (<Express.Session>req.session).cognitoCredentials;
        if (cognitoCredentials === undefined) {
            next(new Error(res.__('UnexpectedError')));

            return;
        }

        const oauth2Client = new tttsapi.auth.OAuth2({
            domain: <string>process.env.API_AUTHORIZE_SERVER_DOMAIN,
            clientId: <string>process.env.API_CLIENT_ID,
            clientSecret: <string>process.env.API_CLIENT_SECRET
        });
        oauth2Client.setCredentials({
            refresh_token: cognitoCredentials.refreshToken,
            // expiry_date: moment().add(<number>authenticationResult.ExpiresIn, 'seconds').unix(),
            // expiry_date: authenticationResult.ExpiresIn,
            access_token: cognitoCredentials.accessToken,
            token_type: cognitoCredentials.tokenType
        });
        req.tttsAuthClient = oauth2Client;

        next();

        return;
    }

    if (req.xhr) {
        res.json({
            success: false,
            message: 'login required'
        });
    } else {
        // ログインページへリダイレクト
        res.redirect(req.staffUser.generateAuthUrl());
        // res.redirect(`/auth/login?cb=${req.originalUrl}`);
    }
};
