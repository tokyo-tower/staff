"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 代理予約スタッフルーティング
 */
const express = require("express");
const staffMyPageController = require("../controllers/staff/mypage");
const staffSuspensionListController = require("../controllers/staff/suspensionList");
const staffSuspensionSettingController = require("../controllers/staff/suspensionSetting");
const authentication_1 = require("../middlewares/authentication");
const staffRouter = express.Router();
staffRouter.all('/mypage', authentication_1.default, staffMyPageController.index);
staffRouter.get('/mypage/print', authentication_1.default, staffMyPageController.print);
// 運行・オンライン販売停止設定コントローラー
staffRouter.get('/suspension/setting/performances', authentication_1.default, staffSuspensionSettingController.performances);
// 運行・オンライン販売停止一覧コントローラー
staffRouter.get('/suspension/list', authentication_1.default, staffSuspensionListController.index);
staffRouter.get('/auth', (req, res) => {
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
exports.default = staffRouter;
