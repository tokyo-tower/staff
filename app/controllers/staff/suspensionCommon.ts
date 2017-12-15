/**
 * 運行・オンライン販売停止コントローラ共通
 *
 * @namespace controller/staff/suspensionSetting
 */
import * as ttts from '@motionpicture/ttts-domain';
import * as numeral from 'numeral';

export type IPlaceOrderTransaction = ttts.factory.transaction.placeOrder.ITransaction;

/**
 * 返金対象予約情報取得
 *  [一般予約]かつ
 *  [予約データ]かつ
 *  [同一購入単位に入塔記録のない]予約のid配列
 * @param {string} performanceIds
 * @return {Promise<IPlaceOrderTransaction[]>}
 */
export async function getTargetReservationsForRefund(performanceIds: string[]): Promise<IPlaceOrderTransaction[]> {
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
    const transactionRepo = new ttts.repository.Transaction(ttts.mongoose.connection);

    // 返品されていない、かつ、入場履歴なし、の予約から、取引IDリストを取得
    const targetTransactionIds = await reservationRepo.reservationModel.distinct(
        'transaction',
        {
            status: ttts.factory.reservationStatusType.ReservationConfirmed,
            purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
            performance: { $in: performanceIds },
            checkins: { $size: 0 }
        }
    ).exec();

    return transactionRepo.transactionModel.find(
        {
            _id: { $in: targetTransactionIds }
        }
    ).exec().then((docs) => docs.map((doc) => <IPlaceOrderTransaction>doc.toObject()));
}

/**
 * 予約情報取得
 *
 * @param {ttts.repository.Reservation} reservationRepo
 * @param {string[]} performanceIds
 * @param {string} refundStatus
 * @param {boolean} allFields
 * @return {Promise<any>}
 */
// async function getReservations(reservationRepo: ttts.repository.Reservation,
//     performanceIds: string[],
//     refundStatus: string,
//     allFields: boolean): Promise<any> {

//     // 検索条件セット([指定パフォーマンス]かつ[一般予約]かつ[予約済])
//     const conditions: any = {
//         purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
//         status: {
//             $in: [
//                 ttts.factory.reservationStatusType.ReservationConfirmed,
//                 ttts.factory.reservationStatusType.ReservationSecuredExtra
//             ]
//         },
//         performance: { $in: performanceIds }
//     };
//     // 返金ステータス条件セット
//     if (refundStatus !== '') {
//         conditions['performance_ttts_extension.refund_status'] = refundStatus;
//     }
//     // フィールドセット
//     const fields: string = allFields ? '' : '_id performance_day payment_no checkins performance_ttts_extension';

//     // パフォーマンスに紐づく予約情報取得
//     return (<any[]>await reservationRepo.reservationModel.find(
//         conditions,
//         fields
//     ).exec());
// }

/**
 * メールキューインタフェース
 *
 * @interface IEmailQueue
 */
export interface IEmailQueue {
    // tslint:disable-next-line:no-reserved-keywords
    from: { // 送信者
        address: string;
        name: string;
    };
    to: { // 送信先
        address: string;
        name?: string;
    };
    subject: string;
    content: { // 本文
        mimetype: string;
        text: string;
    };
    status: string;
}

/**
 * チケット情報取得
 *
 */
export function getTicketInfo(reservations: any[], leaf: string, locale: string): string[] {
    // 券種ごとに合計枚数算出
    const keyName: string = 'ticket_type';
    const ticketInfos: {} = {};
    for (const reservation of reservations) {
        // チケットタイプセット
        const dataValue = reservation[keyName];
        // チケットタイプごとにチケット情報セット
        if (!ticketInfos.hasOwnProperty(dataValue)) {
            (<any>ticketInfos)[dataValue] = {
                ticket_type_name: reservation.ticket_type_name[locale],
                charge: `\\${numeral(reservation.charge).format('0,0')}`,
                count: 1
            };
        } else {
            (<any>ticketInfos)[dataValue].count += 1;
        }
    }
    // 券種ごとの表示情報編集
    const ticketInfoArray: string[] = [];
    Object.keys(ticketInfos).forEach((key) => {
        const ticketInfo = (<any>ticketInfos)[key];
        ticketInfoArray.push(`${ticketInfo.ticket_type_name} ${ticketInfo.count}${leaf}`);
    });

    return ticketInfoArray;
}
