"use strict";
/**
 * パフォーマンスAPIコントローラー
 * @namespace controllers.api.performances
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ttts = require("@motionpicture/ttts-domain");
const conf = require("config");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const moment = require("moment");
const debug = createDebug('ttts-staff:controllers:api:performances');
/**
 * 運行・オンライン販売ステータス変更
 */
function updateOnlineStatus(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        try {
            // パフォーマンスIDリストをjson形式で受け取る
            const performanceIds = req.body.performanceIds;
            if (!Array.isArray(performanceIds)) {
                throw new Error(req.__('Message.UnexpectedError'));
            }
            // パフォーマンス・予約(入塔記録のないもの)のステータス更新
            const onlineStatus = req.body.onlineStatus;
            const evStatus = req.body.evStatus;
            const notice = req.body.notice;
            debug('updating performances...', performanceIds, onlineStatus, evStatus, notice);
            const now = new Date();
            // 返金対象予約情報取得(入塔記録のないもの)
            const targetPlaceOrderTransactions = yield getTargetReservationsForRefund(performanceIds);
            debug('email target placeOrderTransactions:', targetPlaceOrderTransactions);
            // 返金ステータスセット(運行停止は未指示、減速・再開はNONE)
            const refundStatus = evStatus === ttts.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED ?
                ttts.PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED :
                ttts.PerformanceUtil.REFUND_STATUS.NONE;
            // パフォーマンス更新
            const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
            yield performanceRepo.performanceModel.update({ _id: { $in: performanceIds } }, {
                'ttts_extension.online_sales_status': onlineStatus,
                'ttts_extension.online_sales_update_user': req.staffUser,
                'ttts_extension.online_sales_update_at': now,
                'ttts_extension.ev_service_status': evStatus,
                'ttts_extension.ev_service_update_user': req.staffUser,
                'ttts_extension.ev_service_update_at': now,
                'ttts_extension.refund_status': refundStatus,
                'ttts_extension.refund_update_user': req.staffUser,
                'ttts_extension.refund_update_at': now
            }, { multi: true }).exec();
            // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
            if (evStatus === ttts.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED) {
                // メール送信情報 [{'20171201_12345': [r1,r2,,,rn]}]
                yield createEmails(res, targetPlaceOrderTransactions, notice);
            }
            res.status(http_status_1.NO_CONTENT).end();
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                message: error.message
            });
        }
    });
}
exports.updateOnlineStatus = updateOnlineStatus;
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
 * 運行・オンライン販売停止メール作成
 * @param {Response} res
 * @param {ttts.factory.transaction.placeOrder.ITransaction[]} transactions
 * @param {any} notice
 * @return {Promise<void>}
 */
function createEmails(res, transactions, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        if (transactions.length === 0) {
            return;
        }
        // 購入単位ごとにメール作成
        yield Promise.all(transactions.map((transaction) => __awaiter(this, void 0, void 0, function* () {
            const result = transaction.result;
            yield createEmail(res, result.eventReservations, notice);
        })));
    });
}
/**
 * 運行・オンライン販売停止メール作成(1通)
 * @param {Response} res
 * @param {ttts.factory.reservation.event.IReservation[]} reservation
 * @param {string} notice
 * @return {Promise<void>}
 */
function createEmail(res, reservations, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservation = reservations[0];
        // タイトル編集
        // 東京タワー TOP DECK Ticket
        const title = res.__('Title');
        // 東京タワー TOP DECK エレベータ運行停止のお知らせ
        const titleEmail = res.__('Email.TitleSus');
        //トウキョウ タロウ 様
        const purchaserName = `${res.__('Mr{{name}}', { name: reservation.purchaser_name[res.locale] })}`;
        // 購入チケット情報
        const paymentTicketInfos = [];
        // 購入番号 : 850000001
        paymentTicketInfos.push(`${res.__('Label.PaymentNo')} : ${reservation.payment_no}`);
        // ご来塔日時 : 2017/12/10 09:15
        const day = moment(reservation.performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
        // tslint:disable-next-line:no-magic-numbers
        const time = `${reservation.performance_start_time.substr(0, 2)}:${reservation.performance_start_time.substr(2, 2)}`;
        paymentTicketInfos.push(`${res.__('Label.Day')} : ${day} ${time}`);
        // 券種 枚数
        paymentTicketInfos.push(`${res.__('Label.TicketType')} ${res.__('Label.TicketCount')}`);
        // TOP DECKチケット(大人) 1枚
        const leaf = res.__('Email.Leaf');
        const infos = getTicketInfo(reservations, leaf, res.locale);
        paymentTicketInfos.push(infos.join('\n'));
        // 本文セット
        const content = `${titleEmail}\n\n${purchaserName}\n\n${notice}\n\n${paymentTicketInfos.join('\n')}`;
        // メール編集
        const emailQueue = {
            from: {
                address: conf.get('email.from'),
                name: conf.get('email.fromname')
            },
            to: {
                address: reservation.purchaser_email
            },
            subject: `${title} ${titleEmail}`,
            content: {
                mimetype: 'text/plain',
                text: content
            },
            status: ttts.EmailQueueUtil.STATUS_UNSENT
        };
        // メール作成
        yield ttts.Models.EmailQueue.create(emailQueue);
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
