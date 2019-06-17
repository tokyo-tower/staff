"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 代理予約スタッフルーティング
 */
const express = require("express");
const staffAuthController = require("../controllers/staff/auth");
const staffMyPageController = require("../controllers/staff/mypage");
const staffReserveController = require("../controllers/staff/reserve");
const staffSuspensionListController = require("../controllers/staff/suspensionList");
const staffSuspensionSettingController = require("../controllers/staff/suspensionSetting");
const authentication_1 = require("../middlewares/authentication");
const staffRouter = express.Router();
staffRouter.all('/mypage', authentication_1.default, staffMyPageController.index);
staffRouter.get('/mypage/print', authentication_1.default, staffMyPageController.print);
staffRouter.get('/reserve/start', authentication_1.default, staffReserveController.start);
staffRouter.all('/reserve/terms', authentication_1.default, staffReserveController.terms);
staffRouter.all('/reserve/performances', authentication_1.default, staffReserveController.performances);
staffRouter.all('/reserve/tickets', authentication_1.default, staffReserveController.tickets);
staffRouter.all('/reserve/profile', authentication_1.default, staffReserveController.profile);
staffRouter.all('/reserve/confirm', authentication_1.default, staffReserveController.confirm);
staffRouter.get('/reserve/complete', authentication_1.default, staffReserveController.complete);
// 運行・オンライン販売停止設定コントローラー
staffRouter.get('/suspension/setting/performances', authentication_1.default, staffSuspensionSettingController.performances);
// 運行・オンライン販売停止一覧コントローラー
staffRouter.get('/suspension/list', authentication_1.default, staffSuspensionListController.index);
staffRouter.get('/auth', staffAuthController.auth);
exports.default = staffRouter;
