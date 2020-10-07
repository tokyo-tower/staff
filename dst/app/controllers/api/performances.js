"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOnlineStatus = exports.search = void 0;
/**
 * パフォーマンスAPIコントローラー
 */
const cinerinoapi = require("@cinerino/sdk");
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const conf = require("config");
const createDebug = require("debug");
const Email = require("email-templates");
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const numeral = require("numeral");
const debug = createDebug('ttts-staff:controllers');
const POS_CLIENT_IDS = (typeof process.env.POS_CLIENT_ID === 'string')
    ? process.env.POS_CLIENT_ID.split(',')
    : [];
const FRONTEND_CLIENT_IDS = (typeof process.env.FRONTEND_CLIENT_ID === 'string')
    ? process.env.FRONTEND_CLIENT_ID.split(',')
    : [];
function getUnitPriceByAcceptedOffer(offer) {
    let unitPrice = 0;
    if (offer.priceSpecification !== undefined) {
        const priceSpecification = offer.priceSpecification;
        if (Array.isArray(priceSpecification.priceComponent)) {
            const unitPriceSpec = priceSpecification.priceComponent.find((c) => c.typeOf === cinerinoapi.factory.chevre.priceSpecificationType.UnitPriceSpecification);
            if (unitPriceSpec !== undefined && unitPriceSpec.price !== undefined && Number.isInteger(unitPriceSpec.price)) {
                unitPrice = unitPriceSpec.price;
            }
        }
    }
    return unitPrice;
}
/**
 * パフォーマンス検索
 */
