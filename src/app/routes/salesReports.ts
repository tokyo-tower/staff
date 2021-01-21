/**
 * 売上レポートルーター
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import * as createDebug from 'debug';
import { Router } from 'express';
import * as moment from 'moment-timezone';

const debug = createDebug('ttts-staff:router');

const salesReportsRouter = Router();

function getValue(inputValue: string | null): string | null {
    // tslint:disable-next-line:no-null-keyword
    return (typeof inputValue === 'string' && inputValue.length > 0) ? inputValue : null;
}

salesReportsRouter.get(
    '',
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    async (req, res, next) => {
        try {
            debug('query:', req.query);
            const conditions: any[] = [];

            // 登録日From
            if (typeof req.query.dateFrom === 'string' && req.query.dateFrom.length > 0) {
                // 売上げ
                const endFrom = moment(`${getValue(req.query.dateFrom)}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ');
                conditions.push({
                    dateRecorded: {
                        $gte: endFrom
                            .toDate()
                    }
                });
            }
            // 登録日To
            if (typeof req.query.dateTo === 'string' && req.query.dateTo.length > 0) {
                // 売上げ
                conditions.push({
                    dateRecorded: {
                        $lt: moment(`${req.query.dateTo}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
                            .add(1, 'days')
                            .toDate()
                    }
                });
            }

            if (typeof req.query.eventStartFrom === 'string' && req.query.eventStartFrom.length > 0) {
                conditions.push({
                    'reservation.reservationFor.startDate': {
                        $exists: true,
                        $gte: moment(`${req.query.eventStartFrom}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
                            .toDate()
                    }
                });
            }
            if (typeof req.query.eventStartThrough === 'string' && req.query.eventStartThrough.length > 0) {
                conditions.push({
                    'reservation.reservationFor.startDate': {
                        $exists: true,
                        $lt: moment(`${req.query.eventStartThrough}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ')
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

            const searchConditions: any = {
                limit: req.query.limit,
                page: req.query.page
            };

            if (req.query.format === 'datatable') {
                const searchResult = await aggregateSalesService.search({
                    $and: conditions,
                    ...{
                        limit: Number(searchConditions.limit),
                        page: Number(searchConditions.page)
                    }
                });

                res.json({
                    draw: req.query.draw,
                    // recordsTotal: searchOrdersResult.totalCount,
                    recordsFiltered: (searchResult.data.length === Number(searchConditions.limit))
                        ? (Number(searchConditions.page) * Number(searchConditions.limit)) + 1
                        : ((Number(searchConditions.page) - 1) * Number(searchConditions.limit)) + Number(searchResult.data.length),
                    data: searchResult.data
                });
                // } else if (req.query.format === cinerinoapi.factory.chevre.encodingFormat.Text.csv) {
                //     const stream = <NodeJS.ReadableStream>await streamingOrderService.download({
                //         ...searchConditions,
                //         format: cinerinoapi.factory.chevre.encodingFormat.Text.csv,
                //         limit: undefined,
                //         page: undefined
                //     });
                //     const filename = 'OrderReport';
                //     res.setHeader('Content-disposition', `attachment; filename*=UTF-8\'\'${encodeURIComponent(`${filename}.csv`)}`);
                //     res.setHeader('Content-Type', `${cinerinoapi.factory.chevre.encodingFormat.Text.csv}; charset=UTF-8`);
                //     stream.pipe(res);
                // } else if (req.query.format === cinerinoapi.factory.chevre.encodingFormat.Application.json) {
                //     const stream = <NodeJS.ReadableStream>await streamingOrderService.download({
                //         ...searchConditions,
                //         format: cinerinoapi.factory.chevre.encodingFormat.Application.json,
                //         limit: undefined,
                //         page: undefined
                //     });
                //     const filename = 'OrderReport';
                //     res.setHeader('Content-disposition', `attachment; filename*=UTF-8\'\'${encodeURIComponent(`${filename}.json`)}`);
                //     res.setHeader('Content-Type', `${cinerinoapi.factory.chevre.encodingFormat.Application.json}; charset=UTF-8`);
                //     stream.pipe(res);
            } else {
                res.render('salesReports/index', {
                    moment: moment,
                    query: req.query,
                    searchConditions: searchConditions,
                    extractScripts: true
                });
            }
        } catch (error) {
            next(error);
        }
    }
);

export default salesReportsRouter;
