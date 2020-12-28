"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 予約管理スタッフルーティング
 */
const express = require("express");
const myPageController = require("../controllers/staff/mypage");
const suspensionController = require("../controllers/staff/suspension");
const authentication_1 = require("../middlewares/authentication");
const staffRouter = express.Router();
staffRouter.all('/mypage', authentication_1.default, myPageController.index);
staffRouter.get('/mypage/print', authentication_1.default, myPageController.print);
staffRouter.get('/mypage/printByToken', authentication_1.default, myPageController.printByToken);
staffRouter.post('/mypage/print/token', authentication_1.default, myPageController.getPrintToken);
// 運行・オンライン販売停止設定コントローラー
staffRouter.get('/suspension/setting/performances', authentication_1.default, suspensionController.performances);
// 運行・オンライン販売停止一覧コントローラー
staffRouter.get('/suspension/list', authentication_1.default, suspensionController.index);
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
