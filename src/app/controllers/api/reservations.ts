/**
 * 予約APIコントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as conf from 'config';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR, NO_CONTENT } from 'http-status';
import * as moment from 'moment-timezone';
import * as _ from 'underscore';

const debug = createDebug('ttts-staff:controllers');

const paymentMethodsForCustomer = conf.get<any>('paymentMethodsForCustomer');
const paymentMethodsForStaff = conf.get<any>('paymentMethodsForStaff');

const POS_CLIENT_ID = <string>process.env.POS_CLIENT_ID;
const FRONTEND_CLIENT_ID = <string>process.env.FRONTEND_CLIENT_ID;
const STAFF_CLIENT_ID = <string>process.env.API_CLIENT_ID;

/**
 * 予約検索
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
export async function search(req: Request, res: Response): Promise<void> {

    // バリデーション
    const errors: any = {};

    // 片方入力エラーチェック
    if (!isInputEven(req.query.start_hour1, req.query.start_minute1)) {
        errors.start_hour1 = { msg: '時分Fromが片方しか指定されていません' };
    }
    if (!isInputEven(req.query.start_hour2, req.query.start_minute2)) {
        errors.start_hour2 = { msg: '時分Toが片方しか指定されていません' };
    }

    if (Object.keys(errors).length > 0) {
        res.json({
            success: false,
            results: null,
            count: 0,
            errors: errors
        });

        return;
    }

    // tslint:disable-next-line:no-magic-numbers
    const limit: number = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, 10) : 10;
    // tslint:disable-next-line:no-magic-numbers
    const page: number = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, 10) : 1;
    // ご来塔日時
    const day: string | null = (!_.isEmpty(req.query.day)) ? req.query.day : null;
    const startHour1: string | null = (!_.isEmpty(req.query.start_hour1)) ? req.query.start_hour1 : null;
    const startMinute1: string | null = (!_.isEmpty(req.query.start_minute1)) ? req.query.start_minute1 : null;
    const startHour2: string | null = (!_.isEmpty(req.query.start_hour2)) ? req.query.start_hour2 : null;
    const startMinute2: string | null = (!_.isEmpty(req.query.start_minute2)) ? req.query.start_minute2 : null;
    // 購入番号
    const paymentNo: string | null = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
    // アカウント
    const owner: string | null = (!_.isEmpty(req.query.owner)) ? req.query.owner : null;
    // 予約方法
    const purchaserGroup: string | null = (!_.isEmpty(req.query.purchaser_group)) ? req.query.purchaser_group : null;
    // 決済手段
    const paymentMethod: string | null = (!_.isEmpty(req.query.payment_method)) ? req.query.payment_method : null;
    // 名前
    const purchaserLastName: string | null = (!_.isEmpty(req.query.purchaser_last_name)) ? req.query.purchaser_last_name : null;
    const purchaserFirstName: string | null = (!_.isEmpty(req.query.purchaser_first_name)) ? req.query.purchaser_first_name : null;
    // メアド
    const purchaserEmail: string | null = (!_.isEmpty(req.query.purchaser_email)) ? req.query.purchaser_email : null;
    // 電話番号
    const purchaserTel: string | null = (!_.isEmpty(req.query.purchaser_tel)) ? req.query.purchaser_tel : null;
    // メモ
    const watcherName: string | null = (!_.isEmpty(req.query.watcher_name)) ? req.query.watcher_name : null;

    // 検索条件を作成
    const startTimeFrom: string | null = (startHour1 !== null && startMinute1 !== null) ? startHour1 + startMinute1 : null;
    const startTimeTo: string | null = (startHour2 !== null && startMinute2 !== null) ? startHour2 + startMinute2 : null;

    let eventStartFrom: Date | undefined;
    let eventStartThrough: Date | undefined;
    if (day !== null) {
        // tslint:disable-next-line:no-magic-numbers
        const date = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
        eventStartFrom = moment(`${date}T00:00:00+09:00`).toDate();
        eventStartThrough = moment(eventStartFrom).add(1, 'day').toDate();

        if (startTimeFrom !== null) {
            // tslint:disable-next-line:no-magic-numbers
            eventStartFrom = moment(`${date}T${startTimeFrom.slice(0, 2)}:${startTimeFrom.slice(2, 4)}:00+09:00`)
                .toDate();
        }

        if (startTimeTo !== null) {
            // tslint:disable-next-line:no-magic-numbers
            eventStartThrough = moment(`${date}T${startTimeTo.slice(0, 2)}:${startTimeTo.slice(2, 4)}:00+09:00`)
                .add(1, 'second')
                .toDate();
        }
    }

    const clientIds: string[] = [];
    switch (purchaserGroup) {
        case tttsapi.factory.person.Group.Customer:
            clientIds.push(FRONTEND_CLIENT_ID);
            break;
        case tttsapi.factory.person.Group.Staff:
            clientIds.push(STAFF_CLIENT_ID);
            break;
        case 'POS':
            clientIds.push(POS_CLIENT_ID);
            break;
        default:
    }

    const searchConditions: tttsapi.factory.reservation.event.ISearchConditions = {
        limit: limit,
        page: page,
        sort: {
            'reservationFor.startDate': 1,
            reservationNumber: 1,
            'reservedTicket.ticketType.id': 1,
            'reservedTicket.ticketedSeat.seatNumber': 1
        },
        typeOf: tttsapi.factory.reservationType.EventReservation,
        reservationStatuses: [tttsapi.factory.reservationStatusType.ReservationConfirmed],
        reservationFor: {
            startFrom: eventStartFrom,
            startThrough: eventStartThrough
        },
        reservationNumber: (paymentNo !== null) ? toHalfWidth(paymentNo.replace(/\s/g, '')) : undefined,
        // performance_day: (day !== null) ? day : undefined,
        // performanceStartTimeFrom: (startTimeFrom !== null) ? startTimeFrom : undefined,
        // performanceStartTimeTo: (startTimeTo !== null) ? startTimeTo : undefined,
        // payment_no: (paymentNo !== null) ? toHalfWidth(paymentNo.replace(/\s/g, '')) : undefined,
        // owner_username: (owner !== null) ? owner : undefined,
        // purchaser_group: (purchaserGroup !== null)
        //     ? (purchaserGroup !== 'POS') ? purchaserGroup : undefined
        //     : undefined,
        // transactionAgentId: (purchaserGroup !== null)
        //     ? (purchaserGroup === 'POS')
        //         ? POS_CLIENT_ID
        //         : (purchaserGroup === tttsapi.factory.person.Group.Customer) ? { $ne: POS_CLIENT_ID } : undefined
        //     : undefined,
        // paymentMethod: (paymentMethod !== null) ? paymentMethod : undefined,
        underName: {
            familyName: (purchaserLastName !== null) ? purchaserLastName : undefined,
            givenName: (purchaserFirstName !== null) ? purchaserFirstName : undefined,
            email: (purchaserEmail !== null) ? purchaserEmail : undefined,
            telephone: (purchaserTel !== null) ? `${purchaserTel}$` : undefined,
            identifier: {
                $all: [
                    ...(owner !== null) ? [{ name: 'username', value: owner }] : [],
                    ...(paymentMethod !== null) ? [{ name: 'paymentMethod', value: paymentMethod }] : []
                ],
                $in: [
                    ...clientIds.map((id) => {
                        return { name: 'clientId', value: id };
                    })
                ]
            }
        },
        additionalTicketText: (watcherName !== null) ? watcherName : undefined
        // purchaserLastName: (purchaserLastName !== null) ? purchaserLastName : undefined,
        // purchaserFirstName: (purchaserFirstName !== null) ? purchaserFirstName : undefined,
        // purchaserEmail: (purchaserEmail !== null) ? purchaserEmail : undefined,
        // purchaserTel: (purchaserTel !== null) ? purchaserTel : undefined,
        // watcherName: (watcherName !== null) ? watcherName : undefined
    };

    debug('searching reservations...', searchConditions);
    const reservationService = new tttsapi.service.Reservation({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    try {
        // 総数検索
        // データ検索(検索→ソート→指定ページ分切取り)
        const searchReservationsResult = await reservationService.search(searchConditions);
        const count = searchReservationsResult.totalCount;
        debug('reservation count:', count);
        const reservations = searchReservationsResult.data;

        // 0件メッセージセット
        const message: string = (reservations.length === 0) ?
            '検索結果がありません。予約データが存在しないか、検索条件を見直してください' : '';

        // 決済手段名称追加
        for (const reservation of reservations) {
            let paymentMethod4reservation = '';
            if (reservation.underName !== undefined && Array.isArray(reservation.underName.identifier)) {
                const paymentMethodProperty = reservation.underName.identifier.find((p) => p.name === 'paymentMethod');
                if (paymentMethodProperty !== undefined) {
                    paymentMethod4reservation = paymentMethodProperty.value;
                }
            }
            (<any>reservation).payment_method_name = paymentMethod2name(paymentMethod4reservation);
        }

        res.json({
            results: reservations,
            count: count,
            errors: null,
            message: message
        });
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            errors: [{
                message: error.message
            }]
        });
    }
}

/**
 * 全角→半角変換
 */
