import { Request } from 'express';

/**
 * 予約セッション
 * 予約プロセス中の情報を全て管理するためのモデルです
 * この情報をセッションで引き継くことで、予約プロセスを管理しています
 * @export
 * @class ReserveSessionModel
 */
export default class ReserveSessionModel {
    public transactionInProgress: Express.ITransactionInProgress;

    constructor(transactionInProgress: Express.ITransactionInProgress) {
        this.transactionInProgress = transactionInProgress;
    }

    /**
     * プロセス中の購入情報をセッションから取得する
     */
    public static FIND(req: Request): ReserveSessionModel | null {
        const transactionInProgress = (<Express.Session>req.session).transactionInProgress;
        if (transactionInProgress === undefined) {
            return null;
        }

        return new ReserveSessionModel(transactionInProgress);
    }

    /**
     * プロセス中の購入情報をセッションから削除する
     */
    public static REMOVE(req: Request): void {
        delete (<Express.Session>req.session).transactionInProgress;
    }

    /**
     * プロセス中の購入情報をセッションに保存する
     */
    public save(req: Request): ReserveSessionModel {
        (<Express.Session>req.session).transactionInProgress = this.transactionInProgress;

        return this;
    }

    /**
     * 合計金額を算出する
     */
    public getTotalCharge(): number {
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
    public getChargeBySeatCode(seatCode: string): number {
        let charge = 0;

        const reservation = this.transactionInProgress.reservations.find((r) => r.seat_code === seatCode);
        if (reservation !== undefined && reservation.ticket_type_charge !== undefined) {
            charge += reservation.ticket_type_charge;
            charge += this.getChargeExceptTicketTypeBySeatCode(seatCode);
        }

        return charge;
    }

    public getChargeExceptTicketTypeBySeatCode(seatCode: string): number {
        let charge = 0;

        const reservation = this.transactionInProgress.reservations.find((r) => r.seat_code === seatCode);

        // 座席グレード分加算
        if (reservation !== undefined && reservation.seat_grade_additional_charge > 0) {
            charge += reservation.seat_grade_additional_charge;
        }

        return charge;
    }
}
