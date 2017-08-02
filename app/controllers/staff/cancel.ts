/**
 * 内部関係者座席予約キャンセルコントローラー
 *
 * @namespace controller/staff/cancel
 */

import { Models } from '@motionpicture/ttts-domain';
import { ReservationUtil } from '@motionpicture/ttts-domain';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';

const debug = createDebug('ttts-staff:controller:staffCancel');

export async function execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }
    const staffUser = req.staffUser;
    const successIds: string[] = [];
    const errorIds: string[] = [];
    try {
        // 予約IDリストをjson形式で受け取る
        const reservationIds = JSON.parse(req.body.reservationIds);
        if (!Array.isArray(reservationIds)) {
            throw new Error(req.__('Message.UnexpectedError'));
        }

        const promises = reservationIds.map(async (id) => {
            debug(
                'updating to AVAILABLE by staff... staff:', staffUser.get('user_id'),
                'signature:', staffUser.get('signature'),
                'id:', id
            );
            // const reservation = await Models.Reservation.findOneAndUpdate(
            //     { _id: id },
            //     { status: ReservationUtil.STATUS_KEPT_BY_TTTS },
            //     { new: true }
            // ).exec();
            const result: boolean = await cancelById(id);
            // debug(
            //     'updated to STATUS_KEPT_BY_TTTS by staff.', reservation,
            //     'staff:', staffUser.get('user_id'),
            //     'signature:', staffUser.get('signature'),
            //     'id:', id
            // );
            if (result) {
                successIds.push(id);
            } else {
                errorIds.push(id);
            }
        });
        await Promise.all(promises);
        res.json({
            success: true,
            message: null,
            successIds: successIds,
            errorIds: errorIds
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message,
            successIds: successIds,
            errorIds: errorIds
        });
    }
}
/**
 * キャンセル処理(idから)
 *
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
async function cancelById(reservationId: string) : Promise<boolean> {
    try {
        // idから予約データ取得
        const reservation: any = await Models.Reservation.findById(reservationId).exec();
        // キャンセルメール送信
        //await sendEmail(reservations[0].purchaser_email, getCancelMail(reservations));
        //logger.info('-----update db start-----');
        // 予約データ解放(AVAILABLEに変更)
        await Models.Reservation.findByIdAndUpdate(
            reservation._id,
            {
                $set: { status: ReservationUtil.STATUS_AVAILABLE },
                $unset: getUnsetFields(reservation._doc)
            }
        ).exec();
        //logger.info('Reservation clear =', JSON.stringify(reservation));

        const tickets = (<any>Models.CustomerCancelRequest).getTickets([reservation]);
        // キャンセルリクエスト保管
        await Models.CustomerCancelRequest.create({
            reservation: reservation,
            //tickets: (<any>Models.CustomerCancelRequest).getTickets([reservation]),
            tickets: tickets,
            cancel_name: reservation.owner_name.ja,
            cancellation_fee: 0
        });
        // logger.info('CustomerCancelRequest create =', JSON.stringify(reservations[0]));
        // logger.info('-----update db end-----');
    } catch (error) {

        return false;
    }

    return true;
}
/**
 * 更新時削除フィールド取得
 *
 * @param {any} reservation
 * @return {any} unset
 */
function getUnsetFields(reservation: any): any {
    const setFields: string[] = [
        '_id',
        'performance',
        'seat_code',
        'updated_at',
        'checkins',
        'performance_canceled',
        'status',
        '__v',
        'created_at'
    ];
    const unset = {};
    // セットフィールド以外は削除フィールドにセット
    Object.getOwnPropertyNames(reservation).forEach((propertyName) => {
        if (setFields.indexOf(propertyName) < 0) {
            (<any>unset)[propertyName] = 1;
        }
    });

    return unset;
}
