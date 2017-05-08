/**
 * 当日窓口マイページコントローラー
 *
 * @namespace controller/window/mypage
 */

import { CommonUtil, Models, ReservationUtil, ScreenUtil } from '@motionpicture/chevre-domain';
import { Util as GMOUtil } from '@motionpicture/gmo-service';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as _ from 'underscore';

const DEFAULT_RADIX = 10;
const layout: string = 'layouts/window/layout';

export function index(__1: Request, res: Response, __2: NextFunction): void {
    res.render('window/mypage/index', {
        GMOUtil: GMOUtil,
        ReservationUtil: ReservationUtil,
        layout: layout
    });
}

/**
 * マイページ予約検索
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
export async function search(req: Request, res: Response, __: NextFunction): Promise<void> {
    // tslint:disable-next-line:no-magic-numbers
    const limit: number = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, DEFAULT_RADIX) : 10;
    const page: number = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, DEFAULT_RADIX) : 1;
    const purchaserGroups: string[] = (!_.isEmpty(req.query.purchaser_groups)) ? req.query.purchaser_groups.split(',') : [];
    const purchasedDay: string | null = (!_.isEmpty(req.query.purchased_day)) ? req.query.purchased_day : null;
    let email: string | null = (!_.isEmpty(req.query.email)) ? req.query.email : null;
    let tel: string | null = (!_.isEmpty(req.query.tel)) ? req.query.tel : null;
    let purchaserFirstName: string | null =
        (!_.isEmpty(req.query.purchaser_first_name)) ? req.query.purchaser_first_name : null;
    let purchaserLastName: string | null = (!_.isEmpty(req.query.purchaser_last_name)) ? req.query.purchaser_last_name : null;
    let paymentNo: string | null = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
    const day: string | null = (!_.isEmpty(req.query.day)) ? req.query.day : null;
    let filmName: string | null = (!_.isEmpty(req.query.film_name)) ? req.query.film_name : null;

    // 検索条件を作成
    const conditions: any[] = [];

    // 内部関係者以外がデフォルト
    conditions.push(
        {
            purchaser_group: { $ne: ReservationUtil.PURCHASER_GROUP_STAFF },
            status: {
                $in: [
                    ReservationUtil.STATUS_RESERVED,
                    ReservationUtil.STATUS_WAITING_SETTLEMENT,
                    ReservationUtil.STATUS_WAITING_SETTLEMENT_PAY_DESIGN
                ]
            }
        }
    );

    if (purchaserGroups.length > 0) {
        conditions.push({ purchaser_group: { $in: purchaserGroups } });
    }

    // 購入日条件
    if (purchasedDay !== null) {
        conditions.push(
            {
                purchased_at: {
                    $gte: moment(
                        // tslint:disable-next-line:no-magic-numbers
                        `${purchasedDay.substr(0, 4)}-${purchasedDay.substr(4, 2)}-${purchasedDay.substr(6, 2)}T00:00:00+09:00`
                    ),
                    $lte: moment(
                        // tslint:disable-next-line:no-magic-numbers
                        `${purchasedDay.substr(0, 4)}-${purchasedDay.substr(4, 2)}-${purchasedDay.substr(6, 2)}T23:59:59+09:00`
                    )
                }
            }
        );
    }

    if (email !== null) {
        // remove space characters
        email = CommonUtil.toHalfWidth(email.replace(/\s/g, ''));
        conditions.push({ purchaser_email: { $regex: new RegExp(email, 'i') } });
    }

    if (tel !== null) {
        // remove space characters
        tel = CommonUtil.toHalfWidth(tel.replace(/\s/g, ''));
        conditions.push({ purchaser_tel: { $regex: new RegExp(tel, 'i') } });
    }

    // 空白つなぎでAND検索
    if (purchaserFirstName !== null) {
        // trim and to half-width space
        purchaserFirstName = purchaserFirstName.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
        purchaserFirstName.split(' ').forEach((pattern) => {
            if (pattern.length > 0) {
                conditions.push({ purchaser_first_name: { $regex: new RegExp(pattern, 'i') } });
            }
        });
    }
    // 空白つなぎでAND検索
    if (purchaserLastName !== null) {
        // trim and to half-width space
        purchaserLastName = purchaserLastName.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
        purchaserLastName.split(' ').forEach((pattern) => {
            if (pattern.length > 0) {
                conditions.push({ purchaser_last_name: { $regex: new RegExp(pattern, 'i') } });
            }
        });
    }

    if (paymentNo !== null) {
        // remove space characters
        paymentNo = CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, ''));
        conditions.push({ payment_no: { $regex: new RegExp(paymentNo, 'i') } });
    }

    if (day !== null) {
        conditions.push({ performance_day: day });
    }

    // 空白つなぎでAND検索
    if (filmName !== null) {
        // trim and to half-width space
        filmName = filmName.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
        filmName.split(' ').forEach((pattern) => {
            if (pattern.length > 0) {
                const regex = new RegExp(pattern, 'i');
                conditions.push({
                    $or: [
                        {
                            'film_name.ja': { $regex: regex }
                        },
                        {
                            'film_name.en': { $regex: regex }
                        }
                    ]
                });
            }
        });
    }

    try {
        // 総数検索
        const count = await Models.Reservation.count(
            {
                $and: conditions
            }
        ).exec();

        const reservations = <any[]>await Models.Reservation.find({ $and: conditions })
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
