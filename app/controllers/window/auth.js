"use strict";
/**
 * 当日窓口認証コントローラー
 *
 * @namespace controller/window/auth
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
const chevre_domain_1 = require("@motionpicture/chevre-domain");
const _ = require("underscore");
const windowLoginForm_1 = require("../../forms/window/windowLoginForm");
const window_1 = require("../../models/user/window");
const layout = 'layouts/window/layout';
/**
 * 窓口担当者ログイン
 * @method login
 * @returns {Promise<void>}
 */
function login(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.windowUser !== undefined && req.windowUser.isAuthenticated()) {
            res.redirect('/window/mypage');
            return;
        }
        if (req.method === 'POST') {
            windowLoginForm_1.default(req);
            const validationResult = yield req.getValidationResult();
            if (!validationResult.isEmpty()) {
                res.locals.userId = req.body.userId;
                res.locals.password = '';
                res.locals.validation = validationResult.array();
                res.render('window/auth/login', { layout: layout });
                return;
            }
            try {
                // ユーザー認証
                const window = yield chevre_domain_1.Models.Window.findOne({
                    user_id: req.body.userId
                }).exec();
                res.locals.userId = req.body.userId;
                res.locals.password = '';
                if (window === null) {
                    res.locals.validation = [
                        { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                    ];
                    res.render('window/auth/login', { layout: layout });
                    return;
                }
                // パスワードチェック
                if (window.get('password_hash') !== chevre_domain_1.CommonUtil.createHash(req.body.password, window.get('password_salt'))) {
                    res.locals.validation = [
                        { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                    ];
                    res.render('window/auth/login', { layout: layout });
                    return;
                }
                // ログイン記憶
                if (req.body.remember === 'on') {
                    // トークン生成
                    const authentication = yield chevre_domain_1.Models.Authentication.create({
                        token: chevre_domain_1.CommonUtil.createToken(),
                        window: window.get('_id')
                    });
                    // tslint:disable-next-line:no-cookies
                    res.cookie('remember_window', authentication.get('token'), { path: '/', httpOnly: true, maxAge: 604800000 });
                }
                // ログイン
                req.session[window_1.default.AUTH_SESSION_NAME] = window.toObject();
                const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/window/mypage';
                res.redirect(cb);
                return;
            }
            catch (error) {
                next(new Error(req.__('Message.UnexpectedError')));
                return;
            }
        }
        else {
            res.locals.userId = '';
            res.locals.password = '';
            res.render('window/auth/login', { layout: layout });
            return;
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
            delete req.session[window_1.default.AUTH_SESSION_NAME];
            yield chevre_domain_1.Models.Authentication.remove({ token: req.cookies.remember_window }).exec();
            res.clearCookie('remember_window');
            res.redirect('/window/mypage');
        }
        catch (error) {
            next(error);
        }
    });
}
exports.logout = logout;
