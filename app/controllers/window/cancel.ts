/**
 * 当日窓口座席予約キャンセルコントローラー
 *
 * @namespace controller/window/cancel
 */

import { Models, ReservationUtil } from '@motionpicture/chevre-domain';
import { NextFunction, Request, Response } from 'express';

export async function execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.windowUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    try {
        // 予約IDリストをjson形式で受け取る
        const reservationIds = JSON.parse(req.body.reservationIds);
        if (!Array.isArray(reservationIds)) {
            throw new Error(req.__('Message.UnexpectedError'));
        }

        await Models.Reservation.remove(
            {
                _id: { $in: reservationIds },
                purchaser_group: { $ne: ReservationUtil.PURCHASER_GROUP_STAFF } // 念のため、内部は除外
            }
        ).exec();

        res.json({
            success: true,
            message: null
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message
        });
    }
}
