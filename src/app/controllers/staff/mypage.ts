/**
 * マイページコントローラー
 */
import * as cinerinoapi from '@cinerino/sdk';

import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import * as querystring from 'querystring';

const debug = createDebug('ttts-staff:controllers:staff:mypage');
const layout: string = 'layouts/staff/layout';

/**
 * 印刷トークンインターフェース
 */
export type IPrintToken = string;
/**
 * 印刷トークン対象(予約IDリスト)インターフェース
 */
export type IPrintObject = string[];

/**
 * 予約印刷トークンを発行する
 */
export async function createPrintToken(
    object: IPrintObject,
    orders: cinerinoapi.factory.order.IOrder[]
): Promise<IPrintToken> {
    return new Promise<IPrintToken>((resolve, reject) => {
        const payload = {
            object: object,
            orders: orders.map((o) => {
                return {
                    orderNumber: o.orderNumber,
                    confirmationNumber: o.confirmationNumber
                };
            })
        };
        debug('signing jwt...', payload);

        jwt.sign(payload, <string>process.env.TTTS_TOKEN_SECRET, (jwtErr, token) => {
            if (jwtErr instanceof Error) {
                reject(jwtErr);
            } else {
                resolve(token);
            }
        });
    });
}

/**
 * マイページ(予約一覧)
 */
export async function index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const iamService = new cinerinoapi.service.IAM({
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const searchMembersResult = await iamService.searchMembers({
            member: { typeOf: { $eq: cinerinoapi.factory.personType.Person } }
        });

        // ticketClerkロールを持つ管理者のみ表示
        const owners: {
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

        res.render('staff/mypage/index', {
            owners: owners,
            layout: layout
        });
    } catch (error) {
        next(error);
    }
}

/**
 * A4印刷
 */
export async function print(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const ids = <string[]>req.query.ids;
        let orderNumbers = <string[]>req.query.orderNumbers;
        orderNumbers = [...new Set(orderNumbers)];
        debug('printing reservations...ids:', ids, 'orderNumber:', orderNumbers);

        // 印刷対象注文検索
        const orderService = new cinerinoapi.service.Order({
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const searchOrdersResult = await orderService.search({
            limit: 100,
            orderNumbers: orderNumbers
        });
        const orders = searchOrdersResult.data;
        debug('printing...', orders.length, 'orders');

        // 印刷トークン発行
        const token = await createPrintToken(ids, orders);
        debug('printToken created.', token);

        const query = querystring.stringify({
            locale: 'ja',
            output: req.query.output,
            token: token
        });
        const printUrl = `${process.env.RESERVATIONS_PRINT_URL}?${query}`;
        debug('printUrl:', printUrl);

        res.redirect(printUrl);
    } catch (error) {
        next(error);
    }
}
