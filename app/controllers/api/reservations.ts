/**
 * 予約APIコントローラー
 * @namespace controllers.api.reservations
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as conf from 'config';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR, NO_CONTENT, NOT_FOUND } from 'http-status';
import * as moment from 'moment';
import * as _ from 'underscore';

const debug = createDebug('ttts-staff:controllers:api:reservations');

const redisClient = ttts.redis.createClient({
    host: <string>process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(<string>process.env.REDIS_PORT, 10),
    password: <string>process.env.REDIS_KEY,
    tls: { servername: <string>process.env.REDIS_HOST }
});

const paymentMethodsForCustomer = conf.get('paymentMethodsForCustomer');
const paymentMethodsForStaff = conf.get('paymentMethodsForStaff');

/**
 * 予約検索
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
export async function search(req: Request, res: Response): Promise<void> {
    const POS_CLIENT_ID = <string>process.env.POS_CLIENT_ID;

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
    const startTimeFrom: any = (startHour1 !== null && startMinute1 !== null) ? startHour1 + startMinute1 : null;
    const startTimeTo: any = (startHour2 !== null && startMinute2 !== null) ? startHour2 + startMinute2 : null;

    const searchConditions = {
        limit: limit,
        page: page,
        sort: {
            performance_day: 1,
            performance_start_time: 1,
            payment_no: 1,
            ticket_type: 1
        },
        // 管理者の場合、内部関係者の予約全て&確保中
        status: ttts.factory.reservationStatusType.ReservationConfirmed,
        performance_day: (day !== null) ? day : undefined,
        performanceStartTimeFrom: (startTimeFrom !== null) ? startTimeFrom : undefined,
        performanceStartTimeTo: (startTimeTo !== null) ? startTimeTo : undefined,
        payment_no: (paymentNo !== null) ? ttts.CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, '')) : undefined,
        owner_username: (owner !== null) ? owner : undefined,
        purchaser_group: (purchaserGroup !== null)
            ? (purchaserGroup !== 'POS') ? purchaserGroup : undefined
            : undefined,
        transactionAgentId: (purchaserGroup !== null)
            ? (purchaserGroup === 'POS')
                ? POS_CLIENT_ID
                : (purchaserGroup === ttts.factory.person.Group.Customer) ? { $ne: POS_CLIENT_ID } : undefined
            : undefined,
        paymentMethod: (paymentMethod !== null) ? paymentMethod : undefined,
        purchaserLastName: (purchaserLastName !== null) ? purchaserLastName : undefined,
        purchaserFirstName: (purchaserFirstName !== null) ? purchaserFirstName : undefined,
        purchaserEmail: (purchaserEmail !== null) ? purchaserEmail : undefined,
        purchaserTel: (purchaserTel !== null) ? purchaserTel : undefined,
        watcherName: (watcherName !== null) ? watcherName : undefined
    };

    const conditions: any[] = [];

    // 予約方法
    // if (purchaserGroup !== null) {
    //     switch (purchaserGroup) {
    //         case 'POS':
    //             // 取引エージェントがPOS
    //             conditions.push({ 'transaction_agent.id': POS_CLIENT_ID });
    //             break;

    //         case ttts.factory.person.Group.Customer:
    //             // 購入者区分が一般、かつ、POS購入でない
    //             conditions.push({ purchaser_group: purchaserGroup });
    //             conditions.push({ 'transaction_agent.id': { $ne: POS_CLIENT_ID } });
    //             break;

    //         default:
    //             conditions.push({ purchaser_group: purchaserGroup });
    //     }
    // }

    debug('searching reservations...', conditions);
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
    try {
        // 総数検索
        const count = await reservationRepo.count(searchConditions);
        debug('reservation count:', count);

        // データ検索(検索→ソート→指定ページ分切取り)
        const reservations = await reservationRepo.search(searchConditions);

        // 0件メッセージセット
        const message: string = (reservations.length === 0) ?
            '検索結果がありません。予約データが存在しないか、検索条件を見直してください' : '';

        const getPaymentMethodName = (method: string) => {
            if (paymentMethodsForCustomer.hasOwnProperty(method)) {
                return (<any>paymentMethodsForCustomer)[method];
            }
            if (paymentMethodsForStaff.hasOwnProperty(method)) {
                return (<any>paymentMethodsForStaff)[method];
            }

            return method;
        };
        // 決済手段名称追加
        for (const reservation of reservations) {
            (<any>reservation).payment_method_name = getPaymentMethodName(reservation.payment_method);
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
 * 両方入力チェック(両方入力、または両方未入力の時true)
 *
 * @param {string} value1
 * @param {string} value2
 * @return {boolean}
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
 * 配布先を更新する
 */
export async function updateWatcherName(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('UnexpectedError')));

        return;
    }

    const reservationId = req.body.reservationId;
    const watcherName = req.body.watcherName;

    const condition = {
        _id: reservationId,
        status: ttts.factory.reservationStatusType.ReservationConfirmed
    };

    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
    try {
        const reservation = await reservationRepo.updateWatcher(
            condition,
            {
                watcher_name: watcherName,
                watcher_name_updated_at: new Date()
            }
        );

        if (reservation === null) {
            res.status(NOT_FOUND).json(null);
        } else {
            res.status(NO_CONTENT).end();
        }
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            errors: [{
                message: req.__('UnexpectedError')
            }]
        });
    }
}

/**
 * キャンセル実行api
 * @param {string} reservationId
 * @return {Promise<boolean>}
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

        const promises = reservationIds.map(async (id) => {
            // 予約データの解放
            const result: boolean = await cancelById(id);
            if (result) {
                successIds.push(id);
            } else {
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

/**
 * 予約キャンセル処理(
 */
async function cancelById(reservationId: string): Promise<boolean> {
    try {
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const stockRepo = new ttts.repository.Stock(redisClient);

        // idから予約データ取得
        const reservation = await reservationRepo.findById({ id: reservationId });
        if (reservation.reservationStatus !== ttts.factory.reservationStatusType.ReservationConfirmed) {
            throw new ttts.factory.errors.Argument('reservationId', 'status not confirmed');
        }

        debug('canceling a reservation...', reservation.id);
        // 予約をキャンセル
        await reservationRepo.cancel({ id: reservation.id });

        // 在庫を空きに(在庫IDに対して、元の状態に戻す)
        await Promise.all(reservation.stocks.map(async (stock) => {
            await stockRepo.unlock({
                eventId: reservation.performance,
                offer: {
                    seatSection: '',
                    seatNumber: stock.seat_code
                }
            });
        }));
        debug(reservation.stocks.length, 'stock(s) returned in stock.');

        // 券種による流入制限解放
        if (reservation.rate_limit_unit_in_seconds > 0) {
            const rateLimitRepo = new ttts.repository.rateLimit.TicketTypeCategory(redisClient);
            await rateLimitRepo.unlock({
                ticketTypeCategory: reservation.ticket_ttts_extension.category,
                performanceStartDate: moment(reservation.performance_start_date).toDate(),
                unitInSeconds: reservation.rate_limit_unit_in_seconds
            });
            debug('rate limit reset.');
        }
    } catch (error) {
        return false;
    }

    return true;
}
