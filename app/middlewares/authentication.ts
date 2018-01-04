/**
 * ユーザー認証ミドルウェア
 * @namespace middlewares.authentication
 */

import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import * as ttts from '@motionpicture/ttts-domain';
import { NextFunction, Request, Response } from 'express';

import StaffUser from '../models/user/staff';

// tslint:disable-next-line:max-func-body-length
export default async (req: Request, res: Response, next: NextFunction) => {
    req.staffUser = StaffUser.PARSE(req.session);

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
            clientSecret: <string>process.env.API_CLIENT_SECRET,
            scopes: [
                `${<string>process.env.API_RESOURECE_SERVER_IDENTIFIER}/performances.read-only`,
                `${<string>process.env.API_RESOURECE_SERVER_IDENTIFIER}/transactions`
            ],
            state: ''
        });
        oauth2Client.setCredentials({
            refresh_token: cognitoCredentials.RefreshToken,
            // expiry_date: moment().add(<number>authenticationResult.ExpiresIn, 'seconds').unix(),
            // expiry_date: authenticationResult.ExpiresIn,
            access_token: cognitoCredentials.AccessToken,
            token_type: cognitoCredentials.TokenType
        });
        req.tttsAuthClient = oauth2Client;

        next();

        return;
    }

    // 自動ログインチェック
    if (req.cookies.remember_staff !== undefined) {
        try {
            const authenticationDoc = await ttts.Models.Authentication.findOne(
                {
                    token: req.cookies.remember_staff,
                    owner: { $ne: null }
                }
            ).exec();

            if (authenticationDoc === null) {
                res.clearCookie('remember_staff');
            } else {
                // トークン再生成
                const token = ttts.CommonUtil.createToken();
                await authenticationDoc.update({ token: token }).exec();

                // tslint:disable-next-line:no-cookies
                res.cookie('remember_staff', token, { path: '/', httpOnly: true, maxAge: 604800000 });
                const ownerRepo = new ttts.repository.Owner(ttts.mongoose.connection);
                const owner = await ownerRepo.ownerModel.findOne({ _id: authenticationDoc.get('owner') }).exec();
                if (owner === null) {
                    throw new Error(res.__('UnexpectedError'));
                }

                // ログインしてリダイレクト
                (<Express.Session>req.session).staffUser = <any>owner.toObject();
                res.redirect(req.originalUrl);

                return;
            }
        } catch (error) {
            next(error);

            return;
        }
    }

    if (req.xhr) {
        res.json({
            success: false,
            message: 'login required'
        });
    } else {
        res.redirect(`/auth/login?cb=${req.originalUrl}`);
    }
};
