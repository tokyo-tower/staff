/**
 * 内部関係者認証コントローラー
 * @namespace controllers.staff.auth
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as _ from 'underscore';

import staffLoginForm from '../../forms/staff/staffLoginForm';

const debug = createDebug('ttts-staff:controller:staff:auth');

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
                    (<Express.Session>req.session).cognitoCredentials =
                        await ttts.service.admin.login(
                            <string>process.env.AWS_ACCESS_KEY_ID,
                            <string>process.env.AWS_SECRET_ACCESS_KEY,
                            <string>process.env.API_CLIENT_ID,
                            <string>process.env.API_CLIENT_SECRET,
                            <string>process.env.COGNITO_USER_POOL_ID,
                            req.body.userId,
                            req.body.password
                        )();
                    debug('cognito credentials published.', (<Express.Session>req.session).cognitoCredentials);
                } catch (error) {
                    res.locals.validation = [
                        // { msg: req.__('Invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                        { msg: req.__('Invalid{{fieldName}}', { fieldName: 'パスワード' }) }
                    ];
                }

                const cognitoCredentials = (<Express.Session>req.session).cognitoCredentials;
                if (cognitoCredentials !== undefined) {
                    const cognitoUser = await ttts.service.admin.getUserByAccessToken(cognitoCredentials.accessToken)();

                    // ログイン記憶
                    // tslint:disable-next-line:no-suspicious-comment
                    // TODO Cognitoユーザーに合わせて調整
                    // if (req.body.remember === 'on') {
                    //     // トークン生成
                    //     const authentication = await ttts.Models.Authentication.create(
                    //         {
                    //             token: ttts.CommonUtil.createToken(),
                    //             owner: owner.get('id'),
                    //             locale: req.body.language
                    //         }
                    //     );
                    //     // tslint:disable-next-line:no-cookies
                    //     res.cookie(
                    //         'remember_staff',
                    //         authentication.get('token'),
                    //         { path: '/', httpOnly: true, maxAge: 604800000 }
                    //     );
                    // }

                    // ログイン
                    (<Express.Session>req.session).staffUser = cognitoUser;

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
