/**
 * 当日窓口認証コントローラー
 *
 * @namespace controller/window/auth
 */

import * as chevre from '@motionpicture/chevre-domain';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as _ from 'underscore';

import windowLoginForm from '../../forms/window/windowLoginForm';
import WindowUser from '../../models/user/window';

const debug = createDebug('chevre-staff:controller:windowAuth');
const layout: string = 'layouts/window/layout';

/**
 * 窓口担当者ログイン
 * @method login
 * @returns {Promise<void>}
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.windowUser !== undefined && req.windowUser.isAuthenticated()) {
        res.redirect('/window/mypage');
        return;
    }

    try {
        res.locals.userId = '';
        res.locals.password = '';

        if (req.method === 'POST') {
            windowLoginForm(req);
            const validationResult = await req.getValidationResult();
            res.locals.userId = req.body.userId;
            res.locals.password = '';
            res.locals.validation = validationResult.array();

            if (validationResult.isEmpty()) {
                // ユーザー認証
                const owner = await chevre.Models.Owner.findOne({
                    username: req.body.userId,
                    group: chevre.OwnerUtil.GROUP_WINDOW_STAFF
                }).exec();
                debug('owner:', owner);

                if (owner === null) {
                    res.locals.validation = [
                        { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                    ];
                } else {
                    // パスワードチェック
                    if (owner.get('password_hash') !== chevre.CommonUtil.createHash(req.body.password, owner.get('password_salt'))) {
                        res.locals.validation = [
                            { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                        ];
                    } else {
                        // ログイン記憶
                        if (req.body.remember === 'on') {
                            // トークン生成
                            const authentication = await chevre.Models.Authentication.create(
                                {
                                    token: chevre.CommonUtil.createToken(),
                                    owner: owner.get('_id')
                                }
                            );
                            // tslint:disable-next-line:no-cookies
                            res.cookie(
                                'remember_window',
                                authentication.get('token'),
                                { path: '/', httpOnly: true, maxAge: 604800000 }
                            );
                        }

                        // ログイン
                        (<Express.Session>req.session)[WindowUser.AUTH_SESSION_NAME] = owner.toObject();

                        const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/window/mypage';
                        res.redirect(cb);
                        return;
                    }
                }
            }
        }

        res.render('window/auth/login', { layout: layout });
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

        delete req.session[WindowUser.AUTH_SESSION_NAME];
        await chevre.Models.Authentication.remove({ token: req.cookies.remember_window }).exec();

        res.clearCookie('remember_window');
        res.redirect('/window/mypage');
    } catch (error) {
        next(error);
    }
}
