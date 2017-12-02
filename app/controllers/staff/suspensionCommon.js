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
const ttts_domain_1 = require("@motionpicture/ttts-domain");
/**
 * 返金対象予約情報取得
 *  [一般予約]かつ
 *  [予約データ]かつ
 *  [同一購入単位に入塔記録のない]予約のid配列
 *
 *  info: {
 *     reservationIds: [id1,id2,,,idn]
 *     targrtInfos: [{performance_day:'20171201', payment_no:'67890'}]
 *     arrivedInfos: [{performance_day:'20171201', payment_no:'12345'}]
 *     refundedInfo: [{'20171201_12345': [r1,r2,,,rn]}]
 * }
 *
 * @param {string} performanceIds
 * @return {any}
 */
function getTargetReservationsForRefund(performanceIds, refundStatus, allFields) {
    return __awaiter(this, void 0, void 0, function* () {
        let info = null;
        // 検索条件セット([指定パフォーマンス]かつ[一般予約]かつ[予約済])
        const conditions = {
            purchaser_group: ttts_domain_1.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
            status: { $in: [ttts_domain_1.ReservationUtil.STATUS_RESERVED,
                    ttts_domain_1.ReservationUtil.STATUS_ON_KEPT_FOR_SECURE_EXTRA] },
            performance: { $in: performanceIds }
        };
        // 返金ステータス条件セット
        if (refundStatus !== '') {
            conditions['performance_ttts_extension.refund_status'] = refundStatus;
        }
        // フィールドセット
        const fields = allFields ? '' : '_id performance_day payment_no checkins performance_ttts_extension';
        // パフォーマンスに紐づく予約情報取得
        const reservations = yield ttts_domain_1.Models.Reservation.find(conditions, fields).exec();
        // 入塔済、返金済の予約情報セット
        const arrivedInfos = [];
        const refundedInfo = {};
        reservations.map((reservation) => {
            // 入塔済情報 [{performance_day:'20171201', payment_no:'12345'}]
            if (reservation.checkins.length > 0) {
                arrivedInfos.push({ performance_day: reservation.performance_day,
                    payment_no: reservation.payment_no });
            }
            // 返金済情報 [{'20171201_12345': [r1,r2,,,rn]}]
            const key = `${reservation.performance_day}_${reservation.payment_no}`;
            // 返金済の時
            if (reservation.performance_ttts_extension.refund_status === ttts_domain_1.PerformanceUtil.REFUND_STATUS.COMPLETE) {
                if (refundedInfo.hasOwnProperty(key) === false) {
                    refundedInfo[key] = [];
                }
                refundedInfo[key].push(reservation._id.toString());
            }
        });
        // 入塔済判定
        const isArrived = (reservation) => {
            for (const arrivedInfo of arrivedInfos) {
                if (arrivedInfo.performance_day === reservation.performance_day &&
                    arrivedInfo.payment_no === reservation.payment_no) {
                    return true;
                }
            }
            return false;
        };
        // 更新対象の予約IDセット
        const ids = [];
        const targrtInfo = {};
        reservations.map((reservation) => {
            // 入塔記録がない時
            if (isArrived(reservation) === false) {
                ids.push(reservation._id);
                // メール送信情報 [{'20171201_12345': [r1,r2,,,rn]}]
                const key = `${reservation.performance_day}_${reservation.payment_no}`;
                if (targrtInfo.hasOwnProperty(key) === false) {
                    targrtInfo[key] = [];
                }
                targrtInfo[key].push(reservation);
            }
        });
        // 戻り値セット
        info = {};
        info.targrtIds = ids;
        info.targrtInfo = targrtInfo;
        info.arrivedInfos = arrivedInfos;
        info.refundedInfo = refundedInfo;
        return info;
    });
}
exports.getTargetReservationsForRefund = getTargetReservationsForRefund;
