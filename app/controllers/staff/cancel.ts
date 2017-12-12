/**
 * 内部関係者座席予約キャンセルコントローラー
 *
 * @namespace controller/staff/cancel
 */
import * as ttts from '@motionpicture/ttts-domain';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';

const debug = createDebug('ttts-staff:controller:staff:cancel');

/**
 * キャンセル実行api
 *
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
export async function execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));

        return;
    }
    const successIds: string[] = [];
    const errorIds: string[] = [];
    try {
        // 予約IDリストをjson形式で受け取る
        const reservationIds = JSON.parse(req.body.reservationIds);
        if (!Array.isArray(reservationIds)) {
            throw new Error(req.__('Message.UnexpectedError'));
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
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
async function cancelById(reservationId: string): Promise<boolean> {
    try {
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const stockRepo = new ttts.repository.Stock(ttts.mongoose.connection);

        // idから予約データ取得
        const reservation = <any>await reservationRepo.reservationModel.findOne(
            {
                _id: reservationId,
                status: ttts.factory.reservationStatusType.ReservationConfirmed
            }
        ).exec().then((doc) => {
            if (doc === null) {
                throw new Error('Reservation not found.');
            }

            return doc.toObject();
        });

        // 同じseat_code_baseのチケット一式を予約キャンセル(車椅子予約の場合は、システムホールドのデータもキャンセルする必要があるので)
        const cancelingReservations = await reservationRepo.reservationModel.find(
            {
                performance_day: reservation.performance_day,
                payment_no: reservation.payment_no,
                'reservation_ttts_extension.seat_code_base': reservation.seat_code
            }
        ).exec();

        debug('canceling...', cancelingReservations);
        await Promise.all(cancelingReservations.map(async (cancelingReservation) => {
            // 予約をキャンセル
            await reservationRepo.reservationModel.findByIdAndUpdate(
                cancelingReservation._id,
                { status: ttts.factory.reservationStatusType.ReservationCancelled }
            ).exec();

            // 在庫を空きに(在庫IDに対して、元の状態に戻す)
            await stockRepo.stockModel.findByIdAndUpdate(
                cancelingReservation.get('stock'),
                { availability: cancelingReservation.get('stock_availability_before') }
            ).exec();
        }));
        debug(cancelingReservations.length, 'reservation(s) canceled.');

        // tslint:disable-next-line:no-suspicious-comment
        // TODO 017/11 時間ごとの予約レコードのSTATUS初期化
        // if (reservation.ticket_ttts_extension !== ttts.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
        //     await ttts.Models.ReservationPerHour.findOneAndUpdate(
        //         { reservation_id: reservationId },
        //         {
        //             $set: { status: ttts.factory.itemAvailability.InStock },
        //             $unset: { expired_at: 1, reservation_id: 1 }
        //         },
        //         {
        //             new: true
        //         }
        //     ).exec();
        // }
    } catch (error) {
        return false;
    }

    return true;
}
