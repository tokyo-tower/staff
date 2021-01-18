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
exports.getAggregateSales = exports.ReportType = exports.search = void 0;
/**
 * レポート出力コントローラー
 */
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const debug = createDebug('ttts-staff:controllers');
const RESERVATION_START_DATE = process.env.RESERVATION_START_DATE;
// tslint:disable-next-line:max-func-body-length
function search(req, res) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
        debug('query:', req.query);
        const dateFrom = getValue(req.query.dateFrom);
        const dateTo = getValue(req.query.dateTo);
        const eventStartFrom = getValue(req.query.eventStartFrom);
        const eventStartThrough = getValue(req.query.eventStartThrough);
        const conditions = [];
        try {
            if (dateFrom !== null || dateTo !== null) {
                const minEndFrom = (RESERVATION_START_DATE !== undefined) ? moment(RESERVATION_START_DATE) : moment('2017-01-01T00:00:00Z');
                // 登録日From
                if (dateFrom !== null) {
                    // 売上げ
                    const endFrom = moment(`${getValue(req.query.dateFrom)}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ');
                    conditions.push({
                        dateRecorded: {
                            $gte: moment.max(endFrom, minEndFrom)
                                .toDate()
                        }
                    });
                }
                // 登録日To
                if (dateTo !== null) {
                    // 売上げ
                    conditions.push({
                        dateRecorded: {
                            $lt: moment(`${dateTo}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
                                .add(1, 'days')
                                .toDate()
                        }
                    });
                }
            }
            if (eventStartFrom !== null) {
                conditions.push({
                    'reservation.reservationFor.startDate': {
                        $exists: true,
                        $gte: moment(`${eventStartFrom}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
                            .toDate()
                    }
                });
            }
            if (eventStartThrough !== null) {
                conditions.push({
                    'reservation.reservationFor.startDate': {
                        $exists: true,
                        $lt: moment(`${eventStartThrough}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
                            .add(1, 'day')
                            .toDate()
                    }
                });
            }
            const categoryEq = req.query.category;
            if (typeof categoryEq === 'string' && categoryEq.length > 0) {
                conditions.push({
                    category: { $eq: categoryEq }
                });
            }
            const confirmationNumberEq = req.query.confirmationNumber;
            if (typeof confirmationNumberEq === 'string' && confirmationNumberEq.length > 0) {
                conditions.push({
                    'mainEntity.confirmationNumber': { $exists: true, $eq: confirmationNumberEq }
                });
            }
            const customerGroupEq = (_a = req.query.customer) === null || _a === void 0 ? void 0 : _a.group;
            if (typeof customerGroupEq === 'string' && customerGroupEq.length > 0) {
                conditions.push({
                    'mainEntity.customer.group': { $exists: true, $eq: customerGroupEq }
                });
            }
            const reservationForIdEq = (_c = (_b = req.query.reservation) === null || _b === void 0 ? void 0 : _b.reservationFor) === null || _c === void 0 ? void 0 : _c.id;
            if (typeof reservationForIdEq === 'string' && reservationForIdEq.length > 0) {
                conditions.push({
                    'reservation.reservationFor.id': { $exists: true, $eq: reservationForIdEq }
                });
            }
            const reservationIdEq = (_d = req.query.reservation) === null || _d === void 0 ? void 0 : _d.id;
            if (typeof reservationIdEq === 'string' && reservationIdEq.length > 0) {
                conditions.push({
                    'reservation.id': { $exists: true, $eq: reservationIdEq }
                });
            }
            const aggregateSalesService = new tttsapi.service.SalesReport({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient,
                project: req.project
            });
            const searchResult = yield aggregateSalesService.search(Object.assign({ $and: conditions }, {
                limit: Number(req.query.limit),
                page: Number(req.query.page)
            }));
            res.header('X-Total-Count', '0');
            res.json(searchResult.data);
        }
        catch (error) {
            res.send(error.message);
        }
    });
}
exports.search = search;
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
        const filename = '売上レポート';
        try {
            switch (req.query.reportType) {
                case ReportType.Sales:
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
                        dateRecorded: {
                            $gte: moment.max(endFrom, minEndFrom)
                                .toDate()
                        }
                    });
                }
                // 登録日To
                if (dateTo !== null) {
                    // 売上げ
                    conditions.push({
                        dateRecorded: {
                            $lt: moment(`${dateTo}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
                                .add(1, 'days')
                                .toDate()
                        }
                    });
                }
            }
            if (eventStartFrom !== null) {
                conditions.push({
                    'reservation.reservationFor.startDate': {
                        $exists: true,
                        $gte: moment(`${eventStartFrom}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
                            .toDate()
                    }
                });
            }
            if (eventStartThrough !== null) {
                conditions.push({
                    'reservation.reservationFor.startDate': {
                        $exists: true,
                        $lt: moment(`${eventStartThrough}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
                            .add(1, 'day')
                            .toDate()
                    }
                });
            }
            const aggregateSalesService = new tttsapi.service.SalesReport({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient,
                project: req.project
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
