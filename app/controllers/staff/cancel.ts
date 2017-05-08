/**
 * 内部関係者座席予約キャンセルコントローラー
 *
 * @namespace controller/staff/cancel
 */

import { Models } from '@motionpicture/chevre-domain';
import { ReservationUtil } from '@motionpicture/chevre-domain';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';

const debug = createDebug('chevre-frontend:controller:staffCancel');

export async function execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }
    const staffUser = req.staffUser;

    try {
        // 予約IDリストをjson形式で受け取る
        const reservationIds = JSON.parse(req.body.reservationIds);
        if (!Array.isArray(reservationIds)) {
            throw new Error(req.__('Message.UnexpectedError'));
        }

        const promises = reservationIds.map(async (id) => {
            debug(
                'updating to STATUS_KEPT_BY_CHEVRE by staff... staff:', staffUser.get('user_id'),
                'signature:', staffUser.get('signature'),
                'id:', id
            );
            const reservation = await Models.Reservation.findOneAndUpdate(
                { _id: id },
                { status: ReservationUtil.STATUS_KEPT_BY_CHEVRE },
                { new: true }
            ).exec();
            debug(
                'updated to STATUS_KEPT_BY_CHEVRE by staff.', reservation,
                'staff:', staffUser.get('user_id'),
                'signature:', staffUser.get('signature'),
                'id:', id
            );
        });

        await Promise.all(promises);

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
