/**
 * 予約APIコントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as conf from 'config';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR, NO_CONTENT } from 'http-status';
import * as moment from 'moment-timezone';

const debug = createDebug('ttts-staff:controllers');

const paymentMethodsForCustomer = conf.get<any>('paymentMethodsForCustomer');
const paymentMethodsForStaff = conf.get<any>('paymentMethodsForStaff');

const FRONTEND_CLIENT_IDS = (typeof process.env.FRONTEND_CLIENT_ID === 'string')
    ? process.env.FRONTEND_CLIENT_ID.split(',')
    : [];
const POS_CLIENT_IDS = (typeof process.env.POS_CLIENT_ID === 'string')
    ? process.env.POS_CLIENT_ID.split(',')
    : [];
const STAFF_CLIENT_IDS = [
    ...(typeof process.env.STAFF_CLIENT_IDS === 'string') ? process.env.STAFF_CLIENT_IDS.split(',') : [],
    ...(typeof process.env.API_CLIENT_ID === 'string') ? [process.env.API_CLIENT_ID] : [],
    ...(typeof process.env.API_CLIENT_ID_OLD === 'string') ? [process.env.API_CLIENT_ID_OLD] : []
];

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
    const limit: number = (typeof req.query.limit === 'string' && req.query.limit.length > 0) ? parseInt(req.query.limit, 10) : 10;
    // tslint:disable-next-line:no-magic-numbers
    const page: number = (typeof req.query.page === 'string' && req.query.page.length > 0) ? parseInt(req.query.page, 10) : 1;
    // ご来塔日時
    const day: string | null = (typeof req.query.day === 'string' && req.query.day.length > 0) ? req.query.day : null;
    const startHour1: string | null = (typeof req.query.start_hour1 === 'string' && req.query.start_hour1.length > 0)
        ? req.query.start_hour1 : null;
    const startMinute1: string | null = (typeof req.query.start_minute1 === 'string' && req.query.start_minute1.length > 0)
        ? req.query.start_minute1 : null;
    const startHour2: string | null = (typeof req.query.start_hour2 === 'string' && req.query.start_hour2.length > 0)
        ? req.query.start_hour2 : null;
    const startMinute2: string | null = (typeof req.query.start_minute2 === 'string' && req.query.start_minute2.length > 0)
        ? req.query.start_minute2 : null;
    // 購入番号
    const paymentNo: string | null = (typeof req.query.payment_no === 'string' && req.query.payment_no.length > 0)
        ? req.query.payment_no : null;
    // アカウント
    const owner: string | null = (typeof req.query.owner === 'string' && req.query.owner.length > 0) ? req.query.owner : null;
    // 予約方法
    const purchaserGroup: string | null = (typeof req.query.purchaser_group === 'string' && req.query.purchaser_group.length > 0)
        ? req.query.purchaser_group : null;
    // 決済手段
    const paymentMethod: string | null = (typeof req.query.payment_method === 'string' && req.query.payment_method.length > 0)
        ? req.query.payment_method : null;
    // 名前
    const purchaserLastName: string | null = (typeof req.query.purchaser_last_name === 'string' && req.query.purchaser_last_name.length > 0)
        ? req.query.purchaser_last_name : null;
    const purchaserFirstName: string | null =
        (typeof req.query.purchaser_first_name === 'string' && req.query.purchaser_first_name.length > 0)
            ? req.query.purchaser_first_name : null;
    // メアド
    const purchaserEmail: string | null = (typeof req.query.purchaser_email === 'string' && req.query.purchaser_email.length > 0)
        ? req.query.purchaser_email : null;
    // 電話番号
    const purchaserTel: string | null = (typeof req.query.purchaser_tel === 'string' && req.query.purchaser_tel.length > 0)
        ? req.query.purchaser_tel : null;
    // メモ
    const watcherName: string | null = (typeof req.query.watcher_name === 'string' && req.query.watcher_name.length > 0)
        ? req.query.watcher_name : null;

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
        case 'Customer':
            clientIds.push(...FRONTEND_CLIENT_IDS);
            break;
        case 'Staff':
            clientIds.push(...STAFF_CLIENT_IDS);
            break;
        case 'POS':
            clientIds.push(...POS_CLIENT_IDS);
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
        typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
        reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed],
        reservationFor: {
            startFrom: eventStartFrom,
            startThrough: eventStartThrough
        },
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
                ],
                ...{
                    $elemMatch: (paymentNo !== null)
                        ? { name: 'paymentNo', value: { $regex: toHalfWidth(paymentNo.replace(/\s/g, '')) } }
                        : undefined
                }
            }
        },
        additionalTicketText: (watcherName !== null) ? watcherName : undefined
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

        res.json({
            results: addCustomAttributes(reservations),
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

function addCustomAttributes(
    reservations: tttsapi.factory.reservation.event.IReservation[]
): tttsapi.factory.reservation.event.IReservation[] {
    // tslint:disable-next-line:cyclomatic-complexity
    return reservations.map((reservation) => {
        // 決済手段名称追加
        let paymentMethod4reservation = '';
        if (reservation.underName !== undefined && Array.isArray(reservation.underName.identifier)) {
            const paymentMethodProperty = reservation.underName.identifier.find((p) => p.name === 'paymentMethod');
            if (paymentMethodProperty !== undefined) {
                paymentMethod4reservation = paymentMethodProperty.value;
            }
        }

        const underName = reservation.underName;

        let age = '';
        if (reservation.underName !== undefined && Array.isArray(reservation.underName.identifier)) {
            const ageProperty = reservation.underName.identifier.find((p) => p.name === 'age');
            if (ageProperty !== undefined) {
                age = ageProperty.value;
            }
        }

        let clientId = '';
        if (reservation.underName !== undefined && Array.isArray(reservation.underName.identifier)) {
            const clientIdProperty = reservation.underName.identifier.find((p) => p.name === 'clientId');
            if (clientIdProperty !== undefined) {
                clientId = clientIdProperty.value;
            }
        }

        // 購入番号
        let paymentNo = reservation.reservationNumber;
        if (reservation.underName !== undefined && Array.isArray(reservation.underName.identifier)) {
            const paymentNoProperty = reservation.underName.identifier.find((p) => p.name === 'paymentNo');
            if (paymentNoProperty !== undefined) {
                paymentNo = paymentNoProperty.value;
            }
        }

        // 注文番号
        let orderNumber = '';
        const orderNumberProperty = reservation.underName?.identifier?.find((p) => p.name === 'orderNumber');
        if (orderNumberProperty !== undefined) {
            orderNumber = orderNumberProperty.value;
        }

        return {
            ...reservation,
            orderNumber: orderNumber,
            paymentNo: paymentNo,
            payment_method_name: paymentMethod2name(paymentMethod4reservation),
            performance: reservation.reservationFor.id,
            performance_day: moment(reservation.reservationFor.startDate).tz('Asia/Tokyo').format('YYYYMMDD'),
            performance_start_time: moment(reservation.reservationFor.startDate).tz('Asia/Tokyo').format('HHmm'),
            performance_end_time: moment(reservation.reservationFor.endDate).tz('Asia/Tokyo').format('HHmm'),
            performance_canceled: false,
            ticket_type: reservation.reservedTicket.ticketType.identifier,
            ticket_type_name: <any>reservation.reservedTicket.ticketType.name,
            purchaser_group: (STAFF_CLIENT_IDS.indexOf(clientId) >= 0) ? 'Staff' : 'Customer',
            purchased_at: (reservation.bookingTime !== undefined) ? reservation.bookingTime : (<any>reservation).purchased_at,
            purchaser_name: (underName !== undefined) ? underName.name : '',
            purchaser_last_name: (underName !== undefined) ? underName.familyName : '',
            purchaser_first_name: (underName !== undefined) ? underName.givenName : '',
            purchaser_email: (underName !== undefined) ? underName.email : '',
            purchaser_tel: (underName !== undefined) ? underName.telephone : '',
            purchaser_international_tel: '',
            purchaser_age: age,
            purchaser_address: (underName !== undefined) ? (<any>underName).address : '',
            purchaser_gender: (underName !== undefined) ? underName.gender : '',
            watcher_name: reservation.additionalTicketText
        };
    });
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
    if ((typeof value1 !== 'string' || value1.length === 0)
        && (typeof value2 !== 'string' || value2.length === 0)) {
        return true;
    }
    if ((typeof value1 === 'string' && value1.length > 0)
        && (typeof value2 === 'string' && value2.length > 0)) {
        return true;
    }

    return false;
}

/**
 * キャンセル実行api
 */
export async function cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error('システムエラーが発生しました。ご不便をおかけして申し訳ありませんがしばらく経ってから再度お試しください。'));

        return;
    }
    const successIds: string[] = [];
    const errorIds: string[] = [];
    try {
        const reservationIds = req.body.reservationIds;
        if (!Array.isArray(reservationIds)) {
            throw new Error('システムエラーが発生しました。ご不便をおかけして申し訳ありませんがしばらく経ってから再度お試しください。');
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
