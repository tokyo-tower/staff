import { ReservationUtil } from '@motionpicture/chevre-domain';
import { Util as GMOUtil } from '@motionpicture/gmo-service';
import * as conf from 'config';
import { Request } from 'express';
import * as moment from 'moment';

const MAX_RESERVATION_SEATS_DEFAULT = 4;
const MAX_RESERVATION_SEATS_STAFFS = 10;
const MAX_RESERVATION_SEATS_LIMITED_PERFORMANCES = 10;

interface ISeat {
    code: string; // 座席コード
    grade: {
        code: string;
        name: {
            ja: string;
            en: string;
        };
        additional_charge: number; // 追加料金
    };
}
interface ISection {
    seats: ISeat[];
}

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
    private static SESSION_KEY: string = 'chevre-reserve-session';

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
     * 予約座席コードリスト
     */
    public purchaser: IPurchaser;

    /**
     * 決済方法
     */
    public paymentMethod: string;
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
            case ReservationUtil.PURCHASER_GROUP_STAFF:
            case ReservationUtil.PURCHASER_GROUP_WINDOW:
                limit = MAX_RESERVATION_SEATS_STAFFS;
                break;

            case ReservationUtil.PURCHASER_GROUP_CUSTOMER:
                if (this.performance !== undefined) {
                    // 制限枚数指定のパフォーマンスの場合
                    const performanceIds4limit2 = conf.get<string[]>('performanceIds4limit2');
                    if (performanceIds4limit2.indexOf(this.performance._id) >= 0) {
                        limit = MAX_RESERVATION_SEATS_LIMITED_PERFORMANCES;
                    }
                }

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

    public getChargeExceptTicketTypeBySeatCode(seatCode: string): number {
        let charge = 0;

        if (this.purchaserGroup === ReservationUtil.PURCHASER_GROUP_CUSTOMER
            || this.purchaserGroup === ReservationUtil.PURCHASER_GROUP_WINDOW
        ) {
            const reservation = this.getReservation(seatCode);

            // 座席グレード分加算
            if (reservation.seat_grade_additional_charge > 0) {
                charge += reservation.seat_grade_additional_charge;
            }

            // MX4D分加算
            if (this.performance.film.is_mx4d) {
                charge += ReservationUtil.CHARGE_MX4D;
            }

            // コンビニ手数料加算
            if (this.paymentMethod === GMOUtil.PAY_TYPE_CVS) {
                charge += ReservationUtil.CHARGE_CVS;
            }
        }

        return charge;
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
     * フロー中の予約IDリストを取得する
     */
    public getReservationIds(): string[] {
        return (this.seatCodes !== undefined) ? this.seatCodes.map((seatCode) => this.getReservation(seatCode)._id) : [];
    }

    /**
     * 座席コードから予約(確定)ドキュメントを作成する
     *
     * @param {string} seatCode 座席コード
     */
    public seatCode2reservationDocument(seatCode: string) {
        const reservation = this.getReservation(seatCode);
        return {
            _id: reservation._id,
            status: reservation.status,
            seat_code: seatCode,
            seat_grade_name: reservation.seat_grade_name,
            seat_grade_additional_charge: reservation.seat_grade_additional_charge,
            ticket_type: reservation.ticket_type,
            ticket_type_name: reservation.ticket_type_name,
            ticket_type_charge: reservation.ticket_type_charge,
            charge: this.getChargeBySeatCode(seatCode),
            payment_no: this.paymentNo,
            purchaser_group: this.purchaserGroup,

            performance: this.performance._id,
            performance_day: this.performance.day,
            performance_open_time: this.performance.open_time,
            performance_start_time: this.performance.start_time,
            performance_end_time: this.performance.end_time,
            theater: this.performance.theater._id,
            theater_name: this.performance.theater.name,
            theater_address: this.performance.theater.address,

            screen: this.performance.screen._id,
            screen_name: this.performance.screen.name,

            film: this.performance.film._id,
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
    }
}

interface IPerformance {
    _id: string;
    day: string;
    open_time: string;
    start_time: string;
    end_time: string;
    start_str: {
        ja: string,
        en: string
    };
    location_str: {
        ja: string,
        en: string
    };
    theater: {
        _id: string,
        name: {
            ja: string,
            en: string
        },
        address: {
            ja: string,
            en: string
        }
    };
    screen: {
        _id: string,
        name: {
            ja: string,
            en: string
        },
        sections: ISection[]
    };
    film: {
        _id: string,
        name: {
            ja: string,
            en: string
        },
        image: string,
        is_mx4d: boolean,
        copyright: string
    };
}

interface ITicketType {
    _id: string;
    name: {
        ja: string,
        en: string
    };
    charge: number; // 料金
}

interface IReservation {
    _id: string;
    status: string;
    seat_code: string;
    seat_grade_name: {
        ja: string;
        en: string;
    };
    seat_grade_additional_charge: number;
    ticket_type: string;
    ticket_type_name: {
        ja: string;
        en: string;
    };
    ticket_type_charge: number;
    watcher_name: string;
}

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
