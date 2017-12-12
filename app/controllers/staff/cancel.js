"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 内部関係者座席予約キャンセルコントローラー
 *
 * @namespace controller/staff/cancel
 */
const ttts = require("@motionpicture/ttts-domain");
const createDebug = require("debug");
const debug = createDebug('ttts-staff:controller:staff:cancel');
/**
 * キャンセル実行api
 *
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
function execute(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        const successIds = [];
        const errorIds = [];
        try {
            // 予約IDリストをjson形式で受け取る
            const reservationIds = JSON.parse(req.body.reservationIds);
            if (!Array.isArray(reservationIds)) {
                throw new Error(req.__('Message.UnexpectedError'));
            }
            const promises = reservationIds.map((id) => __awaiter(this, void 0, void 0, function* () {
                // 予約データの解放
                const result = yield cancelById(id);
                if (result) {
                    successIds.push(id);
                }
                else {
                    errorIds.push(id);
                }
            }));
            yield Promise.all(promises);
            res.json({
                success: true,
                message: null,
                successIds: successIds,
                errorIds: errorIds
            });
        }
        catch (error) {
            res.json({
                success: false,
                message: error.message,
                successIds: successIds,
                errorIds: errorIds
            });
        }
    });
}
exports.execute = execute;
/**
 * キャンセル処理(idから)
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
function cancelById(reservationId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
            const stockRepo = new ttts.repository.Stock(ttts.mongoose.connection);
            // idから予約データ取得
            const reservation = yield reservationRepo.reservationModel.findOne({
                _id: reservationId,
                status: ttts.factory.reservationStatusType.ReservationConfirmed
            }).exec().then((doc) => {
                if (doc === null) {
                    throw new Error('Reservation not found.');
                }
                return doc.toObject();
            });
            // 同じseat_code_baseのチケット一式を予約キャンセル(車椅子予約の場合は、システムホールドのデータもキャンセルする必要があるので)
            const cancelingReservations = yield reservationRepo.reservationModel.find({
                performance_day: reservation.performance_day,
                payment_no: reservation.payment_no,
                'reservation_ttts_extension.seat_code_base': reservation.seat_code
            }).exec();
            debug('canceling...', cancelingReservations);
            yield Promise.all(cancelingReservations.map((cancelingReservation) => __awaiter(this, void 0, void 0, function* () {
                // 予約をキャンセル
                yield reservationRepo.reservationModel.findByIdAndUpdate(cancelingReservation._id, { status: ttts.factory.reservationStatusType.ReservationCancelled }).exec();
                // 在庫を空きに(在庫IDに対して、元の状態に戻す)
                yield stockRepo.stockModel.findByIdAndUpdate(cancelingReservation.get('stock'), { availability: cancelingReservation.get('stock_availability_before') }).exec();
            })));
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
        }
        catch (error) {
            return false;
        }
        return true;
    });
}
