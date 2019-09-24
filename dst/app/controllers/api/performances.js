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
 * パフォーマンスAPIコントローラー
 */
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const conf = require("config");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const numeral = require("numeral");
const debug = createDebug('ttts-staff:controllers');
const STAFF_CLIENT_ID = process.env.API_CLIENT_ID;
const POS_CLIENT_ID = process.env.POS_CLIENT_ID;
const FRONTEND_CLIENT_ID = process.env.FRONTEND_CLIENT_ID;
/**
 * 運行・オンライン販売ステータス変更
 */
// tslint:disable-next-line:max-func-body-length
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
            const targetPlaceOrderTransactions = yield getTargetReservationsForRefund(req, performanceIds);
            debug('email target placeOrderTransactions:', targetPlaceOrderTransactions);
            // 返金ステータスセット(運行停止は未指示、減速・再開はNONE)
            const refundStatus = evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended ?
                tttsapi.factory.performance.RefundStatus.NotInstructed :
                tttsapi.factory.performance.RefundStatus.None;
            // パフォーマンス更新
            debug('updating performance online_sales_status...');
            const eventService = new tttsapi.service.Event({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const reservationService = new tttsapi.service.Reservation({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const updateUser = req.staffUser.username;
            yield Promise.all(performanceIds.map((performanceId) => __awaiter(this, void 0, void 0, function* () {
                // パフォーマンスに対する予約検索(1パフォーマンスに対する予約はmax41件なので、これで十分)
                const searchReservationsResult = yield reservationService.search({
                    limit: 100,
                    typeOf: tttsapi.factory.reservationType.EventReservation,
                    reservationStatuses: [tttsapi.factory.reservationStatusType.ReservationConfirmed],
                    reservationFor: { id: performanceId }
                });
                const reservations4performance = searchReservationsResult.data;
                const reservationsAtLastUpdateDate = reservations4performance.map((r) => {
                    let clientId = '';
                    let purchaserGroup = tttsapi.factory.person.Group.Customer;
                    let paymentMethod = '';
                    let orderNumber = '';
                    if (r.underName !== undefined && r.underName.identifier !== undefined) {
                        const paymentMethodProperty = r.underName.identifier.find((p) => p.name === 'paymentMethod');
                        if (paymentMethodProperty !== undefined) {
                            paymentMethod = paymentMethodProperty.value;
                        }
                        const orderNumberProperty = r.underName.identifier.find((p) => p.name === 'orderNumber');
                        if (orderNumberProperty !== undefined) {
                            orderNumber = orderNumberProperty.value;
                        }
                        const clientIdProperty = r.underName.identifier.find((p) => p.name === 'clientId');
                        if (clientIdProperty !== undefined) {
                            clientId = clientIdProperty.value;
                        }
                        // クライアントIDがstaffであればStaffグループ(その他はCustomer)
                        if (clientId === STAFF_CLIENT_ID) {
                            purchaserGroup = tttsapi.factory.person.Group.Staff;
                        }
                    }
                    return {
                        id: r.id,
                        status: r.reservationStatus,
                        purchaser_group: purchaserGroup,
                        transaction_agent: {
                            typeOf: tttsapi.factory.personType.Person,
                            id: clientId
                        },
                        payment_method: paymentMethod,
                        order_number: orderNumber
                    };
                });
                yield eventService.updateExtension({
                    id: performanceId,
                    reservationsAtLastUpdateDate: reservationsAtLastUpdateDate,
                    onlineSalesStatus: onlineStatus,
                    onlineSalesStatusUpdateUser: updateUser,
                    onlineSalesStatusUpdateAt: now,
                    evServiceStatus: evStatus,
                    evServiceStatusUpdateUser: updateUser,
                    evServiceStatusUpdateAt: now,
                    refundStatus: refundStatus,
                    refundStatusUpdateUser: updateUser,
                    refundStatusUpdateAt: now
                });
            })));
            debug('performance online_sales_status updated.');
            // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
            if (evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended) {
                try {
                    yield createEmails(req, res, targetPlaceOrderTransactions, notice);
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
 */
function getTargetReservationsForRefund(req, performanceIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const placeOrderService = new tttsapi.service.transaction.PlaceOrder({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        // 返品されていない、かつ、入場履歴なし、の予約から、取引IDリストを取得
        const reservationService = new tttsapi.service.Reservation({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const targetTransactionIds = yield reservationService.distinct('transaction', {
            typeOf: tttsapi.factory.reservationType.EventReservation,
            reservationStatuses: [tttsapi.factory.reservationStatusType.ReservationConfirmed],
            // クライアントがfrontend or pos
            underName: {
                identifiers: [
                    { name: 'clientId', value: POS_CLIENT_ID },
                    { name: 'clientId', value: FRONTEND_CLIENT_ID }
                ]
            },
            // purchaser_group: tttsapi.factory.person.Group.Customer,
            reservationFor: {
                ids: performanceIds
            },
            checkins: { $size: 0 }
        });
        // 全取引検索
        const transactions = [];
        if (targetTransactionIds.length > 0) {
            const limit = 100;
            let page = 0;
            let numData = limit;
            while (numData === limit) {
                page += 1;
                const searchTransactionsResult = yield placeOrderService.search({
                    limit: limit,
                    page: page,
                    typeOf: tttsapi.factory.transactionType.PlaceOrder,
                    ids: targetTransactionIds
                });
                numData = searchTransactionsResult.data.length;
                debug('numData:', numData);
                transactions.push(...searchTransactionsResult.data);
            }
        }
        return transactions;
    });
}
exports.getTargetReservationsForRefund = getTargetReservationsForRefund;
/**
 * 運行・オンライン販売停止メール作成
 * @param {Response} res
 * @param {tttsapi.factory.transaction.placeOrder.ITransaction[]} transactions
 * @param {string} notice
 * @return {Promise<void>}
 */
function createEmails(req, res, transactions, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        if (transactions.length === 0) {
            return;
        }
        // 購入単位ごとにメール作成
        yield Promise.all(transactions.map((transaction) => __awaiter(this, void 0, void 0, function* () {
            const result = transaction.result;
            const reservations = result.order.acceptedOffers.map((o) => o.itemOffered);
            const confirmedReservations = reservations
                .filter((r) => {
                let extraProperty;
                if (r.additionalProperty !== undefined) {
                    extraProperty = r.additionalProperty.find((p) => p.name === 'extra');
                }
                return r.additionalProperty === undefined
                    || extraProperty === undefined
                    || extraProperty.value !== '1';
            });
            yield createEmail(req, res, result.order, confirmedReservations, notice);
        })));
    });
}
/**
 * 運行・オンライン販売停止メール作成(1通)
 * @param {Response} res
 * @param {tttsapi.factory.reservation.event.IReservation[]} reservation
 * @param {string} notice
 * @return {Promise<void>}
 */
// tslint:disable-next-line:max-func-body-length
function createEmail(req, res, order, reservations, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservation = reservations[0];
        // タイトル編集
        // 東京タワー TOP DECK Ticket
        // 東京タワー TOP DECK エレベータ運行停止のお知らせ
        const title = conf.get('emailSus.title');
        const titleEn = conf.get('emailSus.titleEn');
        //トウキョウ タロウ 様
        const purchaserNameJp = `${order.customer.familyName} ${order.customer.givenName}`;
        const purchaserName = `${res.__('{{name}}様', { name: purchaserNameJp })}`;
        const purchaserNameEn = `${res.__('Mr./Ms.{{name}}', { name: order.customer.name })}`;
        // 購入チケット情報
        const paymentTicketInfos = [];
        // ご来塔日時 : 2017/12/10 09:15
        const event = reservation.reservationFor;
        const day = moment(event.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD');
        const time = moment(event.startDate).tz('Asia/Tokyo').format('HH:mm');
        // 購入番号
        // tslint:disable-next-line:no-magic-numbers
        const paymentNo = order.confirmationNumber.slice(-6);
        paymentTicketInfos.push(`${res.__('PaymentNo')} : ${paymentNo}`);
        paymentTicketInfos.push(`${res.__('EmailReserveDate')} : ${day} ${time}`);
        paymentTicketInfos.push(`${res.__('TicketType')} ${res.__('TicketCount')}`); // 券種 枚数
        const infos = getTicketInfo(reservations, res.__, res.locale); // TOP DECKチケット(大人) 1枚
        paymentTicketInfos.push(infos.join('\n'));
        // 英語表記を追加
        paymentTicketInfos.push(''); // 日英の間の改行
        paymentTicketInfos.push(`${res.__({ phrase: 'PaymentNo', locale: 'en' })} : ${paymentNo}`);
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
                name: order.customer.name,
                email: order.customer.email
            },
            about: `${title} ${titleEn}`,
            text: content
        };
        // メール作成
        const taskService = new tttsapi.service.Task({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const emailMessage = tttsapi.factory.creativeWork.message.email.create({
            identifier: `updateOnlineStatus-${reservation.id}`,
            sender: {
                typeOf: 'Corporation',
                name: emailAttributes.sender.name,
                email: emailAttributes.sender.email
            },
            toRecipient: {
                typeOf: tttsapi.factory.personType.Person,
                name: emailAttributes.toRecipient.name,
                email: emailAttributes.toRecipient.email
            },
            about: emailAttributes.about,
            text: emailAttributes.text
        });
        // その場で送信ではなく、DBにタスクを登録
        const taskAttributes = tttsapi.factory.task.sendEmailNotification.createAttributes({
            status: tttsapi.factory.taskStatus.Ready,
            runsAt: new Date(),
            remainingNumberOfTries: 10,
            lastTriedAt: null,
            numberOfTried: 0,
            executionResults: [],
            data: {
                emailMessage: emailMessage
            }
        });
        yield taskService.create(taskAttributes);
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
        const ticketType = reservation.reservedTicket.ticketType;
        let price = 0;
        if (reservation.reservedTicket !== undefined && reservation.reservedTicket.ticketType.priceSpecification !== undefined) {
            price = reservation.reservedTicket.ticketType.priceSpecification.price;
        }
        if (ticketInfos[ticketType.identifier] === undefined) {
            ticketInfos[ticketType.identifier] = {
                ticket_type_name: ticketType.name[locale],
                charge: `\\${numeral(price).format('0,0')}`,
                count: 1
            };
        }
        else {
            ticketInfos[ticketType.identifier].count += 1;
        }
    }
    // 券種ごとの表示情報編集
    return Object.keys(ticketInfos).map((ticketTypeId) => {
        return `${ticketInfos[ticketTypeId].ticket_type_name} ${__('{{n}}Leaf', { n: ticketInfos[ticketTypeId].count })}`;
    });
}
exports.getTicketInfo = getTicketInfo;
