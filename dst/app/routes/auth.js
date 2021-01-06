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
const user_1 = require("../user");
const DEFAULT_CALLBACK = process.env.DEFAULT_CALLBACK;
const authRouter = express.Router();
/**
 * サインイン
 * Cognitoからリダイレクトしてくる
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
authRouter.get('/signIn', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // stateにはイベントオブジェクトとして受け取ったリクエストボディが入っている
        const user = user_1.User.PARSE(req.session, req.hostname, req.originalUrl);
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
        const group = (Array.isArray(profile['cognito:groups']) && profile['cognito:groups'].length > 0)
            ? { name: profile['cognito:groups'][0], description: '' }
            : { name: '', description: '' };
        // ログイン
        req.session.staffUser = {
            sub: profile.sub,
            username: profile['cognito:username'],
            familyName: profile.family_name,
            givenName: profile.given_name,
            email: profile.email,
            telephone: profile.phone_number,
            group: group
        };
        const redirect = (typeof req.query.state === 'string' && req.query.state.length > 0)
            ? req.query.state
            : (typeof DEFAULT_CALLBACK === 'string' && DEFAULT_CALLBACK.length > 0) ? DEFAULT_CALLBACK : '/';
        res.redirect(redirect);
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
        const user = user_1.User.PARSE(req.session, req.hostname, req.originalUrl);
        user.logout();
        const redirect = (typeof req.query.redirect === 'string' && req.query.redirect.length > 0) ? req.query.redirect : '/';
        res.redirect(redirect);
    }
    catch (error) {
        next(error);
    }
}));
exports.default = authRouter;
