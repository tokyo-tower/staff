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
exports.auth = exports.logout = exports.login = void 0;
/**
 * 認証コントローラー
 */
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const createDebug = require("debug");
const request = require("request-promise-native");
const _ = require("underscore");
const staffLoginForm_1 = require("../../forms/staff/staffLoginForm");
const debug = createDebug('ttts-staff:controller:staff:auth');
/**
 * 内部関係者ログイン
 * @method login
 * @returns {Promise<void>}
 */
function login(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser !== undefined && req.staffUser.isAuthenticated()) {
            res.redirect('/staff/mypage');
            return;
        }
        try {
            res.locals.userId = '';
            res.locals.password = '';
            if (req.method === 'POST') {
                staffLoginForm_1.default(req);
                const validationResult = yield req.getValidationResult();
                res.locals.userId = req.body.userId;
                res.locals.password = '';
                res.locals.language = req.body.language;
                res.locals.remember = req.body.remember;
                res.locals.validation = validationResult.array();
                if (validationResult.isEmpty()) {
                    try {
                        // ログイン情報が有効であれば、Cognitoでもログイン
                        req.session.cognitoCredentials = yield request.post(`${process.env.TTTS_AUTHORIZE_SERVER}/oauth/token`, {
                            auth: {
                                user: process.env.API_CLIENT_ID,
                                pass: process.env.API_CLIENT_SECRET
                            },
                            json: true,
                            body: {
                                username: req.body.userId,
                                password: req.body.password
                            }
                        }).then((body) => body);
                        debug('cognito credentials published.', req.session.cognitoCredentials);
                    }
                    catch (error) {
                        res.locals.validation = [
                            // { msg: req.__('Invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                            { msg: req.__('Invalid{{fieldName}}', { fieldName: 'パスワード' }) }
                        ];
                    }
                    const cognitoCredentials = req.session.cognitoCredentials;
                    if (cognitoCredentials !== undefined) {
                        const authClient = new tttsapi.auth.OAuth2({
                            domain: process.env.API_AUTHORIZE_SERVER_DOMAIN,
                            clientId: process.env.API_CLIENT_ID,
                            clientSecret: process.env.API_CLIENT_SECRET
                        });
                        authClient.setCredentials({
                            refresh_token: cognitoCredentials.refreshToken,
                            // expiry_date: number;
                            access_token: cognitoCredentials.accessToken,
                            token_type: cognitoCredentials.tokenType
                        });
                        yield authClient.refreshAccessToken();
                        const loginTicket = authClient.verifyIdToken({});
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
                        const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/staff/mypage';
                        res.redirect(cb);
                        return;
                    }
                }
            }
            res.render('staff/auth/login', { layout: 'layouts/staff/login' });
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.login = login;
function logout(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (req.session !== undefined) {
                delete req.session.staffUser;
                delete req.session.cognitoCredentials;
            }
            res.redirect('/staff/mypage');
        }
        catch (error) {
            next(error);
        }
    });
}
exports.logout = logout;
function auth(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (req.session === undefined) {
                throw new Error('session undefined.');
            }
            res.json({
                success: true,
                token: req.tttsAuthClient.credentials,
                errors: null
            });
        }
        catch (error) {
            res.json({
                success: false,
                token: null,
                errors: error
            });
        }
    });
}
exports.auth = auth;
