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
exports.print = exports.index = exports.createPrintToken = void 0;
/**
 * マイページコントローラー
 */
const cinerinoapi = require("@cinerino/sdk");
const createDebug = require("debug");
const jwt = require("jsonwebtoken");
const querystring = require("querystring");
const debug = createDebug('ttts-staff:controllers:staff:mypage');
const layout = 'layouts/staff/layout';
/**
 * 予約印刷トークンを発行する
 */
function createPrintToken(object, orders) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
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
            jwt.sign(payload, process.env.TTTS_TOKEN_SECRET, (jwtErr, token) => {
                if (jwtErr instanceof Error) {
                    reject(jwtErr);
                }
                else {
                    resolve(token);
                }
            });
        });
    });
}
exports.createPrintToken = createPrintToken;
/**
 * マイページ(予約一覧)
 */
function index(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const iamService = new cinerinoapi.service.IAM({
                endpoint: process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const searchMembersResult = yield iamService.searchMembers({
                member: { typeOf: { $eq: cinerinoapi.factory.personType.Person } }
            });
            // ticketClerkロールを持つ管理者のみ表示
            const owners = searchMembersResult.data
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
        }
        catch (error) {
            next(error);
        }
    });
}
exports.index = index;
/**
 * A4印刷
 */
function print(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const ids = req.query.ids;
            let orderNumbers = req.query.orderNumbers;
            orderNumbers = [...new Set(orderNumbers)];
            debug('printing reservations...ids:', ids, 'orderNumber:', orderNumbers);
            let orders = [];
            if (Array.isArray(orderNumbers) && orderNumbers.length > 0) {
                // 印刷対象注文検索
                const orderService = new cinerinoapi.service.Order({
                    endpoint: process.env.CINERINO_API_ENDPOINT,
                    auth: req.tttsAuthClient
                });
                const searchOrdersResult = yield orderService.search({
                    limit: 100,
                    orderNumbers: orderNumbers
                });
                orders = searchOrdersResult.data;
            }
            debug('printing...', orders.length, 'orders');
            // 印刷トークン発行
            const token = yield createPrintToken(ids, orders);
            debug('printToken created.', token);
            const query = querystring.stringify({
                locale: 'ja',
                output: req.query.output,
                token: token
            });
            const printUrl = `${process.env.RESERVATIONS_PRINT_URL}?${query}`;
            debug('printUrl:', printUrl);
            res.redirect(printUrl);
        }
        catch (error) {
            next(error);
        }
    });
}
exports.print = print;
