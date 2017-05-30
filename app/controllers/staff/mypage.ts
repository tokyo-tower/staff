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

export async function index(__: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // const theaters = await Models.Theater.find({}, 'name', { sort: { _id: 1 } }).exec();
        // const films = await Models.Film.find({}, 'name', { sort: { _id: 1 } }).exec();
        const owners = await Models.Owner.find({}, '_id name', { sort: { _id: 1 } }).exec();

        res.render('staff/mypage/index', {
            // theaters: theaters,
            // films: films,
            owners: owners,
            layout: layout
        });
    } catch (error) {
        next(error);
    }
}

/**
 * マイページ予約検索
 */
// tslint:disable-next-line:max-func-body-length
// tslint:disable-next-line:cyclomatic-complexity
export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    // tslint:disable-next-line:no-magic-numbers
    const limit: number = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, DEFAULT_RADIX) : 10;
    const page: number = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, DEFAULT_RADIX) : 1;
    const day: string | null = (!_.isEmpty(req.query.day)) ? req.query.day : null;
    const startHour1: string | null = (!_.isEmpty(req.query.start_hour1)) ? req.query.start_hour1 : null;
    const startMinute1: string | null = (!_.isEmpty(req.query.start_minute1)) ? req.query.start_minute1 : null;
    const startHour2: string | null = (!_.isEmpty(req.query.start_hour2)) ? req.query.start_hour2 : null;
    const startMinute2: string | null = (!_.isEmpty(req.query.start_minute2)) ? req.query.start_minute2 : null;
    let paymentNo: string | null = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
    const owner: string | null = (!_.isEmpty(req.query.owner)) ? req.query.owner : null;

// 　　名前      reservations.？ ※1
// 　　メアド    reservations.？ ※1
// 　　電話番号  reservations.？ ※1
// 　　メモ      reservations.watcher_name ※2

    // const theater: string | null = (!_.isEmpty(req.query.theater)) ? req.query.theater : null;
    // const film: string | null = (!_.isEmpty(req.query.film)) ? req.query.film : null;
    // const updater: string | null = (!_.isEmpty(req.query.updater)) ? req.query.updater : null;

    // 検索条件を作成
    const conditions: any[] = [];

    // 管理者の場合、内部関係者の予約全て&確保中
    if (req.staffUser.get('is_admin') === true) {
        conditions.push(
            {
                $or: [
                    {
                        purchaser_group: ReservationUtil.PURCHASER_GROUP_STAFF,
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
                purchaser_group: ReservationUtil.PURCHASER_GROUP_STAFF,
                owner: req.staffUser.get('_id'),
                status: ReservationUtil.STATUS_RESERVED
            }
        );
    }

    // if (film !== null) {
    //     conditions.push({ film: film });
    // }

    // if (theater !== null) {
    //     conditions.push({ theater: theater });
    // }

    if (day !== null) {
        conditions.push({ performance_day: day });
    }

    const startTimeFrom: any = (startHour1 !== null && startMinute1 !== null) ? startHour1 + startMinute1 : null;
    const startTimeTo: any = (startHour2 !== null && startMinute2 !== null) ? startHour2 + startMinute2 : null;
    if (startTimeFrom !== null || startTimeTo !== null) {
        const conditionsTime: any = {};
        // const key: string = 'performance_start_time';
        // 開始時間From
        if (startTimeFrom !== null) {
            // const keyFrom = '$gte';
            conditionsTime.$gte = startTimeFrom;
        }
        // 開始時間To
        if (startTimeTo !== null) {
            // const keyFrom = '$lt';
            conditionsTime.$lt = startTimeTo;
        }
        conditions.push({ performance_start_time : conditionsTime });
    }

    // let startTimeTo: string = '';
    // if (startHour1 !== null && startMinute1 !== null) {
    // }
    // if (startHour1 !== null && startMinute1 !== null) {
    //     conditions.push({
    //         performance_start_time: {
    //             $gte: startHour1 + startMinute1
    //         }
    //     });
    // }

    // if (startHour2 !== null && startMinute2 !== null) {
    //     conditions.push({
    //         performance_end_time: {
    //             $lte: startHour2 + startMinute2
    //         }
    //     });
    // }

    // if (updater !== null) {
    //     conditions.push({
    //         $or: [
    //             {
    //                 owner_signature: { $regex: `${updater}` }
    //             },
    //             {
    //                 watcher_name: { $regex: `${updater}` }
    //             }
    //         ]
    //     });
    // }

    if (paymentNo !== null) {
        // remove space characters
        paymentNo = CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, ''));
        conditions.push({ payment_no: { $regex: `${paymentNo}` } });
    }

    if (owner !== null) {
        conditions.push({ owner: owner });
    }

    try {
        // 総数検索
        const count = await Models.Reservation.count(
            {
                $and: conditions
            }
        ).exec();

        const reservations = <any[]>await Models.Reservation.find({ $and: conditions })
        //const reservations = <any[]>await Models.Reservation.find({})
            .skip(limit * (page - 1))
            .limit(limit)
            .lean(true)
            .exec();

        // ソート昇順(上映日→開始時刻→スクリーン→座席コード)
        reservations.sort((a, b) => {
            if (a.performance_day > b.performance_day) {
                return 1;
            }
            if (a.performance_start_time > b.performance_start_time) {
                return 1;
            }
            if (a.screen > b.screen) {
                return 1;
            }
            return ScreenUtil.sortBySeatCode(a.seat_code, b.seat_code);
        });

        res.json({
            success: true,
            results: reservations,
            count: count
        });
    } catch (error) {
        console.error(error);
        res.json({
            success: false,
            results: [],
            count: 0
        });
    }
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
