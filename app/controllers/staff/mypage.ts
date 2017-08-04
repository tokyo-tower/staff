/**
 * 内部関係者マイページコントローラー
 *
 * @namespace controller/staff/mypage
 */

import { CommonUtil, Models, ReservationUtil, ScreenUtil } from '@motionpicture/ttts-domain';
import { NextFunction, Request, Response } from 'express';
import * as mongoose from 'mongoose';
import * as _ from 'underscore';

const DEFAULT_RADIX = 10;
const layout: string = 'layouts/staff/layout';

/**
 * マイページ(予約一覧)
 *
 */
export async function index(__: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const owners = await Models.Owner.find({}, '_id name', { sort: { _id: 1 } }).exec();
        res.render('staff/mypage/index', {
            owners: owners,
            layout: layout
        });
    } catch (error) {
        next(error);
    }
}

/**
 * マイページ予約検索
 *
 */
// tslint:disable-next-line:max-func-body-length
// tslint:disable-next-line:cyclomatic-complexity
export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    // バリデーション
    const errors = await validate(req);
    if (Object.keys(errors).length > 0) {
        res.json({
            success: false,
            results: null,
            count: 0,
            errors: errors
        });
        return;
    }
    //mypageForm(req);
    // const validatorResult = await req.getValidationResult();
    // if (!validatorResult.isEmpty()) {
    //     const errors = req.validationErrors(true);
    //     res.json({
    //         success: false,
    //         results: null,
    //         count: 0,
    //         errors: errors
    //     });
    //     return;
    // }

    // tslint:disable-next-line:no-magic-numbers
    const limit: number = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, DEFAULT_RADIX) : 10;
    const page: number = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, DEFAULT_RADIX) : 1;
    // ご来塔日時
    const day: string | null = (!_.isEmpty(req.query.day)) ? req.query.day : null;
    const startHour1: string | null = (!_.isEmpty(req.query.start_hour1)) ? req.query.start_hour1 : null;
    const startMinute1: string | null = (!_.isEmpty(req.query.start_minute1)) ? req.query.start_minute1 : null;
    const startHour2: string | null = (!_.isEmpty(req.query.start_hour2)) ? req.query.start_hour2 : null;
    const startMinute2: string | null = (!_.isEmpty(req.query.start_minute2)) ? req.query.start_minute2 : null;
    // 購入番号
    let paymentNo: string | null = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
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
    const conditions: any[] = [];

    // 管理者の場合、内部関係者の予約全て&確保中
    if (req.staffUser.get('is_admin') === true) {
        conditions.push(
            {
                $or: [
                    {
                        //purchaser_group: ReservationUtil.PURCHASER_GROUP_STAFF,
                        status: ReservationUtil.STATUS_RESERVED
                    },
                    {
                        status: ReservationUtil.STATUS_KEPT_BY_TTTS
                    }
                ]
            }
        );
    } else {
        conditions.push(
            {
                //purchaser_group: ReservationUtil.PURCHASER_GROUP_STAFF,
                //owner: req.staffUser.get('_id'),
                status: ReservationUtil.STATUS_RESERVED
            }
        );
    }
    // 来塔日
    if (day !== null) {
        conditions.push({ performance_day: day });
    }
    // 開始時間
    const startTimeFrom: any = (startHour1 !== null && startMinute1 !== null) ? startHour1 + startMinute1 : null;
    const startTimeTo: any = (startHour2 !== null && startMinute2 !== null) ? startHour2 + startMinute2 : null;
    if (startTimeFrom !== null || startTimeTo !== null) {
        const conditionsTime: any = {};
        // 開始時間From
        if (startTimeFrom !== null) {
            conditionsTime.$gte = startTimeFrom;
        }
        // 開始時間To
        if (startTimeTo !== null) {
            conditionsTime.$lte = startTimeTo;
        }
        conditions.push({ performance_start_time : conditionsTime });
    }
    // 購入番号
    if (paymentNo !== null) {
        // remove space characters
        paymentNo = CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, ''));
        conditions.push({ payment_no: { $regex: `${paymentNo}` } });
    }
    // アカウント
    if (owner !== null) {
        conditions.push({ owner: owner });
    }
    // 予約方法
    if (purchaserGroup !== null) {
        conditions.push({ purchaser_group: purchaserGroup })
    }
    // 決済手段
    if (paymentMethod !== null) {
        conditions.push({ payment_method: paymentMethod });
    }
    // 名前
    if (purchaserLastName !== null) {
        conditions.push({ purchaser_last_name: { $regex: purchaserLastName } });
        //conditions['name.ja'] = { $regex: managementTypeName };
    }
    if (purchaserFirstName !== null) {
        conditions.push({ purchaser_first_name: { $regex: purchaserFirstName } });
        //conditions.push({ purchaser_first_name: purchaserFirstName });
    }
    // メアド
    if (purchaserEmail !== null) {
        conditions.push({ purchaser_email: purchaserEmail });
    }
    // 電話番号
    if (purchaserTel !== null) {
        conditions.push({ purchaser_tel: purchaserTel });
    }
    // メモ
    if (watcherName !== null) {
        conditions.push({ watcher_name: watcherName });
    }

    try {
        // 総数検索
        const count = await Models.Reservation.count(
            {
                $and: conditions
            }
        ).exec();

        // データ検索
        const reservations = <any[]>await Models.Reservation.find({ $and: conditions })
            .skip(limit * (page - 1))
            .limit(limit)
            .lean(true)
            .exec();

        // ソート昇順(上映日→開始時刻→購入番号→座席コード)
        reservations.sort((a, b) => {
            if (a.performance_day > b.performance_day) {
                return 1;
            }
            if (a.performance_day < b.performance_day) {
                return -1;
            }
            if (a.performance_start_time > b.performance_start_time) {
                return 1;
            }
            if (a.performance_start_time < b.performance_start_time) {
                return -1;
            }
            if (a.payment_no > b.payment_no) {
                return 1;
            }
            if (a.payment_no < b.payment_no) {
                return -1;
            }
            return ScreenUtil.sortBySeatCode(a.seat_code, b.seat_code);
        });

        res.json({
            success: true,
            results: reservations,
            count: count,
            errors: null
        });
    } catch (error) {
        console.error(error);
        res.json({
            success: false,
            results: [],
            errors: null,
            count: 0
        });
    }
}
/**
 * マイページ予約検索画面検証
 *
 * @param {any} req
 * @return {any}
 */
