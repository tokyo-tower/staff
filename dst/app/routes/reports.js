"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * レポート管理ルーター
 */
const express_1 = require("express");
const reportsController = require("../controllers/reports");
const mypage_1 = require("../controllers/staff/mypage");
const NEW_REPORT_URL = process.env.NEW_REPORT_URL;
const reportsRouter = express_1.Router();
reportsRouter.get('/suspension/list', (__, res) => {
    res.render('reports/list', {
        layout: 'layouts/staff/layout'
    });
});
// 検索API
reportsRouter.get('/search', reportsController.search);
// 売上レポート出力
reportsRouter.get('', (__, res) => {
    if (typeof NEW_REPORT_URL === 'string' && NEW_REPORT_URL.length > 0) {
        res.redirect(NEW_REPORT_URL);
        return;
    }
    res.render('reports/index', {
        title: 'レポート',
        routeName: 'master.report.index',
        layout: 'layouts/master/layout'
    });
});
reportsRouter.get('/sales', (__, res) => {
    res.render('reports/sales', {
        title: '売上レポート出力',
        routeName: 'master.report.sales',
        layout: 'layouts/master/layout',
        ReportType: reportsController.ReportType
    });
});
// アカウント別レポート出力
reportsRouter.get('/account', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const cognitoUsers = yield mypage_1.searchTicketClerks(req);
        if (cognitoUsers.length <= 0) {
            throw new Error('購入アカウントが見つかりませんでした');
        }
        const hours = [];
        // tslint:disable-next-line:no-magic-numbers
        for (let hour = 0; hour < 24; hour += 1) {
            // tslint:disable-next-line:no-magic-numbers
            hours.push((`00${hour}`).slice(-2));
        }
        //const minutes: string[] = ['00', '15', '30', '45'];
        const minutes = [];
        // tslint:disable-next-line:no-magic-numbers
        for (let minute = 0; minute < 60; minute += 1) {
            // tslint:disable-next-line:no-magic-numbers
            minutes.push((`00${minute}`).slice(-2));
        }
        // 画面描画
        res.render('reports/account', {
            cognitoUsers: cognitoUsers,
            hours: hours,
            minutes: minutes,
            title: 'アカウント別レポート出力',
            routeName: 'master.report.account',
            layout: 'layouts/master/layout'
        });
    }
    catch (error) {
        next(error);
    }
}));
reportsRouter.get('/getAggregateSales', reportsController.getAggregateSales);
exports.default = reportsRouter;
