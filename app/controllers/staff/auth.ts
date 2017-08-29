/**
 * 内部関係者認証コントローラー
 *
 * @namespace controller/staff/auth
 */

import * as TTTS from '@motionpicture/ttts-domain';
import { NextFunction, Request, Response } from 'express';
// import * as request from 'request'; // for token
import * as _ from 'underscore';

import staffLoginForm from '../../forms/staff/staffLoginForm';
import StaffUser from '../../models/user/staff';

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
        res.locals.signature = '';

        if (req.method === 'POST') {
            staffLoginForm(req);
            const validationResult = await req.getValidationResult();
            res.locals.userId = req.body.userId;
            res.locals.password = '';
            res.locals.language = req.body.language;
            res.locals.remember = req.body.remember;
            res.locals.signature = req.body.signature;
            res.locals.validation = validationResult.array();

            if (validationResult.isEmpty()) {
                // ユーザー認証
                const owner = await TTTS.Models.Owner.findOne(
                    {
                        username: req.body.userId,
                        group: TTTS.OwnerUtil.GROUP_STAFF
                    }
                ).exec();

                res.locals.userId = req.body.userId;
                res.locals.password = '';
                res.locals.language = req.body.language;
                res.locals.remember = req.body.remember;
                res.locals.signature = req.body.signature;

                if (owner === null) {
                    res.locals.validation = [
                        { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                    ];
                } else {
                    // パスワードチェック
                    if (owner.get('password_hash') !== TTTS.CommonUtil.createHash(req.body.password, owner.get('password_salt'))) {
                        res.locals.validation = [
                            { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                        ];
                    } else {
                        // ログイン記憶
                        if (req.body.remember === 'on') {
                            // トークン生成
                            const authentication = await TTTS.Models.Authentication.create(
                                {
                                    token: TTTS.CommonUtil.createToken(),
                                    owner: owner.get('_id'),
                                    signature: req.body.signature,
                                    locale: req.body.language
                                }
                            );
                            // tslint:disable-next-line:no-cookies
                            res.cookie(
                                'remember_staff',
                                authentication.get('token'),
                                { path: '/', httpOnly: true, maxAge: 604800000 }
                            );
                        }

                        // ログイン
                        (<Express.Session>req.session)[StaffUser.AUTH_SESSION_NAME] = owner.toObject();
                        (<Express.Session>req.session)[StaffUser.AUTH_SESSION_NAME].signature = req.body.signature;
                        (<Express.Session>req.session)[StaffUser.AUTH_SESSION_NAME].locale = req.body.language;

                        const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/staff/mypage';
                        res.redirect(cb);
                        return;
                    }
                }
            }
        }

        res.render('staff/auth/login', { layout: 'layouts/staff/login' });
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (req.session === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }

        delete req.session[StaffUser.AUTH_SESSION_NAME];
        await TTTS.Models.Authentication.remove({ token: req.cookies.remember_staff }).exec();

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
        //const token: string = await getToken();
        const token: string = await TTTS.CommonUtil.getToken(process.env.API_ENDPOINT);
        res.json({
            success: true,
            token: token,
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
// async function getToken(): Promise<any> {
//     return new Promise((resolve, reject) => {
//         request.post(`${process.env.API_ENDPOINT}oauth/token`, {
//             body: {
//                 grant_type: 'client_credentials',
//                 client_id: 'motionpicture',
//                 client_secret: 'motionpicture',
//                 state: 'state123456789',
//                 scopes: [
//                     'performances.read-only'
//                 ]
//             },
//             json: true
//             },       (error, response, body) => {
//             // tslint:disable-next-line:no-magic-numbers
//             if (response.statusCode === 200) {
//                 resolve(body);
//             } else {
//                 reject(error);
//             }
//         });
//     });
// }
