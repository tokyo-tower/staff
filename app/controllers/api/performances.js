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
const numeral = require("numeral");
const debug = createDebug('ttts-staff:controllers:api:performances');
/**
 * 運行・オンライン販売ステータス変更
 */
function updateOnlineStatus(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // パフォーマンスIDリストをjson形式で受け取る
            const performanceIds = req.body.performanceIds;
            if (!Array.isArray(performanceIds)) {
                throw new Error(req.__('UnexpectedError'));
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
            const refundStatus = evStatus === ttts.factory.performance.EvServiceStatus.Suspended ?
                ttts.factory.performance.RefundStatus.NotInstructed :
                ttts.factory.performance.RefundStatus.None;
            // パフォーマンス更新
            debug('updating performance online_sales_status...');
            const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
            const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
            // 指定のパフォーマンスに対する予約検索
            const reservations = yield reservationRepo.reservationModel.find({ performance: { $in: performanceIds } }).exec().then((docs) => docs.map((doc) => doc.toObject()));
            const updateUser = req.staffUser.username;
            yield Promise.all(performanceIds.map((performanceId) => __awaiter(this, void 0, void 0, function* () {
                // パフォーマンスに対する予約検索
                const reservations4performance = reservations.filter((r) => r.performance === performanceId);
                const reservationsAtLastUpdateDate = reservations4performance.map((r) => {
                    return {
                        id: r.id,
                        status: r.status,
                        purchaser_group: r.purchaser_group,
                        transaction_agent: r.transaction_agent,
                        payment_method: r.payment_method,
                        order_number: r.order_number
                    };
                });
                yield performanceRepo.performanceModel.findByIdAndUpdate(performanceId, {
                    'ttts_extension.reservationsAtLastUpdateDate': reservationsAtLastUpdateDate,
                    'ttts_extension.online_sales_status': onlineStatus,
                    'ttts_extension.online_sales_update_user': updateUser,
                    'ttts_extension.online_sales_update_at': now,
                    'ttts_extension.ev_service_status': evStatus,
                    'ttts_extension.ev_service_update_user': updateUser,
                    'ttts_extension.ev_service_update_at': now,
                    'ttts_extension.refund_status': refundStatus,
                    'ttts_extension.refund_update_user': updateUser,
                    'ttts_extension.refund_update_at': now
                }).exec();
            })));
            debug('performance online_sales_status updated.');
            // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
            if (evStatus === ttts.factory.performance.EvServiceStatus.Suspended) {
                try {
                    yield createEmails(res, targetPlaceOrderTransactions, notice);
                }
                catch (error) {
                    // no op
                    debug('createEmails failed', error);
                }
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
            purchaser_group: ttts.factory.person.Group.Customer,
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
 * @param {string} notice
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
            const confirmedReservations = result.eventReservations
                .filter((r) => r.status === ttts.factory.reservationStatusType.ReservationConfirmed);
            yield createEmail(res, confirmedReservations, notice);
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
// tslint:disable-next-line:max-func-body-length
function createEmail(res, reservations, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservation = reservations[0];
        // タイトル編集
        // 東京タワー TOP DECK Ticket
        // 東京タワー TOP DECK エレベータ運行停止のお知らせ
        const title = conf.get('emailSus.title');
        const titleEn = conf.get('emailSus.titleEn');
        //トウキョウ タロウ 様
        const purchaserNameJp = `${reservation.purchaser_last_name} ${reservation.purchaser_first_name}`;
        const purchaserName = `${res.__('{{name}}様', { name: purchaserNameJp })}`;
        const purchaserNameEn = `${res.__('Mr./Ms.{{name}}', { name: reservation.purchaser_name })}`;
        // 購入チケット情報
        const paymentTicketInfos = [];
        // ご来塔日時 : 2017/12/10 09:15
        const day = moment(reservation.performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
        // tslint:disable-next-line:no-magic-numbers
        const time = `${reservation.performance_start_time.substr(0, 2)}:${reservation.performance_start_time.substr(2, 2)}`;
        // 購入番号 : 850000001
        paymentTicketInfos.push(`${res.__('PaymentNo')} : ${reservation.payment_no}`);
        paymentTicketInfos.push(`${res.__('EmailReserveDate')} : ${day} ${time}`);
        paymentTicketInfos.push(`${res.__('TicketType')} ${res.__('TicketCount')}`); // 券種 枚数
        const infos = getTicketInfo(reservations, res.__, res.locale); // TOP DECKチケット(大人) 1枚
        paymentTicketInfos.push(infos.join('\n'));
        // 英語表記を追加
        paymentTicketInfos.push(''); // 日英の間の改行
        paymentTicketInfos.push(`${res.__({ phrase: 'PaymentNo', locale: 'en' })} : ${reservation.payment_no}`);
        paymentTicketInfos.push(`${res.__({ phrase: 'EmailReserveDate', locale: 'en' })} : ${day} ${time}`);
        paymentTicketInfos.push(`${res.__({ phrase: 'TicketType', locale: 'en' })} ${res.__({ phrase: 'TicketCount', locale: 'en' })}`);
        // TOP DECKチケット(大人) 1枚
        const infosEn = getTicketInfo(reservations, res.__, 'en');
        paymentTicketInfos.push(infosEn.join('\n'));
        // foot
        const foot1 = conf.get('emailSus.EmailFoot1');
        const footEn1 = conf.get('emailSus.EmailFootEn1');
        const foot2 = conf.get('emailSus.EmailFoot2');
        const footEn2 = conf.get('emailSus.EmailFootEn2');
        const foot3 = conf.get('emailSus.EmailFoot3');
        const footEn3 = conf.get('emailSus.EmailFootEn3');
        const access1 = conf.get('emailSus.EmailAccess1');
        const accessEn1 = conf.get('emailSus.EmailAccessEn1');
        const access2 = conf.get('emailSus.EmailAccess2');
        const accessEn2 = conf.get('emailSus.EmailAccessEn2');
        // 本文セット
        // tslint:disable-next-line:max-line-length
        const content = `${title}\n${titleEn}\n\n${purchaserName}\n${purchaserNameEn}\n\n${notice}\n\n${paymentTicketInfos.join('\n')}\n\n\n${foot1}\n${foot2}\n${foot3}\n\n${footEn1}\n${footEn2}\n${footEn3}\n\n${access1}\n${access2}\n\n${accessEn1}\n${accessEn2}`;
        // メール編集
        const emailAttributes = {
            sender: {
                name: conf.get('email.fromname'),
                email: conf.get('email.from')
            },
            toRecipient: {
                // tslint:disable-next-line:max-line-length
                name: reservation.purchaser_name,
                email: reservation.purchaser_email
            },
            about: `${title} ${titleEn}`,
            text: content
        };
        // メール作成
        const taskRepo = new ttts.repository.Task(ttts.mongoose.connection);
        const emailMessage = ttts.factory.creativeWork.message.email.create({
            identifier: `updateOnlineStatus-${reservation.id}`,
            sender: {
                typeOf: 'Corporation',
                name: emailAttributes.sender.name,
                email: emailAttributes.sender.email
            },
            toRecipient: {
                typeOf: ttts.factory.personType.Person,
                name: emailAttributes.toRecipient.name,
                email: emailAttributes.toRecipient.email
            },
            about: emailAttributes.about,
            text: emailAttributes.text
        });
        // その場で送信ではなく、DBにタスクを登録
        const taskAttributes = ttts.factory.task.sendEmailNotification.createAttributes({
            status: ttts.factory.taskStatus.Ready,
            runsAt: new Date(),
            remainingNumberOfTries: 10,
            lastTriedAt: null,
            numberOfTried: 0,
            executionResults: [],
            data: {
                emailMessage: emailMessage
            }
        });
        yield taskRepo.save(taskAttributes);
        debug('sendEmail task created.');
    });
}
/**
 * チケット情報取得
 *
 */
function getTicketInfo(reservations, __, locale) {
    // 券種ごとに合計枚数算出
    const ticketInfos = {};
    for (const reservation of reservations) {
        // チケットタイプごとにチケット情報セット
        if (ticketInfos[reservation.ticket_type] === undefined) {
            ticketInfos[reservation.ticket_type] = {
                ticket_type_name: reservation.ticket_type_name[locale],
                charge: `\\${numeral(reservation.charge).format('0,0')}`,
                count: 1
            };
        }
        else {
            ticketInfos[reservation.ticket_type].count += 1;
        }
    }
    // 券種ごとの表示情報編集
    return Object.keys(ticketInfos).map((ticketTypeId) => {
        return `${ticketInfos[ticketTypeId].ticket_type_name} ${__('{{n}}Leaf', { n: ticketInfos[ticketTypeId].count })}`;
    });
}
exports.getTicketInfo = getTicketInfo;
