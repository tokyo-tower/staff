"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 内部関係者マイページコントローラー
 */
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const createDebug = require("debug");
const querystring = require("querystring");
const debug = createDebug('ttts-staff:controllers:staff:mypage');
const layout = 'layouts/staff/layout';
const authClient = new tttsapi.auth.OAuth2({
    domain: process.env.API_AUTHORIZE_SERVER_DOMAIN,
    clientId: process.env.API_CLIENT_ID,
    clientSecret: process.env.API_CLIENT_SECRET
});
/**
 * マイページ(予約一覧)
 */
function index(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const cognitoCredentials = req.session.cognitoCredentials;
            authClient.setCredentials({
                refresh_token: cognitoCredentials.refreshToken,
                // expiry_date: number;
                access_token: cognitoCredentials.accessToken,
                token_type: cognitoCredentials.tokenType
            });
            const adminService = new tttsapi.service.Admin({
                endpoint: process.env.API_ENDPOINT,
                auth: authClient
            });
            const owners = yield adminService.search({ group: 'Staff' });
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
            debug('printing reservations...ids:', ids);
            // 印刷トークン発行
            const reservationService = new tttsapi.service.Reservation({
                endpoint: process.env.API_ENDPOINT,
                auth: authClient
            });
            const { token } = yield reservationService.publishPrintToken({ ids });
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
