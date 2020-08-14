/**
 * レポート出力管理ルーター
 */
import * as cinerinoapi from '@cinerino/sdk';
// import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import { Router } from 'express';
import * as reportsController from '../controllers/reports';

const reportsRouter = Router();

// const authClient = new tttsapi.auth.OAuth2({
//     domain: <string>process.env.API_AUTHORIZE_SERVER_DOMAIN,
//     clientId: <string>process.env.API_CLIENT_ID,
//     clientSecret: <string>process.env.API_CLIENT_SECRET
// });

// 売上レポート出力
reportsRouter.get('', (__, res) => {
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
        // const cognitoCredentials = (<Express.ICredentials>(<Express.Session>req.session).cognitoCredentials);
        // authClient.setCredentials({
        //     refresh_token: cognitoCredentials.refreshToken,
        //     // expiry_date: number;
        //     access_token: cognitoCredentials.accessToken,
        //     token_type: cognitoCredentials.tokenType
        // });
        const iamService = new cinerinoapi.service.IAM({
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const searchMembersResult = await iamService.searchMembers({
            member: { typeOf: { $eq: cinerinoapi.factory.personType.Person } }
        });

        // ticketClerkロールを持つ管理者のみ表示
        const cognitoUsers: {
            username?: string;
            familyName?: string;
            givenName: string;
        }[] = searchMembersResult.data
            .filter((m) => {
                return Array.isArray(m.member.hasRole) && m.member.hasRole.some((r) => r.roleName === 'ticketClerk');
            })
            .map((m) => {
                return {
                    username: m.member.username,
                    familyName: m.member.name,
                    givenName: ''
                };
            });

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
