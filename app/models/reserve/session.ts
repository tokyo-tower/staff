import * as ttts from '@motionpicture/ttts-domain';
import { Request } from 'express';
import * as moment from 'moment';

const MAX_RESERVATION_SEATS_DEFAULT = 4;
const MAX_RESERVATION_SEATS_STAFFS = 10;

/**
 * 予約情報モデル
 *
 * 予約プロセス中の情報を全て管理するためのモデルです
 * この情報をセッションで引き継くことで、予約プロセスを管理しています
 *
 * @export
 * @class ReserveSessionModel
 */
export default class ReserveSessionModel {
    private static SESSION_KEY: string = 'ttts-reserve-session';

    /**
     * 取引ID(MongoDBで発行される)
     */
    public id: string;
    /**
     * 取引主体ID
     */
    public agentId: string;
    /**
     * 販売者ID
     */
    public sellerId: string;
    public seatReservationAuthorizeActionId: string;
    public creditCardAuthorizeActionId: string;
    /**
     * 購入管理番号
     */
    public paymentNo: string;
    /**
     * 購入確定日時タイムスタンプ
     */
    public purchasedAt: number;
    /**
     * 座席仮予約有効期限タイムスタンプ
     */
    public expiredAt: number;
    /**
     * パフォーマンス
     */
    public performance: IPerformance;
    /**
     * 決済方法選択肢
     */
    public paymentMethodChoices: string[];
    /**
     * 券種リスト
     */
    public ticketTypes: ITicketType[];
    /**
     * スクリーン内の座席グレードリスト
     */
    public seatGradeCodesInScreen: string[];
    /**
     * スクリーンの座席表HTML
     */
    public screenHtml: string;
    /**
     * 予約座席コードリスト
     */
    public seatCodes: string[];
    /**
     * 予約座席コードリスト(特殊チケット用)
     */
    public seatCodesExtra: string[];
    /**
     * 予約座席コードリスト
     */
    public purchaser: IPurchaser;
    /**
     * 決済方法
     */
    public paymentMethod: ttts.factory.paymentMethodType;
    /**
     * 購入者区分
     */
    public purchaserGroup: string;
    /**
     * GMO取引
     */
    public transactionGMO: ITransactionGMO;

    /**
     * プロセス中の購入情報をセッションから取得する
     */
    public static FIND(req: Request): ReserveSessionModel | null {
        const reservationModelInSession = (<any>req.session)[ReserveSessionModel.SESSION_KEY];
        if (reservationModelInSession === undefined) {
            return null;
        }

        const reservationModel = new ReserveSessionModel();
        Object.keys(reservationModelInSession).forEach((propertyName) => {
            (<any>reservationModel)[propertyName] = reservationModelInSession[propertyName];
        });

        return reservationModel;
    }

    /**
     * プロセス中の購入情報をセッションから削除する
     */
    public static REMOVE(req: Request): void {
        delete (<any>req.session)[ReserveSessionModel.SESSION_KEY];
    }

    /**
     * プロセス中の購入情報をセッションに保存する
     */
    public save(req: Request): void {
        (<any>req.session)[ReserveSessionModel.SESSION_KEY] = this;
    }

    /**
     * 一度の購入で予約できる座席数を取得する
     */
    public getSeatsLimit(): number {
        let limit = MAX_RESERVATION_SEATS_DEFAULT;

        // 主体によっては、決済方法を強制的に固定で
        switch (this.purchaserGroup) {
            case ttts.factory.person.Group.Staff:
                limit = MAX_RESERVATION_SEATS_STAFFS;
                break;

            default:
                break;
        }

        return limit;
    }

    /**
     * 合計金額を算出する
     */
    public getTotalCharge(): number {
        let total = 0;

        if (Array.isArray(this.seatCodes)) {
            this.seatCodes.forEach((seatCode) => {
                total += this.getChargeBySeatCode(seatCode);
            });
        }

        return total;
    }

    /**
     * 座席単体の料金を算出する
     */
    public getChargeBySeatCode(seatCode: string): number {
        let charge = 0;

        const reservation = this.getReservation(seatCode);
        if (reservation.ticket_type_charge !== undefined) {
            charge += reservation.ticket_type_charge;
            charge += this.getChargeExceptTicketTypeBySeatCode(seatCode);
        }

        return charge;
    }

