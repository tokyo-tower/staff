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
 *
 *  info: {
 *     targrtIds:    [id1,id2,,,idn]
 *     cancelledIds: [id1,id2,,,idn]
 *     targrtInfo:   {performance_day:'20171201', payment_no:'67890'}
 *     arrivedInfos: [{performance_day:'20171201', payment_no:'12345'}]
 *     refundedInfo: {'20171201_12345': [r1,r2,,,rn]}
 *     cancelledInfo:{'20171201_12345': [r1,r2,,,rn]}
 * }
 *
 * @param {string} performanceIds
 * @return {any}
 */
function getTargetReservationsForRefund(performanceIds, refundStatus, allFields) {
    return __awaiter(this, void 0, void 0, function* () {
        // パフォーマンスに紐づく予約情報取得
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const reservations = yield getReservations(reservationRepo, performanceIds, refundStatus, allFields);
        // パフォーマンスに紐づくキャンセル情報取得
        const reservationsCancel = yield getReservationsCancel(reservationRepo, performanceIds);
        // 入塔済、返金済の予約情報セット
        const arrivedInfos = [];
        const refundedInfo = {};
        reservations.map((reservation) => {
            // 入塔済情報 [{performance_day:'20171201', payment_no:'12345'}]
            if (reservation.checkins.length > 0) {
                arrivedInfos.push({
                    performance_day: reservation.performance_day,
                    payment_no: reservation.payment_no
                });
            }
            // 返金済情報 [{'20171201_12345': [r1,r2,,,rn]}]
            const key = `${reservation.performance_day}_${reservation.payment_no}`;
            // 返金済の時
            if (reservation.performance_ttts_extension.refund_status === ttts.PerformanceUtil.REFUND_STATUS.COMPLETE) {
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
        // キャンセル情報セット
        const cancelledInfo = {};
        reservationsCancel.map((reservation) => {
            // キャンセル情報 [{'20171201_12345': [r1,r2,,,rn]}]
            const key = `${reservation.performance_day}_${reservation.payment_no}`;
            if (cancelledInfo.hasOwnProperty(key) === false) {
                cancelledInfo[key] = [];
            }
            cancelledInfo[key].push(reservation._id.toString());
        });
        // 更新対象の予約IDセット
        const targrtIds = [];
        const cancelledIds = [];
        const targrtInfo = {};
        reservations.map((reservation) => {
            // 入塔記録がない時
            if (isArrived(reservation) === false) {
                const key = `${reservation.performance_day}_${reservation.payment_no}`;
                // キャンセルがある購入の時
                if (cancelledInfo.hasOwnProperty(key)) {
                    cancelledIds.push(reservation._id);
                }
                else {
                    targrtIds.push(reservation._id);
                    // メール送信情報 {'20171201_12345': [r1,r2,,,rn]}
                    if (targrtInfo.hasOwnProperty(key) === false) {
                        targrtInfo[key] = [];
                    }
                    targrtInfo[key].push(reservation);
                }
            }
        });
        // 戻り値セット
        return ({
            targrtIds: targrtIds,
            cancelledIds: cancelledIds,
            targrtInfo: targrtInfo,
            arrivedInfos: arrivedInfos,
            refundedInfo: refundedInfo,
            cancelledInfo: cancelledInfo
        });
    });
}
exports.getTargetReservationsForRefund = getTargetReservationsForRefund;
/**
 * 予約情報取得
 *
 * @param {ttts.repository.Reservation} reservationRepo
 * @param {string[]} performanceIds
 * @param {string} refundStatus
 * @param {boolean} allFields
 * @return {Promise<any>}
 */
function getReservations(reservationRepo, performanceIds, refundStatus, allFields) {
    return __awaiter(this, void 0, void 0, function* () {
        // 検索条件セット([指定パフォーマンス]かつ[一般予約]かつ[予約済])
        const conditions = {
            purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
            status: {
                $in: [
                    ttts.factory.reservationStatusType.ReservationConfirmed,
                    ttts.factory.reservationStatusType.ReservationSecuredExtra
                ]
            },
            performance: { $in: performanceIds }
        };
        // 返金ステータス条件セット
        if (refundStatus !== '') {
            conditions['performance_ttts_extension.refund_status'] = refundStatus;
        }
        // フィールドセット
        const fields = allFields ? '' : '_id performance_day payment_no checkins performance_ttts_extension';
        // パフォーマンスに紐づく予約情報取得
        return yield reservationRepo.reservationModel.find(conditions, fields).exec();
    });
}
/**
 * キャンセル情報取得
 *
 * @param {ttts.repository.Reservation} reservationRepo
 * @param {string[]} performanceIds
 * @return {Promise<any>}
 */
function getReservationsCancel(reservationRepo, performanceIds) {
    return __awaiter(this, void 0, void 0, function* () {
        // パフォーマンスに紐づくキャンセル情報取得
        return yield reservationRepo.reservationModel.find({
            purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
            status: ttts.factory.reservationStatusType.ReservationCancelled,
            performance: { $in: performanceIds }
        }, '_id performance_day payment_no').exec();
    });
}
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