async function validate(req: Request): Promise<any> {
    // 来塔日
    req.checkQuery('day', req.__('Message.required{{fieldName}}', { fieldName: req.__('Label.Day') })).notEmpty();

    // 検証
    const validatorResult = await req.getValidationResult();
    const errors = (!validatorResult.isEmpty()) ? req.validationErrors(true) : {};

    // 片方入力エラーチェック
    if (!isInputEven(req.query.start_hour1, req.query.start_minute1)) {
        (<any>errors).start_hour1 = {msg: '時分Fromが片方しか指定されていません'};
    }
    if (!isInputEven(req.query.start_hour2, req.query.start_minute2)) {
        (<any>errors).start_hour2 = {msg: '時分Toが片方しか指定されていません'};
    }
    return errors;
}
/**
 * 両方入力チェック(両方入力、または両方未入力の時true)
 *
 * @param {string} value1
 * @param {string} value2
 * @return {boolean}
 */
function isInputEven( value1: string, value2: string): boolean {
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
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    const reservationId = req.body.reservationId;
    const watcherName = req.body.watcherName;

    const condition = {
        _id: reservationId,
        status: ReservationUtil.STATUS_RESERVED
    };

    // 自分の予約のみ
    (<any>condition).owner = req.staffUser.get('_id');

    try {
        const reservation = await Models.Reservation.findOneAndUpdate(
            condition,
            {
                watcher_name: watcherName,
                watcher_name_updated_at: Date.now(),
                owner_signature: req.staffUser.get('signature')
            },
            { new: true }
        ).exec();

        if (reservation === null) {
            res.json({
                success: false,
                message: req.__('Message.NotFound'),
                reservationId: null
            });
        } else {
            res.json({
                success: true,
                reservation: reservation.toObject()
            });
        }
    } catch (error) {
        res.json({
            success: false,
            message: req.__('Message.UnexpectedError'),
            reservationId: null
        });
    }
}

/**
 * 座席開放
 */
export async function release(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.method === 'POST') {
        const day = req.body.day;
        if (day === undefined || day === '') {
            res.json({
                success: false,
                message: req.__('Message.UnexpectedError')
            });
            return;
        }

        try {
            await Models.Reservation.remove(
                {
                    performance_day: day,
                    status: ReservationUtil.STATUS_KEPT_BY_TTTS
                }
            ).exec();

            res.json({
                success: true,
                message: null
            });
        } catch (error) {
            res.json({
                success: false,
                message: req.__('Message.UnexpectedError')
            });
        }
    } else {
        try {
            // 開放座席情報取得
            const reservations = await Models.Reservation.find(
                {
                    status: ReservationUtil.STATUS_KEPT_BY_TTTS
                },
                'status seat_code performance_day'
            ).exec();

            // 日付ごとに
            const reservationsByDay: {
                [day: string]: mongoose.Document[]
            } = {};
            reservations.forEach((reservation) => {
                if (!reservationsByDay.hasOwnProperty(reservation.get('performance_day'))) {
                    reservationsByDay[reservation.get('performance_day')] = [];
                }

                reservationsByDay[reservation.get('performance_day')].push(reservation);
            });

            res.render('staff/mypage/release', {
                reservationsByDay: reservationsByDay,
                layout: layout
            });
        } catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    }
}
