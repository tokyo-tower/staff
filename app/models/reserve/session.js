"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 予約セッション
 * 予約プロセス中の情報を全て管理するためのモデルです
 * この情報をセッションで引き継くことで、予約プロセスを管理しています
 * @export
 * @class ReserveSessionModel
 */
class ReserveSessionModel {
    constructor(transactionInProgress) {
        this.transactionInProgress = transactionInProgress;
    }
    /**
     * プロセス中の購入情報をセッションから取得する
     */
    static FIND(req) {
        const transactionInProgress = req.session.transactionInProgress;
        if (transactionInProgress === undefined) {
            return null;
        }
        return new ReserveSessionModel(transactionInProgress);
    }
    /**
     * プロセス中の購入情報をセッションから削除する
     */
    static REMOVE(req) {
        delete req.session.transactionInProgress;
    }
    /**
     * プロセス中の購入情報をセッションに保存する
     */
    save(req) {
        req.session.transactionInProgress = this.transactionInProgress;
        return this;
    }
    /**
     * 合計金額を算出する
     */
    getTotalCharge() {
        let total = 0;
        if (Array.isArray(this.transactionInProgress.reservations)) {
            this.transactionInProgress.reservations.forEach((reservation) => {
                total += this.getChargeBySeatCode(reservation.seat_code);
            });
        }
        return total;
    }
    /**
     * 座席単体の料金を算出する
     */
    getChargeBySeatCode(seatCode) {
        let charge = 0;
        const reservation = this.transactionInProgress.reservations.find((r) => r.seat_code === seatCode);
        if (reservation !== undefined && reservation.ticket_type_charge !== undefined) {
            charge += reservation.ticket_type_charge;
            charge += this.getChargeExceptTicketTypeBySeatCode(seatCode);
        }
        return charge;
    }
    getChargeExceptTicketTypeBySeatCode(seatCode) {
        let charge = 0;
        const reservation = this.transactionInProgress.reservations.find((r) => r.seat_code === seatCode);
        // 座席グレード分加算
        if (reservation !== undefined && reservation.seat_grade_additional_charge > 0) {
            charge += reservation.seat_grade_additional_charge;
        }
        return charge;
    }
}
exports.default = ReserveSessionModel;
