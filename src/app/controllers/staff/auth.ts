/**
 * 内部関係者認証コントローラー
 * @namespace controllers.staff.auth
 */

import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import * as request from 'request-promise-native';
import * as _ from 'underscore';

import staffLoginForm from '../../forms/staff/staffLoginForm';

const debug = createDebug('ttts-staff:controller:staff:auth');

export interface IProfile {
    sub: string;
    iss: string;
    'cognito:groups': string[];
    'cognito:username': string;
    given_name: string;
    phone_number: string;
    family_name: string;
    email: string;
}

/**
 * 内部関係者ログイン
 * @method login
 * @returns {Promise<void>}
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser !== undefined && req.staffUser.isAuthenticated()) {
        res.redirect('/staff/mypage');

        return;
    }

    try {
        res.locals.userId = '';
        res.locals.password = '';

        if (req.method === 'POST') {
            staffLoginForm(req);
            const validationResult = await req.getValidationResult();
            res.locals.userId = req.body.userId;
            res.locals.password = '';
            res.locals.language = req.body.language;
            res.locals.remember = req.body.remember;
            res.locals.validation = validationResult.array();

            if (validationResult.isEmpty()) {
                try {
                    // ログイン情報が有効であれば、Cognitoでもログイン
                    (<Express.Session>req.session).cognitoCredentials = await request.post(
                        `${process.env.TTTS_AUTHORIZE_SERVER}/oauth/token`,
                        {
                            auth: {
                                user: <string>process.env.API_CLIENT_ID,
                                pass: <string>process.env.API_CLIENT_SECRET
                            },
                            json: true,
                            body: {
                                username: req.body.userId,
                                password: req.body.password
                            }
                        }
                    ).then((body) => body);
                    debug('cognito credentials published.', (<Express.Session>req.session).cognitoCredentials);
                } catch (error) {
                    res.locals.validation = [
                        // { msg: req.__('Invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                        { msg: req.__('Invalid{{fieldName}}', { fieldName: 'パスワード' }) }
                    ];
                }

                const cognitoCredentials = (<Express.Session>req.session).cognitoCredentials;
                if (cognitoCredentials !== undefined) {
                    const authClient = new tttsapi.auth.OAuth2({
                        domain: <string>process.env.API_AUTHORIZE_SERVER_DOMAIN,
                        clientId: <string>process.env.API_CLIENT_ID,
                        clientSecret: <string>process.env.API_CLIENT_SECRET
                    });
                    authClient.setCredentials({
                        refresh_token: cognitoCredentials.refreshToken,
                        // expiry_date: number;
                        access_token: cognitoCredentials.accessToken,
                        token_type: cognitoCredentials.tokenType
                    });
                    await authClient.refreshAccessToken();
                    const profile = <IProfile>jwt.decode((<any>authClient.credentials).id_token);
                    const group = (Array.isArray(profile['cognito:groups']) && profile['cognito:groups'].length > 0)
                        ? { name: profile['cognito:groups'][0], description: '' }
                        : { name: '', description: '' };

                    // ログイン
                    (<Express.Session>req.session).staffUser = {
                        username: profile['cognito:username'],
                        familyName: profile.family_name,
                        givenName: profile.given_name,
                        email: profile.email,
                        telephone: profile.phone_number,
                        group: group
                    };

                    const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/staff/mypage';
                    res.redirect(cb);

                    return;
                }
            }
        }

        res.render('staff/auth/login', { layout: 'layouts/staff/login' });
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (req.session !== undefined) {
            delete req.session.staffUser;
            delete req.session.cognitoCredentials;
        }

        // await ttts.Models.Authentication.remove({ token: req.cookies.remember_staff }).exec();

        res.clearCookie('remember_staff');
        res.redirect('/staff/mypage');
    } catch (error) {
        next(error);
    }
}

export async function auth(req: Request, res: Response): Promise<void> {
    try {
        if (req.session === undefined) {
            throw new Error('session undefined.');
        }

        res.json({
            success: true,
            token: req.tttsAuthClient.credentials,
            errors: null
        });
    } catch (error) {
        res.json({
            success: false,
            token: null,
            errors: error
        });
    }
}
