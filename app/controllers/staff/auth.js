"use strict";
/**
 * 内部関係者認証コントローラー
 * @namespace controllers.staff.auth
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
const ttts = require("@motionpicture/ttts-domain");
const createDebug = require("debug");
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
                        req.session.cognitoCredentials =
                            yield ttts.service.admin.login(process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, process.env.API_CLIENT_ID, process.env.API_CLIENT_SECRET, process.env.COGNITO_USER_POOL_ID, req.body.userId, req.body.password)();
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
                        const cognitoUser = yield ttts.service.admin.getUserByAccessToken(cognitoCredentials.accessToken)();
                        // ログイン記憶
                        // tslint:disable-next-line:no-suspicious-comment
                        // TODO Cognitoユーザーに合わせて調整
                        // if (req.body.remember === 'on') {
                        //     // トークン生成
                        //     const authentication = await ttts.Models.Authentication.create(
                        //         {
                        //             token: ttts.CommonUtil.createToken(),
                        //             owner: owner.get('id'),
                        //             locale: req.body.language
                        //         }
                        //     );
                        //     // tslint:disable-next-line:no-cookies
                        //     res.cookie(
                        //         'remember_staff',
                        //         authentication.get('token'),
                        //         { path: '/', httpOnly: true, maxAge: 604800000 }
                        //     );
                        // }
                        // ログイン
                        req.session.staffUser = cognitoUser;
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
            // await ttts.Models.Authentication.remove({ token: req.cookies.remember_staff }).exec();
            res.clearCookie('remember_staff');
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
