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
 * 運行・オンライン販売停止コントローラ共通
 *
 * @namespace controller/staff/suspensionSetting
 */
const ttts = require("@motionpicture/ttts-domain");
const numeral = require("numeral");
/**
 * 返金対象予約情報取得
 *  [一般予約]かつ
 *  [予約データ]かつ
 *  [同一購入単位に入塔記録のない]予約のid配列
 * @param {string} performanceIds
 * @return {Promise<IPlaceOrderTransaction[]>}
 */
function getTargetReservationsForRefund(performanceIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const transactionRepo = new ttts.repository.Transaction(ttts.mongoose.connection);
        // 返品されていない、かつ、入場履歴なし、の予約から、取引IDリストを取得
        const targetTransactionIds = yield reservationRepo.reservationModel.distinct('transaction', {
            status: ttts.factory.reservationStatusType.ReservationConfirmed,
            purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
            performance: { $in: performanceIds },
            checkins: { $size: 0 }
        }).exec();
        return transactionRepo.transactionModel.find({
            _id: { $in: targetTransactionIds }
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
    });
}
exports.getTargetReservationsForRefund = getTargetReservationsForRefund;
/**
 * チケット情報取得
 *
 */
function getTicketInfo(reservations, leaf, locale) {
    // 券種ごとに合計枚数算出
    const keyName = 'ticket_type';
    const ticketInfos = {};
    for (const reservation of reservations) {
        // チケットタイプセット
        const dataValue = reservation[keyName];
        // チケットタイプごとにチケット情報セット
        if (!ticketInfos.hasOwnProperty(dataValue)) {
            ticketInfos[dataValue] = {
                ticket_type_name: reservation.ticket_type_name[locale],
                charge: `\\${numeral(reservation.charge).format('0,0')}`,
                count: 1
            };
        }
        else {
            ticketInfos[dataValue].count += 1;
        }
    }
    // 券種ごとの表示情報編集
    const ticketInfoArray = [];
    Object.keys(ticketInfos).forEach((key) => {
        const ticketInfo = ticketInfos[key];
        ticketInfoArray.push(`${ticketInfo.ticket_type_name} ${ticketInfo.count}${leaf}`);
    });
    return ticketInfoArray;
}
exports.getTicketInfo = getTicketInfo;
