"use strict";
/**
 * 内部関係者座席予約キャンセルコントローラー
 *
 * @namespace controller/staff/cancel
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ttts_domain_1 = require("@motionpicture/ttts-domain");
const ttts_domain_2 = require("@motionpicture/ttts-domain");
const createDebug = require("debug");
const debug = createDebug('ttts-staff:controller:staffCancel');
function execute(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        const staffUser = req.staffUser;
        const successIds = [];
        const errorIds = [];
        try {
            // 予約IDリストをjson形式で受け取る
            const reservationIds = JSON.parse(req.body.reservationIds);
            if (!Array.isArray(reservationIds)) {
                throw new Error(req.__('Message.UnexpectedError'));
            }
            const promises = reservationIds.map((id) => __awaiter(this, void 0, void 0, function* () {
                debug('updating to AVAILABLE by staff... staff:', staffUser.get('user_id'), 'signature:', staffUser.get('signature'), 'id:', id);
                // const reservation = await Models.Reservation.findOneAndUpdate(
                //     { _id: id },
                //     { status: ReservationUtil.STATUS_KEPT_BY_TTTS },
                //     { new: true }
                // ).exec();
                const result = yield cancelById(id);
                // debug(
                //     'updated to STATUS_KEPT_BY_TTTS by staff.', reservation,
                //     'staff:', staffUser.get('user_id'),
                //     'signature:', staffUser.get('signature'),
                //     'id:', id
                // );
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
        try {
            // idから予約データ取得
            const reservation = yield ttts_domain_1.Models.Reservation.findById(reservationId).exec();
            // キャンセルメール送信
            //await sendEmail(reservations[0].purchaser_email, getCancelMail(reservations));
            //logger.info('-----update db start-----');
            // 予約データ解放(AVAILABLEに変更)
            yield ttts_domain_1.Models.Reservation.findByIdAndUpdate(reservation._id, {
                $set: { status: ttts_domain_2.ReservationUtil.STATUS_AVAILABLE },
                $unset: getUnsetFields(reservation._doc)
            }).exec();
            //logger.info('Reservation clear =', JSON.stringify(reservation));
            const tickets = ttts_domain_1.Models.CustomerCancelRequest.getTickets([reservation]);
            // キャンセルリクエスト保管
            yield ttts_domain_1.Models.CustomerCancelRequest.create({
                reservation: reservation,
                //tickets: (<any>Models.CustomerCancelRequest).getTickets([reservation]),
                tickets: tickets,
                cancel_name: reservation.owner_name.ja,
                cancellation_fee: 0
            });
            // logger.info('CustomerCancelRequest create =', JSON.stringify(reservations[0]));
            // logger.info('-----update db end-----');
        }
        catch (error) {
            return false;
        }
        return true;
    });
}
/**
 * 更新時削除フィールド取得
 *
 * @param {any} reservation
 * @return {any} unset
 */
function getUnsetFields(reservation) {
    const setFields = [
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
            unset[propertyName] = 1;
        }
    });
    return unset;
}
