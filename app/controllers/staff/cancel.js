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
 *
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
function cancelById(reservationId) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        try {
            // idから予約データ取得
            const reservation = yield reservationRepo.reservationModel.findById(reservationId).exec();
            // seat_code_baseから本体分+余分確保分チケットを取得
            const conditions = {
                performance: reservation.performance,
                performance_day: reservation.performance_day
            };
            conditions['reservation_ttts_extension.seat_code_base'] = reservation.seat_code;
            // 同じseat_code_baseのチケット一式を予約キャンセル
            yield reservationRepo.reservationModel.update(conditions, { status: ttts.factory.reservationStatusType.ReservationCancelled }, { multi: true }).exec();
            // 2017/11 時間ごとの予約レコードのSTATUS初期化
            if (reservation.ticket_ttts_extension !== ttts.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
                yield ttts.Models.ReservationPerHour.findOneAndUpdate({ reservation_id: reservationId }, {
                    $set: { status: ttts.factory.itemAvailability.InStock },
                    $unset: { expired_at: 1, reservation_id: 1 }
                }, {
                    new: true
                }).exec();
            }
        }
        catch (error) {
            return false;
        }
        return true;
    });
}
