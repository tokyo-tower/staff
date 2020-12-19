"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 入場ルーター
 */
const express = require("express");
const checkInController = require("../controllers/checkIn");
// import userAuthentication from '../middlewares/userAuthentication';
const user_1 = require("../user");
const checkinRouter = express.Router();
// ログイン
checkinRouter.all('/login', (__, res) => {
    res.redirect('/checkin/confirm');
});
// ログアウト
checkinRouter.all('/logout', 
// userAuthentication,
(req, res) => {
    // 再ログイン後に入場ページへ遷移させるために、ログアウトURLをカスタマイズ
    const user = user_1.User.PARSE(req.session, req.hostname, '/checkin/confirm');
    const logoutUrl = user.generateLogoutUrl();
    const authUrl = user.generateAuthUrl();
    const redirect = `${logoutUrl.split('?')[0]}?${authUrl.split('?')[1]}`;
    res.redirect(redirect);
    // res.redirect(`${<string>req.staffUser?.generateLogoutUrl()}`);
});
// 入場確認
checkinRouter.get('/confirm', checkInController.confirm);
checkinRouter.post('/confirm', checkInController.confirm);
// テスト！(入場確認)
checkinRouter.get('/confirmTest', checkInController.confirmTest);
checkinRouter.post('/confirmTest', checkInController.confirmTest);
// api・チケット認証関連
checkinRouter.post('/performance/reservations', checkInController.getReservations);
checkinRouter.get('/reservation/:qr', checkInController.getReservation);
checkinRouter.post('/reservation/:qr', checkInController.addCheckIn);
checkinRouter.delete('/reservation/:qr', checkInController.removeCheckIn);
exports.default = checkinRouter;
