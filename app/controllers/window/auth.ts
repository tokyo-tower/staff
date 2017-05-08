/**
 * 当日窓口認証コントローラー
 *
 * @namespace controller/window/auth
 */

import { CommonUtil, Models } from '@motionpicture/chevre-domain';
import { NextFunction, Request, Response } from 'express';
import * as _ from 'underscore';

import windowLoginForm from '../../forms/window/windowLoginForm';
import WindowUser from '../../models/user/window';

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

    if (req.method === 'POST') {
        windowLoginForm(req);
        const validationResult = await req.getValidationResult();
        if (!validationResult.isEmpty()) {
            res.locals.userId = req.body.userId;
            res.locals.password = '';
            res.locals.validation = validationResult.array();
            res.render('window/auth/login', { layout: layout });
            return;
        }
        try {
            // ユーザー認証
            const window = await Models.Window.findOne(
                {
                    user_id: req.body.userId
                }
            ).exec();

            res.locals.userId = req.body.userId;
            res.locals.password = '';

            if (window === null) {
                res.locals.validation = [
                    { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                ];
                res.render('window/auth/login', { layout: layout });
                return;
            }

            // パスワードチェック
            if (window.get('password_hash') !== CommonUtil.createHash(req.body.password, window.get('password_salt'))) {
                res.locals.validation = [
                    { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                ];
                res.render('window/auth/login', { layout: layout });
                return;
            }

            // ログイン記憶
            if (req.body.remember === 'on') {
                // トークン生成
                const authentication = await Models.Authentication.create(
                    {
                        token: CommonUtil.createToken(),
                        window: window.get('_id')
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
            (<Express.Session>req.session)[WindowUser.AUTH_SESSION_NAME] = window.toObject();

            const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/window/mypage';
            res.redirect(cb);
            return;
        } catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
    } else {
        res.locals.userId = '';
        res.locals.password = '';

        res.render('window/auth/login', { layout: layout });
        return;
    }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (req.session === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }

        delete req.session[WindowUser.AUTH_SESSION_NAME];
        await Models.Authentication.remove({ token: req.cookies.remember_window }).exec();

        res.clearCookie('remember_window');
        res.redirect('/window/mypage');
    } catch (error) {
        next(error);
    }
}
