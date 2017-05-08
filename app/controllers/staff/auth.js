"use strict";
/**
 * 内部関係者認証コントローラー
 *
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
const chevre_domain_1 = require("@motionpicture/chevre-domain");
const _ = require("underscore");
const staffLoginForm_1 = require("../../forms/staff/staffLoginForm");
const staff_1 = require("../../models/user/staff");
const layout = 'layouts/staff/layout';
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
        if (req.method === 'POST') {
            staffLoginForm_1.default(req);
            const validationResult = yield req.getValidationResult();
            if (!validationResult.isEmpty()) {
                res.locals.userId = req.body.userId;
                res.locals.password = '';
                res.locals.language = req.body.language;
                res.locals.remember = req.body.remember;
                res.locals.signature = req.body.signature;
                res.locals.validation = validationResult.array();
                res.render('staff/auth/login', { layout: layout });
                return;
            }
            try {
                // ユーザー認証
                const staff = yield chevre_domain_1.Models.Staff.findOne({
                    user_id: req.body.userId
                }).exec();
                res.locals.userId = req.body.userId;
                res.locals.password = '';
                res.locals.language = req.body.language;
                res.locals.remember = req.body.remember;
                res.locals.signature = req.body.signature;
                if (staff === null) {
                    res.locals.validation = [
                        { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                    ];
                    res.render('staff/auth/login', { layout: layout });
                    return;
                }
                // パスワードチェック
                if (staff.get('password_hash') !== chevre_domain_1.CommonUtil.createHash(req.body.password, staff.get('password_salt'))) {
                    res.locals.validation = [
                        { msg: req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                    ];
                    res.render('staff/auth/login', { layout: layout });
                    return;
                }
                // ログイン記憶
                if (req.body.remember === 'on') {
                    // トークン生成
                    const authentication = yield chevre_domain_1.Models.Authentication.create({
                        token: chevre_domain_1.CommonUtil.createToken(),
                        staff: staff.get('_id'),
                        signature: req.body.signature,
                        locale: req.body.language
                    });
                    // tslint:disable-next-line:no-cookies
                    res.cookie('remember_staff', authentication.get('token'), { path: '/', httpOnly: true, maxAge: 604800000 });
                }
                // ログイン
                req.session[staff_1.default.AUTH_SESSION_NAME] = staff.toObject();
                req.session[staff_1.default.AUTH_SESSION_NAME].signature = req.body.signature;
                req.session[staff_1.default.AUTH_SESSION_NAME].locale = req.body.language;
                const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/staff/mypage';
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
            res.locals.signature = '';
            res.render('staff/auth/login', { layout: layout });
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
            yield chevre_domain_1.Models.Authentication.remove({ token: req.cookies.remember_staff }).exec();
            res.clearCookie('remember_staff');
            res.redirect('/staff/mypage');
        }
        catch (error) {
            next(error);
        }
    });
}
exports.logout = logout;
