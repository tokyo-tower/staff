"use strict";
/**
 * 内部関係者認証コントローラー
 * @namespace controller/staff/auth
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
const _ = require("underscore");
const staffLoginForm_1 = require("../../forms/staff/staffLoginForm");
const staff_1 = require("../../models/user/staff");
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
            res.locals.signature = '';
            if (req.method === 'POST') {
                staffLoginForm_1.default(req);
                const validationResult = yield req.getValidationResult();
                res.locals.userId = req.body.userId;
                res.locals.password = '';
                res.locals.language = req.body.language;
                res.locals.remember = req.body.remember;
                res.locals.signature = req.body.signature;
                res.locals.validation = validationResult.array();
                if (validationResult.isEmpty()) {
                    // ユーザー認証
                    const ownerRepo = new ttts.repository.Owner(ttts.mongoose.connection);
                    const owner = yield ownerRepo.ownerModel.findOne({
                        username: req.body.userId,
                        group: ttts.OwnerUtil.GROUP_STAFF
                    }).exec();
                    res.locals.userId = req.body.userId;
                    res.locals.password = '';
                    res.locals.language = req.body.language;
                    res.locals.remember = req.body.remember;
                    res.locals.signature = req.body.signature;
                    if (owner === null) {
                        res.locals.validation = [
                            { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                        ];
                    }
                    else {
                        // パスワードチェック
                        if (owner.get('password_hash') !== ttts.CommonUtil.createHash(req.body.password, owner.get('password_salt'))) {
                            res.locals.validation = [
                                { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                            ];
                        }
                        else {
                            // ログイン記憶
                            if (req.body.remember === 'on') {
                                // トークン生成
                                const authentication = yield ttts.Models.Authentication.create({
                                    token: ttts.CommonUtil.createToken(),
                                    owner: owner.get('_id'),
                                    signature: req.body.signature,
                                    locale: req.body.language
                                });
                                // tslint:disable-next-line:no-cookies
                                res.cookie('remember_staff', authentication.get('token'), { path: '/', httpOnly: true, maxAge: 604800000 });
                            }
                            // ログイン
                            req.session[staff_1.default.AUTH_SESSION_NAME] = owner.toObject();
                            req.session[staff_1.default.AUTH_SESSION_NAME].signature = req.body.signature;
                            req.session[staff_1.default.AUTH_SESSION_NAME].locale = req.body.language;
                            const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/staff/mypage';
                            res.redirect(cb);
                            return;
                        }
                    }
                }
            }
            res.render('staff/auth/login', { layout: 'layouts/staff/login' });
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.login = login;
function logout(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (req.session === undefined) {
                next(new Error(req.__('Message.UnexpectedError')));
                return;
            }
            delete req.session[staff_1.default.AUTH_SESSION_NAME];
            yield ttts.Models.Authentication.remove({ token: req.cookies.remember_staff }).exec();
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
            const token = yield ttts.CommonUtil.getToken({
                authorizeServerDomain: process.env.API_AUTHORIZE_SERVER_DOMAIN,
                clientId: process.env.API_CLIENT_ID,
                clientSecret: process.env.API_CLIENT_SECRET,
                scopes: [
                    `${process.env.API_RESOURECE_SERVER_IDENTIFIER}/performances.read-only`
                ],
                state: ''
            });
            res.json({
                success: true,
                token: token,
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
// async function getToken(): Promise<any> {
//     return new Promise((resolve, reject) => {
//         request.post(`${process.env.API_ENDPOINT}oauth/token`, {
//             body: {
//                 grant_type: 'client_credentials',
//                 client_id: 'motionpicture',
//                 client_secret: 'motionpicture',
//                 state: 'state123456789',
//                 scopes: [
//                     'performances.read-only'
//                 ]
//             },
//             json: true
//             },       (error, response, body) => {
//             // tslint:disable-next-line:no-magic-numbers
//             if (response.statusCode === 200) {
//                 resolve(body);
//             } else {
//                 reject(error);
//             }
//         });
//     });
// }
