/**
 * 当日窓口ルーティング
 *
 * @ignore
 */

import { CommonUtil, Models } from '@motionpicture/chevre-domain';
import * as express from 'express';
import * as windowAuthController from '../controllers/window/auth';
import * as windowCancelController from '../controllers/window/cancel';
import * as windowMyPageController from '../controllers/window/mypage';
import * as windowReserveController from '../controllers/window/reserve';
import WindowUser from '../models/user/window';

const router = express.Router();

const authentication = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.windowUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    // 既ログインの場合
    if (req.windowUser.isAuthenticated()) {
        // 言語設定
        if (req.windowUser.get('locale') !== undefined && req.windowUser.get('locale') !== null) {
            req.setLocale(req.windowUser.get('locale'));
        }

        next();
        return;
    }

    // 自動ログインチェック
    const checkRemember = async () => {
        if (req.cookies.remember_window === undefined) {
            return null;
        }

        try {
            const authenticationDoc = await Models.Authentication.findOne(
                {
                    token: req.cookies.remember_window,
                    window: { $ne: null }
                }
            ).exec();

            if (authenticationDoc === null) {
                res.clearCookie('remember_window');
                return null;
            }

            // トークン再生成
            const token = CommonUtil.createToken();
            await authenticationDoc.update({ token: token }).exec();

            // tslint:disable-next-line:no-cookies
            res.cookie('remember_window', token, { path: '/', httpOnly: true, maxAge: 604800000 });
            return await Models.Window.findOne({ _id: authenticationDoc.get('window') }).exec();
        } catch (error) {
            return null;
        }
    };

    const user = await checkRemember();
    if (user !== null && req.session !== undefined) {
        // ログインしてリダイレクト
        req.session[WindowUser.AUTH_SESSION_NAME] = user.toObject();
        res.redirect(req.originalUrl);
    } else {
        if (req.xhr) {
            res.json({
                success: false,
                message: 'login required'
            });
        } else {
            res.redirect(`/window/login?cb=${req.originalUrl}`);
        }
    }
};

const base = (req: express.Request, __: express.Response, next: express.NextFunction) => {
    // 基本的に日本語
    req.setLocale('ja');
    req.windowUser = WindowUser.parse(req.session);
    next();
};

router.all('/login', base, windowAuthController.login);
router.all('/logout', base, windowAuthController.logout);
router.all('/mypage', base, authentication, windowMyPageController.index);
router.get('/mypage/search', base, authentication, windowMyPageController.search);
router.get('/reserve/start', base, authentication, windowReserveController.start);
router.all('/reserve/terms', base, authentication, windowReserveController.terms);
router.all('/reserve/performances', base, authentication, windowReserveController.performances);
router.all('/reserve/seats', base, authentication, windowReserveController.seats);
router.all('/reserve/tickets', base, authentication, windowReserveController.tickets);
router.all('/reserve/profile', base, authentication, windowReserveController.profile);
router.all('/reserve/confirm', base, authentication, windowReserveController.confirm);
router.get('/reserve/:performanceDay/:paymentNo/complete', base, authentication, windowReserveController.complete);
router.post('/cancel/execute', base, authentication, windowCancelController.execute);

export default router;
