"use strict";
/**
 * 内部関係者ルーティング
 *
 * @ignore
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
const express = require("express");
const staffAuthController = require("../controllers/staff/auth");
const staffCancelController = require("../controllers/staff/cancel");
const staffMyPageController = require("../controllers/staff/mypage");
const staffReserveController = require("../controllers/staff/reserve");
const staffSuspensionListController = require("../controllers/staff/suspensionList");
const staffSuspensionSettingController = require("../controllers/staff/suspensionSetting");
const staff_1 = require("../models/user/staff");
const staffRouter = express.Router();
const authentication = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }
    // 既ログインの場合
    if (req.staffUser.isAuthenticated()) {
        // 言語設定
        if (req.staffUser.get('locale') !== undefined && req.staffUser.get('locale') !== null) {
            req.setLocale(req.staffUser.get('locale'));
        }
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
                // ログインしてリダイレクト
                req.session[staff_1.default.AUTH_SESSION_NAME] = (owner !== null) ? owner.toObject() : null;
                req.session[staff_1.default.AUTH_SESSION_NAME].signature = authenticationDoc.get('signature');
                req.session[staff_1.default.AUTH_SESSION_NAME].locale = authenticationDoc.get('locale');
                res.redirect(req.originalUrl);
                return;
            }
        }
        catch (error) {
            console.error(error);
        }
    }
    if (req.xhr) {
        res.json({
            success: false,
            message: 'login required'
        });
    }
    else {
        res.redirect(`/staff/login?cb=${req.originalUrl}`);
    }
});
const base = (req, __, next) => {
    req.staffUser = staff_1.default.parse(req.session);
    next();
};
staffRouter.all('/login', base, staffAuthController.login);
staffRouter.all('/logout', base, staffAuthController.logout);
staffRouter.all('/mypage', base, authentication, staffMyPageController.index);
staffRouter.get('/mypage/search', base, authentication, staffMyPageController.search);
staffRouter.post('/mypage/updateWatcherName', base, authentication, staffMyPageController.updateWatcherName);
staffRouter.get('/reserve/start', base, authentication, staffReserveController.start);
staffRouter.all('/reserve/terms', base, authentication, staffReserveController.terms);
staffRouter.all('/reserve/performances', base, authentication, staffReserveController.performances);
//staffRouter.all('/reserve/seats', base, authentication, staffReserveController.seats);
staffRouter.all('/reserve/tickets', base, authentication, staffReserveController.tickets);
staffRouter.all('/reserve/profile', base, authentication, staffReserveController.profile);
staffRouter.all('/reserve/confirm', base, authentication, staffReserveController.confirm);
staffRouter.get('/reserve/:performanceDay/:paymentNo/complete', base, authentication, staffReserveController.complete);
staffRouter.post('/cancel/execute', base, authentication, staffCancelController.execute);
// 運行・オンライン販売停止設定コントローラー
staffRouter.all('/suspension/setting/performances', base, authentication, staffSuspensionSettingController.performances);
staffRouter.get('/suspension/setting/start', base, authentication, staffSuspensionSettingController.start);
staffRouter.post('/suspension/setting/execute', base, authentication, staffSuspensionSettingController.execute);
// 運行・オンライン販売停止一覧コントローラー
staffRouter.all('/suspension/list', base, authentication, staffSuspensionListController.index);
staffRouter.get('/suspension/list/search', base, authentication, staffSuspensionListController.search);
staffRouter.post('/suspension/list/refund/process', base, authentication, staffSuspensionListController.refundProcess);
staffRouter.get('/auth', base, staffAuthController.auth);
exports.default = staffRouter;
