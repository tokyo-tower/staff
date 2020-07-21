"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 認証ルーティング
 */
const express = require("express");
const staffAuthController = require("../controllers/staff/auth");
const user_1 = require("../user");
const authRouter = express.Router();
authRouter.all('/auth/login', staffAuthController.login);
authRouter.all('/auth/logout', staffAuthController.logout);
/**
 * サインイン
 * Cognitoからリダイレクトしてくる
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
authRouter.get('/signIn', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // stateにはイベントオブジェクトとして受け取ったリクエストボディが入っている
        const user = user_1.User.PARSE(req.session, req.hostname);
        yield user.signIn(req.query.code);
        user.authClient.setCredentials({
            refresh_token: user.getRefreshToken()
        });
        yield user.authClient.refreshAccessToken();
        const loginTicket = user.authClient.verifyIdToken({});
        const profile = loginTicket.payload;
        if (profile === undefined) {
            throw new Error('cannot get profile from id_token');
        }
        // const profile = <IProfile>jwt.decode((<any>authClient.credentials).id_token);
        const group = (Array.isArray((profile)['cognito:groups']) && profile['cognito:groups'].length > 0)
            ? { name: profile['cognito:groups'][0], description: '' }
            : { name: '', description: '' };
        // ログイン
        req.session.staffUser = {
            username: profile['cognito:username'],
            familyName: profile.family_name,
            givenName: profile.given_name,
            email: profile.email,
            telephone: profile.phone_number,
            group: group
        };
        const cb = (typeof req.query.cb === 'string' && req.query.cb.length > 0) ? req.query.cb : '/staff/mypage';
        res.redirect(cb);
    }
    catch (error) {
        next(error);
    }
}));
/**
 * ログアウト
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
authRouter.get('/logout', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = user_1.User.PARSE(req.session, req.hostname);
        user.logout();
        res.redirect('/');
    }
    catch (error) {
        next(error);
    }
}));
exports.default = authRouter;
