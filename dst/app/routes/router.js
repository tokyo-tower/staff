"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ルーティング
 */
const express_1 = require("express");
const api_1 = require("./api");
const checkin_1 = require("./checkin");
const reports_1 = require("./reports");
const staff_1 = require("./staff");
const DEFAULT_CALLBACK = process.env.DEFAULT_CALLBACK;
const router = express_1.Router();
// デフォルトトップページ
router.get('/', (_, res, next) => {
    if (typeof DEFAULT_CALLBACK === 'string' && DEFAULT_CALLBACK.length > 0) {
        res.redirect(DEFAULT_CALLBACK);
        return;
    }
    next();
});
router.use('/api', api_1.default);
router.use('/staff', staff_1.default);
router.use('/reports', reports_1.default); //レポート出力
// 入場
router.use('/checkin', checkin_1.default);
exports.default = router;
