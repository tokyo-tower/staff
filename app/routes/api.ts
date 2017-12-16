/**
 * APIルーティング
 * @ignore
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as express from 'express';
import * as PerformancesController from '../controllers/api/performances';
import * as SuspendedPerformancesController from '../controllers/api/performances/suspended';
import * as ReservationsController from '../controllers/api/reservations';
import StaffUser from '../models/user/staff';

const apiRouter = express.Router();

const authentication = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));

        return;
    }

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
            console.error(error);
        }
    }

    if (req.xhr) {
        res.json({
            success: false,
            message: 'login required'
        });
    } else {
        res.redirect(`/staff/login?cb=${req.originalUrl}`);
    }
};

const base = (req: express.Request, __: express.Response, next: express.NextFunction) => {
    req.staffUser = StaffUser.parse(req.session);
    next();
};

apiRouter.get('/reservations', base, authentication, ReservationsController.search);
apiRouter.post('/reservations/updateWatcherName', base, authentication, ReservationsController.updateWatcherName);
apiRouter.post('/reservations/cancel', base, authentication, ReservationsController.cancel);

// 運行・オンライン販売停止設定コントローラー
apiRouter.post('/performances/updateOnlineStatus', base, authentication, PerformancesController.updateOnlineStatus);

// 運行・オンライン販売停止一覧コントローラー
apiRouter.get('/performances/suspended', base, authentication, SuspendedPerformancesController.searchSuspendedPerformances);
apiRouter.post(
    '/performances/suspended/:performanceId/tasks/returnOrders', base, authentication, SuspendedPerformancesController.returnOrders);

export default apiRouter;
