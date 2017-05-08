"use strict";
/**
 * 座席予約状態参照コントローラー
 *
 * @namespace controller/reserve
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
const chevre_domain_1 = require("@motionpicture/chevre-domain");
const session_1 = require("../models/reserve/session");
/**
 * 座席の状態を取得する
 */
function getUnavailableSeatCodes(req, res, __) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const seatCodes = yield chevre_domain_1.Models.Reservation.distinct('seat_code', {
                performance: req.params.performanceId
            }).exec();
            res.json(seatCodes);
        }
        catch (error) {
            res.json([]);
        }
    });
}
exports.getUnavailableSeatCodes = getUnavailableSeatCodes;
/**
 * 座席の状態を取得する
 */
function getSeatProperties(req, res, __) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                res.json({ propertiesBySeatCode: {} });
                return;
            }
            const propertiesBySeatCode = {};
            // 予約リストを取得
            const reservations = yield chevre_domain_1.Models.Reservation.find({
                performance: reservationModel.performance._id
            }).exec();
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
                if (reservationModel.purchaserGroup === chevre_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF) {
                    baloonContent = reservation.get('baloon_content4staff');
                    // 内部関係者はCHEVRE確保も予約できる
                    if (reservation.get('status') === chevre_domain_1.ReservationUtil.STATUS_KEPT_BY_CHEVRE) {
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
        }
        catch (error) {
            res.json({ propertiesBySeatCode: {} });
        }
    });
}
exports.getSeatProperties = getSeatProperties;
/**
 * 印刷
 */
function print(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const ids = JSON.parse(req.query.ids);
            const reservations = yield chevre_domain_1.Models.Reservation.find({
                _id: { $in: ids },
                status: chevre_domain_1.ReservationUtil.STATUS_RESERVED
            }).exec();
            if (reservations.length === 0) {
                next(new Error(req.__('Message.NotFound')));
                return;
            }
            reservations.sort((a, b) => {
                return chevre_domain_1.ScreenUtil.sortBySeatCode(a.get('seat_code'), b.get('seat_code'));
            });
            res.render('reserve/print', {
                layout: false,
                reservations: reservations
            });
        }
        catch (error) {
            console.error(error);
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.print = print;
