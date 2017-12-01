/**
 * 運行・オンライン販売停止コントローラ共通
 *
 * @namespace controller/staff/suspensionSetting
 */
import { Models, PerformanceUtil, ReservationUtil } from '@motionpicture/ttts-domain';

/**
 * 返金対象予約情報取得
 *  [一般予約]かつ
 *  [予約データ]かつ
 *  [同一購入単位に入塔記録のない]予約のid配列
 *
 *  info: {
 *     reservationIds: [id1,id2,,,idn]
 *     arrivedInfos: [{performance_day:'20171201', payment_no:'12345'}]
 *     refundedInfo: [{'20171201_12345': [r1,r2,,,rn]}]
 * }
 *
 * @param {string} performanceIds
 * @return {any}
 */
export async function getTargetReservationsForRefund(performanceIds: string[],
                                                     refundStatus: string): Promise<any> {
    let info: any = null;
    // 検索条件セット([指定パフォーマンス]かつ[一般予約]かつ[予約済])
    const conditions: any = {
        purchaser_group: ReservationUtil.PURCHASER_GROUP_CUSTOMER,
        status: { $in: [ReservationUtil.STATUS_RESERVED,
                        ReservationUtil.STATUS_ON_KEPT_FOR_SECURE_EXTRA]},
        performance: { $in: performanceIds }
    };
    // 返金ステータス条件セット
    if (refundStatus !== '') {
        conditions['performance_ttts_extension.refund_status'] = refundStatus;
    }
    // パフォーマンスに紐づく予約情報取得
    const reservations = <any[]>await Models.Reservation.find(
        conditions,
        '_id performance_day payment_no checkins performance_ttts_extension'
    ).exec();

    // 入塔済、返金済の予約情報セット
    const arrivedInfos: any[] = [];
    const refundedInfo: any = {};
    reservations.map((reservation: any) => {
        // 入塔済情報 [{performance_day:'20171201', payment_no:'12345'}]
        if (reservation.checkins.length > 0) {
            arrivedInfos.push({ performance_day: reservation.performance_day,
                                payment_no: reservation.payment_no});
        }
        // 返金済情報 [{'20171201_12345': [r1,r2,,,rn]}]
        const key : string = `${reservation.performance_day}_${reservation.payment_no}`;
        // 返金済の時
        if (reservation.performance_ttts_extension.refund_status === PerformanceUtil.REFUND_STATUS.COMPLETE) {
            if (refundedInfo.hasOwnProperty(key) === false) {
                refundedInfo[key] = [];
            }
            refundedInfo[key].push(reservation._id.toString());
        }
    });

    // 入塔済判定
    const isArrived = (reservation: any): boolean => {
        for (const arrivedInfo of arrivedInfos) {
            if (arrivedInfo.performance_day === reservation.performance_day &&
                arrivedInfo.payment_no === reservation.payment_no) {
                    return true;
            }
        }
        return false;
    };

    // 更新対象の予約IDセット
    const ids: any = [];
    reservations.map((reservation: any) => {
        if (isArrived(reservation) === false) {
            ids.push(reservation._id);
        }
    });

    // 戻り値セット
    info = {};
    info.reservationIds = ids;
    info.arrivedInfos = arrivedInfos;
    info.refundedInfo = refundedInfo;

    return info;
}
