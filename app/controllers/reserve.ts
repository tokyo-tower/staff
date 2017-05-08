/**
 * 座席予約状態参照コントローラー
 *
 * @namespace controller/reserve
 */

import { Models, ReservationUtil, ScreenUtil } from '@motionpicture/chevre-domain';
import { NextFunction, Request, Response } from 'express';

import ReservationModel from '../models/reserve/session';

/**
 * 座席の状態を取得する
 */
export async function getUnavailableSeatCodes(req: Request, res: Response, __: NextFunction) {
    try {
        const seatCodes = await Models.Reservation.distinct(
            'seat_code',
            {
                performance: req.params.performanceId
            }
        ).exec();

        res.json(seatCodes);
    } catch (error) {
        res.json([]);
    }
}

/**
 * 座席の状態を取得する
 */
export async function getSeatProperties(req: Request, res: Response, __: NextFunction) {
    try {
        const reservationModel = ReservationModel.FIND(req);

        if (reservationModel === null) {
            res.json({ propertiesBySeatCode: {} });
            return;
        }

        const propertiesBySeatCode: {
            [seatCode: string]: {
                avalilable: boolean, // 予約可能かどうか
                baloonContent: string, // バルーン内容
                entered: boolean // 入場済みかどうか
            };
        } = {};

        // 予約リストを取得
        const reservations = await Models.Reservation.find(
            {
                performance: reservationModel.performance._id
            }
        ).exec();

        // 予約データが存在すれば、現在仮押さえ中の座席を除いて予約不可(disabled)
        reservations.forEach((reservation) => {
            const seatCode = reservation.get('seat_code');
            let avalilable = false;
            let baloonContent = seatCode;

            if (reservationModel.seatCodes.indexOf(seatCode) >= 0) {
                // 仮押さえ中
                avalilable = true;
            }

            // 内部関係者用
            if (reservationModel.purchaserGroup === ReservationUtil.PURCHASER_GROUP_STAFF) {
                baloonContent = reservation.get('baloon_content4staff');

                // 内部関係者はCHEVRE確保も予約できる
                if (reservation.get('status') === ReservationUtil.STATUS_KEPT_BY_CHEVRE) {
                    avalilable = true;
                }
            }

            propertiesBySeatCode[seatCode] = {
                avalilable: avalilable,
                baloonContent: baloonContent,
                entered: reservation.get('checked_in')
            };
        });

        // 予約のない座席は全て空席
        reservationModel.performance.screen.sections[0].seats.forEach((seat) => {
            if (!propertiesBySeatCode.hasOwnProperty(seat.code)) {
                propertiesBySeatCode[seat.code] = {
                    avalilable: true,
                    baloonContent: seat.code,
                    entered: false
                };
            }
        });

        res.json({
            propertiesBySeatCode: propertiesBySeatCode
        });
    } catch (error) {
        res.json({ propertiesBySeatCode: {} });
    }
}

/**
 * 印刷
 */
export async function print(req: Request, res: Response, next: NextFunction) {
    try {
        const ids: string[] = JSON.parse(req.query.ids);
        const reservations = await Models.Reservation.find(
            {
                _id: { $in: ids },
                status: ReservationUtil.STATUS_RESERVED
            }
        ).exec();

        if (reservations.length === 0) {
            next(new Error(req.__('Message.NotFound')));
            return;
        }

        reservations.sort((a, b) => {
            return ScreenUtil.sortBySeatCode(a.get('seat_code'), b.get('seat_code'));
        });

        res.render('reserve/print', {
            layout: false,
            reservations: reservations
        });
    } catch (error) {
        console.error(error);
        next(new Error(req.__('Message.UnexpectedError')));
    }
}
