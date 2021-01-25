"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ルーティング
 */
const express_1 = require("express");
const expressLayouts = require("express-ejs-layouts");
// tslint:disable-next-line:no-require-imports
const partials = require("express-partials");
const api_1 = require("./api");
const checkin_1 = require("./checkin");
const dashboard_1 = require("./dashboard");
const projects_1 = require("./projects");
const reports_1 = require("./reports");
const staff_1 = require("./staff");
const PROJECT_ID = process.env.PROJECT_ID;
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
// リクエストプロジェクトをセット
router.use((req, __, next) => {
    if (typeof PROJECT_ID === 'string' && PROJECT_ID.length > 0) {
        req.project = { id: PROJECT_ID };
    }
    next();
});
router.use('/api', api_1.default);
router.use('/staff', partials(), staff_1.default);
router.use('/reports', partials(), reports_1.default); //レポート出力
// 入場
router.use('/checkin', partials(), checkin_1.default);
// 以下新しいレイアウト
router.use(expressLayouts);
router.use(dashboard_1.default);
router.use('/projects', projects_1.default);
exports.default = router;
