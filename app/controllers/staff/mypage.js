"use strict";
/**
 * 内部関係者マイページコントローラー
 * @namespace controller/staff/mypage
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
const ttts = require("@motionpicture/ttts-domain");
const AWS = require("aws-sdk");
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
/**
 * マイページ(予約一覧)
 */
function index(__, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const owners = yield getCognitoUsers();
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
function getCognitoUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({
                apiVersion: 'latest',
                region: 'ap-northeast-1'
            });
            cognitoIdentityServiceProvider.listUsers({
                UserPoolId: process.env.COGNITO_USER_POOL_ID
                //    AttributesToGet?: SearchedAttributeNamesListType;
                //    Limit?: QueryLimitType;
                //    PaginationToken?: SearchPaginationTokenType;
                //    Filter?: UserFilterType;
            }, (err, data) => {
                if (err instanceof Error) {
                    reject(err);
                }
                else {
                    if (data.Users === undefined) {
                        reject(new Error('Unexpected.'));
                    }
                    else {
                        resolve(data.Users);
                    }
                }
            });
        });
    });
}
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
