"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 予約セッション
 * 予約プロセス中の情報を全て管理するためのモデルです
 * この情報をセッションで引き継くことで、予約プロセスを管理しています
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
            total = this.transactionInProgress.reservations.reduce((a, b) => a + b.unitPrice, 0);
        }
        return total;
    }
}
exports.default = ReserveSessionModel;
