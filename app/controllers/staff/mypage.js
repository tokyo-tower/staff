"use strict";
/**
 * 内部関係者マイページコントローラー
 * @namespace controllers.staff.mypage
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const ttts = require("@motionpicture/ttts-domain");
const createDebug = require("debug");
const querystring = require("querystring");
const debug = createDebug('ttts-staff:controllers:staff:mypage');
const layout = 'layouts/staff/layout';
const redisClient = ttts.redis.createClient({
    host: process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_KEY,
    tls: { servername: process.env.REDIS_HOST }
});
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
            const token = authClient.credentials;
            res.render('staff/mypage/index', {
                token: token,
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
            const tokenRepo = new ttts.repository.Token(redisClient);
            const printToken = yield tokenRepo.createPrintToken(ids);
            debug('printToken created.', printToken);
            const query = querystring.stringify({
                locale: 'ja',
                output: req.query.output,
                token: printToken
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
