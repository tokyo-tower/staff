"use strict";
/**
 * ユーザー認証ミドルウェア
 * @namespace middlewares.authentication
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const ttts = require("@motionpicture/ttts-domain");
const staff_1 = require("../models/user/staff");
// tslint:disable-next-line:max-func-body-length
exports.default = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    req.staffUser = staff_1.default.PARSE(req.session);
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
            clientSecret: process.env.API_CLIENT_SECRET,
            scopes: [
                `${process.env.API_RESOURECE_SERVER_IDENTIFIER}/performances.read-only`,
                `${process.env.API_RESOURECE_SERVER_IDENTIFIER}/transactions`
            ],
            state: ''
        });
        oauth2Client.setCredentials({
            refresh_token: cognitoCredentials.RefreshToken,
            // expiry_date: moment().add(<number>authenticationResult.ExpiresIn, 'seconds').unix(),
            // expiry_date: authenticationResult.ExpiresIn,
            access_token: cognitoCredentials.AccessToken,
            token_type: cognitoCredentials.TokenType
        });
        req.tttsAuthClient = oauth2Client;
        next();
        return;
    }
    // 自動ログインチェック
    if (req.cookies.remember_staff !== undefined) {
        try {
            const authenticationDoc = yield ttts.Models.Authentication.findOne({
                token: req.cookies.remember_staff,
                owner: { $ne: null }
            }).exec();
            if (authenticationDoc === null) {
                res.clearCookie('remember_staff');
            }
            else {
                // トークン再生成
                const token = ttts.CommonUtil.createToken();
                yield authenticationDoc.update({ token: token }).exec();
                // tslint:disable-next-line:no-cookies
                res.cookie('remember_staff', token, { path: '/', httpOnly: true, maxAge: 604800000 });
                const ownerRepo = new ttts.repository.Owner(ttts.mongoose.connection);
                const owner = yield ownerRepo.ownerModel.findOne({ _id: authenticationDoc.get('owner') }).exec();
                if (owner === null) {
                    throw new Error(res.__('UnexpectedError'));
                }
                // ログインしてリダイレクト
                req.session.staffUser = owner.toObject();
                res.redirect(req.originalUrl);
                return;
            }
        }
        catch (error) {
            next(error);
            return;
        }
    }
    if (req.xhr) {
        res.json({
            success: false,
            message: 'login required'
        });
    }
    else {
        res.redirect(`/auth/login?cb=${req.originalUrl}`);
    }
});