    // tslint:disable-next-line:prefer-function-over-method
    public getChargeExceptTicketTypeBySeatCode(__: string): number {
        return 0;
    }

    /**
     * 座席コードから予約情報を取得する
     */
    public getReservation(seatCode: string): IReservation {
        return ((<any>this)[`reservation_${seatCode}`] !== undefined) ? (<any>this)[`reservation_${seatCode}`] : null;
    }

    /**
     * 座席コードの予約情報をセットする
     */
    public setReservation(seatCode: string, reservation: IReservation): void {
        (<any>this)[`reservation_${seatCode}`] = reservation;
    }

    /**
     * 座席コードから予約(確定)ドキュメントを作成する
     *
     * @param {string} seatCode 座席コード
     */
    public seatCode2reservationDocument(seatCode: string) {
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const reservation = this.getReservation(seatCode);
        const doc = {
            status: reservation.status_after,
            seat_code: seatCode,
            seat_grade_name: reservation.seat_grade_name,
            seat_grade_additional_charge: reservation.seat_grade_additional_charge,
            ticket_type: reservation.ticket_type,
            ticket_type_name: reservation.ticket_type_name,
            ticket_type_charge: reservation.ticket_type_charge,
            ticket_cancel_charge: reservation.ticket_cancel_charge,
            ticket_ttts_extension: reservation.ticket_ttts_extension,
            charge: this.getChargeBySeatCode(seatCode),
            payment_no: this.paymentNo,
            purchaser_group: this.purchaserGroup,

            performance: this.performance.id,
            performance_day: this.performance.day,
            performance_open_time: this.performance.open_time,
            performance_start_time: this.performance.start_time,
            performance_end_time: this.performance.end_time,
            performance_ttts_extension: this.performance.ttts_extension,
            theater: this.performance.theater.id,
            theater_name: this.performance.theater.name,
            theater_address: this.performance.theater.address,

            screen: this.performance.screen.id,
            screen_name: this.performance.screen.name,

            film: this.performance.film.id,
            film_name: this.performance.film.name,
            film_image: this.performance.film.image,
            film_is_mx4d: this.performance.film.is_mx4d,
            film_copyright: this.performance.film.copyright,

            purchaser_last_name: (this.purchaser !== undefined) ? this.purchaser.lastName : '',
            purchaser_first_name: (this.purchaser !== undefined) ? this.purchaser.firstName : '',
            purchaser_email: (this.purchaser !== undefined) ? this.purchaser.email : '',
            purchaser_tel: (this.purchaser !== undefined) ? this.purchaser.tel : '',
            purchaser_age: (this.purchaser !== undefined) ? this.purchaser.age : '',
            purchaser_address: (this.purchaser !== undefined) ? this.purchaser.address : '',
            purchaser_gender: (this.purchaser !== undefined) ? this.purchaser.gender : '',
            payment_method: (this.paymentMethod !== undefined) ? this.paymentMethod : '',

            watcher_name: (reservation.watcher_name !== undefined) ? reservation.watcher_name : '',
            watcher_name_updated_at: (reservation.watcher_name !== undefined) ? moment().valueOf() : '',

            purchased_at: this.purchasedAt
        };

        return new reservationRepo.reservationModel(doc);
    }
}
/**
 * パフォーマンス情報インターフェース
 */
type IPerformance = ttts.factory.performance.IPerformanceWithDetails & {
    film: {
        image: string;
    }
};

/**
 * チケット情報インターフェース
 */
type ITicketType = ttts.factory.performance.ITicketType & {
    count: number;  // 枚数
    watcher_name: string;
};

/**
 * 予約情報インターフェース
 */
type IReservation = ttts.factory.action.authorize.seatReservation.ITmpReservation;

/**
 * 購入者情報インターフェース
 */
interface IPurchaser {
    lastName: string;
    firstName: string;
    tel: string;
    email: string;
    age: string;
    address: string;
    gender: string;
}

interface ITransactionGMO {
    orderId: string;
    accessId: string;
    accessPass: string;
    amount: number;
    count: number;
    status: string;
}
