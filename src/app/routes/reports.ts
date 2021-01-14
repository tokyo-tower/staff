/**
 * レポート管理ルーター
 */
import { Router } from 'express';
import * as reportsController from '../controllers/reports';
import { searchTicketClerks } from '../controllers/staff/mypage';

const NEW_REPORT_URL = process.env.NEW_REPORT_URL;

const reportsRouter = Router();

reportsRouter.get(
    '/mypage',
    (__, res) => {
        res.render('reports/mypage', {
            layout: 'layouts/staff/layout'
        });
    }
);

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
reportsRouter.get('/account', async (req, res, next) => {
    try {
        const cognitoUsers = await searchTicketClerks(req);
        if (cognitoUsers.length <= 0) {
            throw new Error('購入アカウントが見つかりませんでした');
        }

        const hours: string[] = [];
        // tslint:disable-next-line:no-magic-numbers
        for (let hour: number = 0; hour < 24; hour += 1) {
            // tslint:disable-next-line:no-magic-numbers
            hours.push((`00${hour}`).slice(-2));
        }
        //const minutes: string[] = ['00', '15', '30', '45'];
        const minutes: string[] = [];
        // tslint:disable-next-line:no-magic-numbers
        for (let minute: number = 0; minute < 60; minute += 1) {
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
    } catch (error) {
        next(error);
    }
});

reportsRouter.get('/getAggregateSales', reportsController.getAggregateSales);

export default reportsRouter;
