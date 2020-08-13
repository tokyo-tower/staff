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
exports.getTicketInfo = exports.getTargetReservationsForRefund = exports.updateOnlineStatus = exports.search = exports.getUnitPriceByAcceptedOffer = void 0;
/**
 * パフォーマンスAPIコントローラー
 */
const cinerinoapi = require("@cinerino/sdk");
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const conf = require("config");
const createDebug = require("debug");
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
            const unitPriceSpec = priceSpecification.priceComponent.find((c) => c.typeOf === tttsapi.factory.chevre.priceSpecificationType.UnitPriceSpecification);
            if (unitPriceSpec !== undefined && unitPriceSpec.price !== undefined && Number.isInteger(unitPriceSpec.price)) {
                unitPrice = unitPriceSpec.price;
            }
        }
    }
    return unitPrice;
}
exports.getUnitPriceByAcceptedOffer = getUnitPriceByAcceptedOffer;
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
                    typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
                    reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed],
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
                try {
                    // Chevreイベントステータスに反映
                    yield eventService.updatePartially({
                        id: performanceId,
                        eventStatus: newEventStatus
                    });
                }
                catch (error) {
                    // no op
                }
            }
            debug('performance online_sales_status updated.');
            // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
            if (evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended) {
                try {
                    yield createEmails(req, res, targetOrders, notice);
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
            typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
            reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed],
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
exports.getTargetReservationsForRefund = getTargetReservationsForRefund;
/**
 * 運行・オンライン販売停止メール作成
 * @param {Response} res
 * @param {tttsapi.factory.transaction.placeOrder.ITransaction[]} transactions
 * @param {string} notice
 * @return {Promise<void>}
 */
function createEmails(req, res, orders, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        if (orders.length === 0) {
            return;
        }
        // 購入単位ごとにメール作成
        yield Promise.all(orders.map((order) => __awaiter(this, void 0, void 0, function* () {
            yield createEmail(req, res, order, notice);
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
function createEmail(req, res, order, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservation = order.acceptedOffers[0].itemOffered;
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
        let paymentNo = '';
        if (Array.isArray(order.identifier)) {
            const paymentNoProperty = order.identifier.find((p) => p.name === 'paymentNo');
            if (paymentNoProperty !== undefined) {
                paymentNo = paymentNoProperty.value;
            }
        }
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
            typeOf: cinerinoapi.factory.creativeWorkType.EmailMessage,
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
        const emailMessage = {
            typeOf: cinerinoapi.factory.creativeWorkType.EmailMessage,
            identifier: `updateOnlineStatus-${reservation.id}`,
            name: `updateOnlineStatus-${reservation.id}`,
            sender: {
                typeOf: 'Corporation',
                name: emailAttributes.sender.name,
                email: emailAttributes.sender.email
            },
            toRecipient: {
                typeOf: cinerinoapi.factory.personType.Person,
                name: emailAttributes.toRecipient.name,
                email: emailAttributes.toRecipient.email
            },
            about: emailAttributes.about,
            text: emailAttributes.text
        };
        // その場で送信ではなく、DBにタスクを登録
        const taskAttributes = {
            name: tttsapi.factory.taskName.SendEmailMessage,
            project: { typeOf: order.project.typeOf, id: order.project.id },
            status: tttsapi.factory.taskStatus.Ready,
            runsAt: new Date(),
            remainingNumberOfTries: 10,
            numberOfTried: 0,
            executionResults: [],
            data: {
                actionAttributes: {
                    typeOf: cinerinoapi.factory.actionType.SendAction,
                    agent: req.staffUser,
                    object: emailMessage,
                    project: order.project,
                    purpose: order,
                    recipient: {
                        id: order.customer.id,
                        name: emailAttributes.toRecipient.name,
                        typeOf: cinerinoapi.factory.personType.Person
                    }
                }
            }
        };
        yield taskService.create(taskAttributes);
        debug('sendEmail task created.');
    });
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
exports.getTicketInfo = getTicketInfo;