function toHalfWidth(str: string): string {
    return str.split('').map((value) => {
        // 全角であれば変換
        // tslint:disable-next-line:no-magic-numbers no-irregular-whitespace
        return value.replace(/[！-～]/g, String.fromCharCode(value.charCodeAt(0) - 0xFEE0)).replace('　', ' ');
    }).join('');
}

function paymentMethod2name(method: string) {
    if (paymentMethodsForCustomer.hasOwnProperty(method)) {
        return paymentMethodsForCustomer[method];
    }
    if (paymentMethodsForStaff.hasOwnProperty(method)) {
        return paymentMethodsForStaff[method];
    }

    return method;
}

/**
 * 両方入力チェック(両方入力、または両方未入力の時true)
 */
function isInputEven(value1: string, value2: string): boolean {
    if (_.isEmpty(value1) && _.isEmpty(value2)) {
        return true;
    }
    if (!_.isEmpty(value1) && !_.isEmpty(value2)) {
        return true;
    }

    return false;
}

/**
 * キャンセル実行api
 */
export async function cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('UnexpectedError')));

        return;
    }
    const successIds: string[] = [];
    const errorIds: string[] = [];
    try {
        const reservationIds = req.body.reservationIds;
        if (!Array.isArray(reservationIds)) {
            throw new Error(req.__('UnexpectedError'));
        }

        const reservationService = new tttsapi.service.Reservation({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });

        const promises = reservationIds.map(async (id) => {
            // 予約データの解放
            try {
                await reservationService.cancel({ id: id });

                successIds.push(id);
            } catch (error) {
                errorIds.push(id);
            }
        });
        await Promise.all(promises);
        res.status(NO_CONTENT).end();
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            message: error.message,
            successIds: successIds,
            errorIds: errorIds
        });
    }
}
