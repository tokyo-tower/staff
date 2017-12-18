/**
 * ユーザー認証ミドルウェア
 * @namespace middlewares.authentication
 */

import * as ttts from '@motionpicture/ttts-domain';
import { NextFunction, Request, Response } from 'express';

import StaffUser from '../models/user/staff';

export default async (req: Request, res: Response, next: NextFunction) => {
    req.staffUser = StaffUser.parse(req.session);

    // if (req.staffUser === undefined) {
    //     next(new Error(req.__('UnexpectedError')));

    //     return;
    // }

    // 既ログインの場合
    if (req.staffUser.isAuthenticated()) {
        // 言語設定
        if (req.staffUser.get('locale') !== undefined && req.staffUser.get('locale') !== null) {
            req.setLocale(req.staffUser.get('locale'));
        }

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

                // ログインしてリダイレクト
                (<Express.Session>req.session)[StaffUser.AUTH_SESSION_NAME] = (owner !== null) ? owner.toObject() : null;
                (<Express.Session>req.session)[StaffUser.AUTH_SESSION_NAME].signature = authenticationDoc.get('signature');
                (<Express.Session>req.session)[StaffUser.AUTH_SESSION_NAME].locale = authenticationDoc.get('locale');
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
