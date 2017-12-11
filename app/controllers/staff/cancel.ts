/**
 * 内部関係者座席予約キャンセルコントローラー
 *
 * @namespace controller/staff/cancel
 */
import * as ttts from '@motionpicture/ttts-domain';
import { NextFunction, Request, Response } from 'express';

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
 *
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
async function cancelById(reservationId: string): Promise<boolean> {
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
    try {
        // idから予約データ取得
        const reservation: any = await reservationRepo.reservationModel.findById(reservationId).exec();
        // seat_code_baseから本体分+余分確保分チケットを取得
        const conditions: any = {
            performance: reservation.performance,
            performance_day: reservation.performance_day
        };
        conditions['reservation_ttts_extension.seat_code_base'] = reservation.seat_code;

        // 同じseat_code_baseのチケット一式を予約キャンセル
        await reservationRepo.reservationModel.update(
            conditions,
            { status: ttts.factory.reservationStatusType.ReservationCancelled },
            { multi: true }
        ).exec();

        // 2017/11 時間ごとの予約レコードのSTATUS初期化
        if (reservation.ticket_ttts_extension !== ttts.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
            await ttts.Models.ReservationPerHour.findOneAndUpdate(
                { reservation_id: reservationId },
                {
                    $set: { status: ttts.factory.itemAvailability.InStock },
                    $unset: { expired_at: 1, reservation_id: 1 }
                },
                {
                    new: true
                }
            ).exec();
        }
    } catch (error) {

        return false;
    }

    return true;
}