function search(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const performanceService = new tttsapi.service.Event({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const searchResult = yield performanceService.search(req.query);
            const performances = searchResult.data.data.map((d) => {
                let evServiceStatus = tttsapi.factory.performance.EvServiceStatus.Normal;
                let onlineSalesStatus = tttsapi.factory.performance.OnlineSalesStatus.Normal;
                switch (d.eventStatus) {
                    case cinerinoapi.factory.chevre.eventStatusType.EventCancelled:
                        evServiceStatus = tttsapi.factory.performance.EvServiceStatus.Suspended;
                        onlineSalesStatus = tttsapi.factory.performance.OnlineSalesStatus.Suspended;
                        break;
                    case cinerinoapi.factory.chevre.eventStatusType.EventPostponed:
                        evServiceStatus = tttsapi.factory.performance.EvServiceStatus.Slowdown;
                        onlineSalesStatus = tttsapi.factory.performance.OnlineSalesStatus.Suspended;
                        break;
                    case cinerinoapi.factory.chevre.eventStatusType.EventScheduled:
                        break;
                    default:
                }
                return Object.assign(Object.assign({}, d), { evServiceStatus: evServiceStatus, onlineSalesStatus: onlineSalesStatus });
            });
            res.json({ data: performances });
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR)
                .json({
                message: error.message
            });
        }
    });
}
exports.search = search;
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
            // 返金対象注文情報取得
            const targetOrders = yield getTargetReservationsForRefund(req, performanceIds);
            // 返金ステータスセット(運行停止は未指示、減速・再開はNONE)
            const refundStatus = evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended ?
                tttsapi.factory.performance.RefundStatus.NotInstructed :
                tttsapi.factory.performance.RefundStatus.None;
            // パフォーマンス更新
            debug('updating performance online_sales_status...');
            const performanceService = new tttsapi.service.Event({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const reservationService = new cinerinoapi.service.Reservation({
                endpoint: process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const eventService = new cinerinoapi.service.Event({
                endpoint: process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const updateUser = req.staffUser.username;
            for (const performanceId of performanceIds) {
                // Chevreで予約検索(1パフォーマンスに対する予約はmax41件なので、これで十分)
                const searchReservationsResult = yield reservationService.search({
                    limit: 100,
                    typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
                    reservationStatuses: [cinerinoapi.factory.chevre.reservationStatusType.ReservationConfirmed],
                    reservationFor: { id: performanceId }
                    // ...{
                    //     noTotalCount: '1'
                    // }
                });
                const reservationsAtLastUpdateDate = searchReservationsResult.data.map((r) => {
                    var _a, _b, _c;
                    const clientId = (_c = (_b = (_a = r.underName) === null || _a === void 0 ? void 0 : _a.identifier) === null || _b === void 0 ? void 0 : _b.find((p) => p.name === 'clientId')) === null || _c === void 0 ? void 0 : _c.value;
                    return {
                        id: String(r.id),
                        status: r.reservationStatus,
                        transaction_agent: {
                            typeOf: cinerinoapi.factory.personType.Person,
                            id: (typeof clientId === 'string') ? clientId : ''
                        }
                    };
                });
                let newEventStatus = cinerinoapi.factory.chevre.eventStatusType.EventScheduled;
                switch (evStatus) {
                    case tttsapi.factory.performance.EvServiceStatus.Slowdown:
                        newEventStatus = cinerinoapi.factory.chevre.eventStatusType.EventPostponed;
                        break;
                    case tttsapi.factory.performance.EvServiceStatus.Suspended:
                        newEventStatus = cinerinoapi.factory.chevre.eventStatusType.EventCancelled;
                        break;
                    default:
                }
                yield performanceService.updateExtension({
                    id: performanceId,
                    reservationsAtLastUpdateDate: reservationsAtLastUpdateDate,
                    eventStatus: newEventStatus,
                    onlineSalesStatusUpdateUser: updateUser,
                    onlineSalesStatusUpdateAt: now,
                    evServiceStatusUpdateUser: updateUser,
                    evServiceStatusUpdateAt: now,
                    refundStatus: refundStatus,
                    refundStatusUpdateUser: updateUser,
                    refundStatusUpdateAt: now
                });
                let sendEmailMessageParams = [];
                // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、Cinerinoにメール送信指定
                if (evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended) {
                    const targetOrders4performance = targetOrders.filter((o) => {
                        return o.acceptedOffers.some((offer) => {
                            const reservation = offer.itemOffered;
                            return reservation.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation
                                && reservation.reservationFor.id === performanceId;
                        });
                    });
                    sendEmailMessageParams = yield createEmails(res, targetOrders4performance, notice);
                }
                // Chevreイベントステータスに反映
                yield eventService.updatePartially(Object.assign({ id: performanceId, eventStatus: newEventStatus }, {
                    onUpdated: {
                        sendEmailMessage: sendEmailMessageParams
                    }
                }));
            }
            res.status(http_status_1.NO_CONTENT)
                .end();
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR)
                .json({
                message: error.message
            });
        }
    });
}
exports.updateOnlineStatus = updateOnlineStatus;
/**
 * 返金対象予約情報取得
 * [一般予約]かつ
 * [予約データ]かつ
 * [同一購入単位に入塔記録のない]予約のid配列
 */
function getTargetReservationsForRefund(req, performanceIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const orderService = new cinerinoapi.service.Order({
            endpoint: process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const reservationService = new tttsapi.service.Reservation({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const targetReservations = yield reservationService.distinct('underName', {
            typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
            reservationStatuses: [cinerinoapi.factory.chevre.reservationStatusType.ReservationConfirmed],
            // クライアントがfrontend or pos
            underName: {
                identifiers: [
                    ...POS_CLIENT_IDS.map((clientId) => {
                        return { name: 'clientId', value: clientId };
                    }),
                    ...FRONTEND_CLIENT_IDS.map((clientId) => {
                        return { name: 'clientId', value: clientId };
                    })
                ]
            },
            reservationFor: {
                ids: performanceIds
            },
            checkins: { $size: 0 }
        });
        const targetOrderNumbers = targetReservations.reduce((a, b) => {
            if (Array.isArray(b.identifier)) {
                const orderNumberProperty = b.identifier.find((p) => p.name === 'orderNumber');
                if (orderNumberProperty !== undefined) {
                    a.push(orderNumberProperty.value);
                }
            }
            return a;
        }, []);
        // 全注文検索
        const orders = [];
        if (targetOrderNumbers.length > 0) {
            const limit = 10;
            let page = 0;
            let numData = limit;
            while (numData === limit) {
                page += 1;
                const searchOrdersResult = yield orderService.search({
                    limit: limit,
                    page: page,
                    orderNumbers: targetOrderNumbers
                });
                numData = searchOrdersResult.data.length;
                orders.push(...searchOrdersResult.data);
            }
        }
        return orders;
    });
}
/**
 * 運行・オンライン販売停止メール作成
 */
function createEmails(res, orders, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        if (orders.length === 0) {
            return [];
        }
        return Promise.all(orders.map((order) => __awaiter(this, void 0, void 0, function* () {
            return createEmail(res, order, notice);
        })));
    });
}
/**
 * 運行・オンライン販売停止メール作成(1通)
 */
function createEmail(res, order, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        const purchaserNameJp = `${order.customer.familyName} ${order.customer.givenName}`;
        const purchaserName = `${res.__('{{name}}様', { name: purchaserNameJp })}`;
        const purchaserNameEn = `${res.__('Mr./Ms.{{name}}', { name: order.customer.name })}`;
        const paymentTicketInfoText = createPaymentTicketInfoText(res, order);
        const email = new Email({
            views: { root: `${__dirname}/../../../../emails` },
            message: {},
            // uncomment below to send emails in development/test env:
            // send: true
            transport: {
                jsonTransport: true
            }
            // htmlToText: false
        });
        const content = yield email.render('updateEventStatus', {
            purchaserName,
            purchaserNameEn,
            notice,
            paymentTicketInfos: paymentTicketInfoText
        });
        // メール作成
        const emailMessage = {
            project: { typeOf: order.project.typeOf, id: order.project.id },
            typeOf: cinerinoapi.factory.chevre.creativeWorkType.EmailMessage,
            identifier: `updateOnlineStatus-${order.orderNumber}`,
            name: `updateOnlineStatus-${order.orderNumber}`,
            sender: {
                typeOf: order.seller.typeOf,
                name: conf.get('email.fromname'),
                email: conf.get('email.from')
            },
            toRecipient: {
                typeOf: order.customer.typeOf,
                name: order.customer.name,
                email: order.customer.email
            },
            about: `東京タワートップデッキツアー中止のお知らせ Tokyo Tower Top Deck Tour Cancelled`,
            text: content
        };
        const purpose = {
            project: { typeOf: order.project.typeOf, id: order.project.id },
            typeOf: order.typeOf,
            seller: order.seller,
            customer: order.customer,
            confirmationNumber: order.confirmationNumber,
            orderNumber: order.orderNumber,
            price: order.price,
            priceCurrency: order.priceCurrency,
            orderDate: moment(order.orderDate)
                .toDate()
        };
        return {
            typeOf: cinerinoapi.factory.actionType.SendAction,
            agent: {
                typeOf: cinerinoapi.factory.personType.Person,
                id: ''
            },
            object: emailMessage,
            project: { typeOf: order.project.typeOf, id: order.project.id },
            purpose: purpose,
            recipient: {
                id: order.customer.id,
                name: emailMessage.toRecipient.name,
                typeOf: order.customer.typeOf
            }
        };
    });
}
function createPaymentTicketInfoText(res, order) {
    var _a;
    const reservation = order.acceptedOffers[0].itemOffered;
    // ご来塔日時 : 2017/12/10 09:15
    const event = reservation.reservationFor;
    const day = moment(event.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD');
    const time = moment(event.startDate).tz('Asia/Tokyo').format('HH:mm');
    // 購入番号
    let paymentNo = '';
    const paymentNoProperty = (_a = order.identifier) === null || _a === void 0 ? void 0 : _a.find((p) => p.name === 'paymentNo');
    if (paymentNoProperty !== undefined) {
        paymentNo = paymentNoProperty.value;
    }
    // 購入チケット情報
    const paymentTicketInfos = [];
    paymentTicketInfos.push(`${res.__('PaymentNo')} : ${paymentNo}`);
    paymentTicketInfos.push(`${res.__('EmailReserveDate')} : ${day} ${time}`);
    paymentTicketInfos.push(`${res.__('TicketType')} ${res.__('TicketCount')}`); // 券種 枚数
    const infos = getTicketInfo(order, res.__, res.locale); // TOP DECKチケット(大人) 1枚
    paymentTicketInfos.push(infos.join('\n'));
    // 英語表記を追加
    paymentTicketInfos.push(''); // 日英の間の改行
    paymentTicketInfos.push(`${res.__({ phrase: 'PaymentNo', locale: 'en' })} : ${paymentNo}`);
    paymentTicketInfos.push(`${res.__({ phrase: 'EmailReserveDate', locale: 'en' })} : ${day} ${time}`);
    paymentTicketInfos.push(`${res.__({ phrase: 'TicketType', locale: 'en' })} ${res.__({ phrase: 'TicketCount', locale: 'en' })}`);
    // TOP DECKチケット(大人) 1枚
    const infosEn = getTicketInfo(order, res.__, 'en');
    paymentTicketInfos.push(infosEn.join('\n'));
    return paymentTicketInfos.join('\n');
}
/**
 * チケット情報取得
 */
function getTicketInfo(order, __, locale) {
    const acceptedOffers = order.acceptedOffers;
    // チケットコード順にソート
    acceptedOffers.sort((a, b) => {
        if (a.itemOffered.reservedTicket.ticketType.identifier
            < b.itemOffered.reservedTicket.ticketType.identifier) {
            return -1;
        }
        if (a.itemOffered.reservedTicket.ticketType.identifier
            > b.itemOffered.reservedTicket.ticketType.identifier) {
            return 1;
        }
        return 0;
    });
    // 券種ごとに合計枚数算出
    const ticketInfos = {};
    for (const acceptedOffer of acceptedOffers) {
        // チケットタイプごとにチケット情報セット
        const reservation = acceptedOffer.itemOffered;
        const ticketType = reservation.reservedTicket.ticketType;
        const price = getUnitPriceByAcceptedOffer(acceptedOffer);
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
