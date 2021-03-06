/**
 * レポート出力コントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import { OK } from 'http-status';
import * as moment from 'moment-timezone';

const debug = createDebug('ttts-staff:controllers');

const RESERVATION_START_DATE = process.env.RESERVATION_START_DATE;

// tslint:disable-next-line:max-func-body-length
export async function search(req: Request, res: Response): Promise<void> {
    debug('query:', req.query);
    const dateFrom = getValue(req.query.dateFrom);
    const dateTo = getValue(req.query.dateTo);
    const eventStartFrom = getValue(req.query.eventStartFrom);
    const eventStartThrough = getValue(req.query.eventStartThrough);
    const conditions: any[] = [];

    try {
        if (dateFrom !== null || dateTo !== null) {
            const minEndFrom =
                (RESERVATION_START_DATE !== undefined) ? moment(RESERVATION_START_DATE) : moment('2017-01-01T00:00:00Z');
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

        const customerGroupEq = req.query.customer?.group;
        if (typeof customerGroupEq === 'string' && customerGroupEq.length > 0) {
            conditions.push({
                'mainEntity.customer.group': { $exists: true, $eq: customerGroupEq }
            });
        }

        const reservationForIdEq = req.query.reservation?.reservationFor?.id;
        if (typeof reservationForIdEq === 'string' && reservationForIdEq.length > 0) {
            conditions.push({
                'reservation.reservationFor.id': { $exists: true, $eq: reservationForIdEq }
            });
        }

        const reservationIdEq = req.query.reservation?.id;
        if (typeof reservationIdEq === 'string' && reservationIdEq.length > 0) {
            conditions.push({
                'reservation.id': { $exists: true, $eq: reservationIdEq }
            });
        }

        const aggregateSalesService = new tttsapi.service.SalesReport({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient,
            project: req.project
        });

        const searchResult = await aggregateSalesService.search({
            $and: conditions,
            ...{
                limit: Number(req.query.limit),
                page: Number(req.query.page)
            }
        });

        res.header('X-Total-Count', '0');
        res.json(searchResult.data);
    } catch (error) {
        res.send(error.message);
    }
}

export enum ReportType {
    Sales = 'Sales'
}

/**
 * 集計済みデータ取得API
 */
// tslint:disable-next-line:max-func-body-length
export async function getAggregateSales(req: Request, res: Response): Promise<void> {
    debug('query:', req.query);
    const dateFrom = getValue(req.query.dateFrom);
    const dateTo = getValue(req.query.dateTo);
    const eventStartFrom = getValue(req.query.eventStartFrom);
    const eventStartThrough = getValue(req.query.eventStartThrough);
    const conditions: any[] = [];

    const filename = '売上レポート';

    try {
        switch (req.query.reportType) {
            case ReportType.Sales:
                break;

            default:
                throw new Error(`${req.query.reportType}は非対応レポートタイプです`);
        }

        if (dateFrom !== null || dateTo !== null) {
            const minEndFrom =
                (RESERVATION_START_DATE !== undefined) ? moment(RESERVATION_START_DATE) : moment('2017-01-01T00:00:00Z');
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
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient,
            project: req.project
        });

        const stream = <NodeJS.ReadableStream>await aggregateSalesService.stream({ $and: conditions });

        res.setHeader('Content-disposition', `attachment; filename*=UTF-8\'\'${encodeURIComponent(`${filename}.tsv`)}`);
        res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
        res.writeHead(OK, { 'Content-Type': 'text/csv; charset=Shift_JIS' });

        // Flush the headers before we start pushing the CSV content
        res.flushHeaders();

        stream.pipe(res);
    } catch (error) {
        res.send(error.message);
    }
}

/**
 * 入力値取得(空文字はnullに変換)
 * @param {string|null} inputValue
 * @returns {string|null}
 */
function getValue(inputValue: string | null): string | null {
    // tslint:disable-next-line:no-null-keyword
    return (typeof inputValue === 'string' && inputValue.length > 0) ? inputValue : null;
}
