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
 * ユーザー認証ミドルウェア
 */
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const user_1 = require("../user");
exports.default = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    req.staffUser = user_1.User.PARSE(req.session, req.hostname, req.originalUrl);
    // 既ログインの場合
    if (req.staffUser.isAuthenticated()) {
        // tttsapi認証クライアントをリクエストオブジェクトにセット
        const cognitoCredentials = req.session.cognitoCredentials;
        if (cognitoCredentials === undefined) {
            next(new Error(res.__('UnexpectedError')));
            return;
        }
        const oauth2Client = new tttsapi.auth.OAuth2({
            domain: process.env.API_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.API_CLIENT_ID,
            clientSecret: process.env.API_CLIENT_SECRET
        });
        oauth2Client.setCredentials({
            refresh_token: cognitoCredentials.refreshToken,
            // expiry_date: moment().add(<number>authenticationResult.ExpiresIn, 'seconds').unix(),
            // expiry_date: authenticationResult.ExpiresIn,
            access_token: cognitoCredentials.accessToken,
            token_type: cognitoCredentials.tokenType
        });
        req.tttsAuthClient = oauth2Client;
        next();
        return;
    }
    if (req.xhr) {
        res.json({
            success: false,
            message: 'login required'
        });
    }
    else {
        // ログインページへリダイレクト
        res.redirect(req.staffUser.generateAuthUrl());
        // res.redirect(`/auth/login?cb=${req.originalUrl}`);
    }
});
