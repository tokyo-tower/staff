/**
 * 内部関係者認証コントローラー
 *
 * @namespace controller/staff/auth
 */

import { CommonUtil, Models } from '@motionpicture/chevre-domain';
import { NextFunction, Request, Response } from 'express';
import * as _ from 'underscore';

import staffLoginForm from '../../forms/staff/staffLoginForm';
import StaffUser from '../../models/user/staff';

const layout: string = 'layouts/staff/layout';

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

    if (req.method === 'POST') {
        staffLoginForm(req);
        const validationResult = await req.getValidationResult();
        if (!validationResult.isEmpty()) {
            res.locals.userId = req.body.userId;
            res.locals.password = '';
            res.locals.language = req.body.language;
            res.locals.remember = req.body.remember;
            res.locals.signature = req.body.signature;
            res.locals.validation = validationResult.array();
            res.render('staff/auth/login', { layout: layout });
            return;
        }
        try {
            // ユーザー認証
            const staff = await Models.Staff.findOne(
                {
                    user_id: req.body.userId
                }
            ).exec();

            res.locals.userId = req.body.userId;
            res.locals.password = '';
            res.locals.language = req.body.language;
            res.locals.remember = req.body.remember;
            res.locals.signature = req.body.signature;

            if (staff === null) {
                res.locals.validation = [
                    { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                ];
                res.render('staff/auth/login', { layout: layout });
                return;
            }

            // パスワードチェック
            if (staff.get('password_hash') !== CommonUtil.createHash(req.body.password, staff.get('password_salt'))) {
                res.locals.validation = [
                    { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                ];
                res.render('staff/auth/login', { layout: layout });
                return;
            }

            // ログイン記憶
            if (req.body.remember === 'on') {
                // トークン生成
                const authentication = await Models.Authentication.create(
                    {
                        token: CommonUtil.createToken(),
                        staff: staff.get('_id'),
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
            (<Express.Session>req.session)[StaffUser.AUTH_SESSION_NAME] = staff.toObject();
            (<Express.Session>req.session)[StaffUser.AUTH_SESSION_NAME].signature = req.body.signature;
            (<Express.Session>req.session)[StaffUser.AUTH_SESSION_NAME].locale = req.body.language;

            const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/staff/mypage';
            res.redirect(cb);
            return;
        } catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
    } else {
        res.locals.userId = '';
        res.locals.password = '';
        res.locals.signature = '';

        res.render('staff/auth/login', { layout: layout });
    }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (req.session === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }

        delete req.session[StaffUser.AUTH_SESSION_NAME];
        await Models.Authentication.remove({ token: req.cookies.remember_staff }).exec();

        res.clearCookie('remember_staff');
        res.redirect('/staff/mypage');
    } catch (error) {
        next(error);
    }
}
