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
exports.getAggregateSales = exports.ReportType = void 0;
/**
 * レポート出力コントローラー
 */
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const debug = createDebug('ttts-backend:controllers');
const RESERVATION_START_DATE = process.env.RESERVATION_START_DATE;
const EXCLUDE_STAFF_RESERVATION = process.env.EXCLUDE_STAFF_RESERVATION === '1';
var ReportType;
(function (ReportType) {
    ReportType["Sales"] = "Sales";
})(ReportType = exports.ReportType || (exports.ReportType = {}));
/**
 * 集計済みデータ取得API
 */
// tslint:disable-next-line:max-func-body-length
function getAggregateSales(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('query:', req.query);
        const dateFrom = getValue(req.query.dateFrom);
        const dateTo = getValue(req.query.dateTo);
        const eventStartFrom = getValue(req.query.eventStartFrom);
        const eventStartThrough = getValue(req.query.eventStartThrough);
        const conditions = [];
        let filename = 'DefaultReportName';
        try {
            switch (req.query.reportType) {
                case ReportType.Sales:
                    if (EXCLUDE_STAFF_RESERVATION) {
                        // 代理予約は除外
                        conditions.push({
                            'customer.group': {
                                $exists: true,
                                $eq: '01'
                            }
                        });
                    }
                    filename = '売上レポート';
                    break;
                default:
                    throw new Error(`${req.query.reportType}は非対応レポートタイプです`);
            }
            if (dateFrom !== null || dateTo !== null) {
                const minEndFrom = (RESERVATION_START_DATE !== undefined) ? moment(RESERVATION_START_DATE) : moment('2017-01-01T00:00:00Z');
                // 登録日From
                if (dateFrom !== null) {
                    // 売上げ
                    const endFrom = moment(`${getValue(req.query.dateFrom)}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ');
                    conditions.push({
                        date_bucket: { $gte: moment.max(endFrom, minEndFrom).toDate() }
                    });
                }
                // 登録日To
                if (dateTo !== null) {
                    // 売上げ
                    conditions.push({
                        date_bucket: { $lt: moment(`${dateTo}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').add(1, 'days').toDate() }
                    });
                }
            }
            if (eventStartFrom !== null) {
                conditions.push({
                    'performance.startDay': {
                        $gte: moment(`${eventStartFrom}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').tz('Asia/Tokyo').format('YYYYMMDD')
                    }
                });
            }
            if (eventStartThrough !== null) {
                conditions.push({
                    'performance.startDay': {
                        $lt: moment(`${eventStartThrough}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
                            .add(1, 'day').tz('Asia/Tokyo').format('YYYYMMDD')
                    }
                });
            }
            // const cognitoCredentials = (<Express.ICredentials>(<Express.Session>req.session).cognitoCredentials);
            // authClient.setCredentials({
            //     refresh_token: cognitoCredentials.refreshToken,
            //     // expiry_date: number;
            //     access_token: cognitoCredentials.accessToken,
            //     token_type: cognitoCredentials.tokenType
            // });
            const aggregateSalesService = new tttsapi.service.AggregateSales({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const stream = yield aggregateSalesService.stream({ $and: conditions });
            res.setHeader('Content-disposition', `attachment; filename*=UTF-8\'\'${encodeURIComponent(`${filename}.tsv`)}`);
            res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
            res.writeHead(http_status_1.OK, { 'Content-Type': 'text/csv; charset=Shift_JIS' });
            // Flush the headers before we start pushing the CSV content
            res.flushHeaders();
            stream.pipe(res);
        }
        catch (error) {
            res.send(error.message);
        }
    });
}
exports.getAggregateSales = getAggregateSales;
/**
 * 入力値取得(空文字はnullに変換)
 * @param {string|null} inputValue
 * @returns {string|null}
 */
function getValue(inputValue) {
    // tslint:disable-next-line:no-null-keyword
    return (typeof inputValue === 'string' && inputValue.length > 0) ? inputValue : null;
}
