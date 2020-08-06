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
exports.returnOrders = exports.searchSuspendedPerformances = void 0;
/**
 * 販売停止パフォーマンスAPIコントローラー
 */
const cinerinoapi = require("@cinerino/sdk");
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const createDebug = require("debug");
const Email = require("email-templates");
const http_status_1 = require("http-status");
// @ts-ignore
const difference = require("lodash.difference");
// @ts-ignore
const uniq = require("lodash.uniq");
const moment = require("moment-timezone");
const numeral = require("numeral");
const debug = createDebug('ttts-staff:controllers');
const EMPTY_STRING = '-';
const EV_SERVICE_STATUS_NAMES = {};
EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Normal] = EMPTY_STRING;
EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Slowdown] = '一時休止';
EV_SERVICE_STATUS_NAMES[tttsapi.factory.performance.EvServiceStatus.Suspended] = '完全中止';
const REFUND_STATUS_NAMES = {};
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.None] = EMPTY_STRING;
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.NotInstructed] = '未指示';
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.Instructed] = '指示済';
REFUND_STATUS_NAMES[tttsapi.factory.performance.RefundStatus.Compeleted] = '返金済';
if (process.env.API_CLIENT_ID === undefined) {
    throw new Error('Please set an environment variable \'API_CLIENT_ID\'');
}
const POS_CLIENT_IDS = (typeof process.env.POS_CLIENT_ID === 'string')
    ? process.env.POS_CLIENT_ID.split(',')
    : [];
const FRONTEND_CLIENT_IDS = (typeof process.env.FRONTEND_CLIENT_ID === 'string')
    ? process.env.FRONTEND_CLIENT_ID.split(',')
    : [];
/**
 * 販売中止一覧検索(api)
 */
function searchSuspendedPerformances(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        // tslint:disable-next-line:no-magic-numbers
        const limit = (typeof req.query.limit === 'string' && req.query.limit.length > 0) ? Number(req.query.limit) : 10;
        const page = (typeof req.query.query === 'string' && req.query.query.length > 0) ? Number(req.query.page) : 1;
        // 入力値またはnull取得
        const getValue = (value) => {
            return (typeof value === 'string' && value.length > 0) ? value : null;
        };
        // 販売停止処理日
        const day1 = getValue(req.query.input_onlinedate1);
        const day2 = getValue(req.query.input_onlinedate2);
        // 対象ツアー年月日
        const performanceDate1 = getValue(req.query.input_performancedate1);
        const performanceDate2 = getValue(req.query.input_performancedate2);
        // 返金ステータス
        const refundStatus = getValue(req.query.refund_status);
        // 検索条件を作成
        const searchConditions = {
            limit: limit,
            page: page,
            sort: {
                startDate: -1
                // day: -1,
                // start_time: 1
            },
            ttts_extension: {
                online_sales_status: tttsapi.factory.performance.OnlineSalesStatus.Suspended,
                online_sales_update_at: (day1 !== null || day2 !== null)
                    ? Object.assign(Object.assign({}, (day1 !== null)
                        ? { $gte: moment(`${day1}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate() }
                        : undefined), (day2 !== null)
                        ? { $lt: moment(`${day2}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').add(1, 'day').toDate() }
                        : undefined) : undefined,
                refund_status: (refundStatus !== null) ? refundStatus : undefined
            },
            startFrom: (performanceDate1 !== null)
                ? moment(`${performanceDate1}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ')
                    .toDate()
                : undefined,
            startThrough: (performanceDate2 !== null)
                ? moment(`${performanceDate2}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ')
                    .add(1, 'day')
                    .toDate()
                : undefined
        };
        try {
            // 販売停止パフォーマンス情報を検索
            const { results, totalCount } = yield findSuspendedPerformances(req, searchConditions);
            res.header('X-Total-Count', totalCount.toString());
            res.json(results);
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                errors: [{
                        message: error.message
                    }]
            });
        }
    });
}
exports.searchSuspendedPerformances = searchSuspendedPerformances;
/**
 * 表示一覧取得
 */
// tslint:disable-next-line:max-func-body-length
function findSuspendedPerformances(req, conditions) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const eventService = new tttsapi.service.Event({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const reservationService = new tttsapi.service.Reservation({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        debug('finfing performances...', conditions);
        const searchResults = yield eventService.searchPerformances(Object.assign(Object.assign({}, conditions), {
            countDocuments: '1',
            useLegacySearch: '1',
            useExtension: '1'
        }));
        const performances = searchResults.data.data;
        const totalCount = searchResults.totalCount;
        const results = [];
        for (const performance of performances) {
            // パフォーマンスに対する予約数
            let searchReservationsResult = yield reservationService.search({
                limit: 1,
                typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
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
                    id: performance.id
                }
            });
            let numberOfReservations = searchReservationsResult.totalCount;
            // 未入場の予約数
            searchReservationsResult = yield reservationService.search({
                limit: 1,
                typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
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
                    id: performance.id
                },
                checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
            });
            let nubmerOfUncheckedReservations = searchReservationsResult.totalCount;
            const extension = performance.extension;
            // 時点での予約
            let reservationsAtLastUpdateDate = extension.reservationsAtLastUpdateDate;
            if (reservationsAtLastUpdateDate !== undefined) {
                reservationsAtLastUpdateDate = reservationsAtLastUpdateDate
                    .filter((r) => r.status === tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed) // 確定ステータス
                    .filter((r) => { var _a; return FRONTEND_CLIENT_IDS.indexOf((_a = r.transaction_agent) === null || _a === void 0 ? void 0 : _a.id) >= 0; }); // frontendアプリケーションでの購入
                numberOfReservations = reservationsAtLastUpdateDate.length;
                // 時点での予約が存在していれば、そのうちの未入場数を検索
                if (numberOfReservations > 0) {
                    searchReservationsResult = yield reservationService.search({
                        limit: 1,
                        typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
                        ids: reservationsAtLastUpdateDate.map((r) => r.id),
                        checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
                    });
                    nubmerOfUncheckedReservations = searchReservationsResult.totalCount;
                }
            }
            let tourNumber = performance.tourNumber; // 古いデーターに対する互換性対応
            const tourNumberFromAdditionalProperty = (_b = (_a = performance.additionalProperty) === null || _a === void 0 ? void 0 : _a.find((p) => p.name === 'tourNumber')) === null || _b === void 0 ? void 0 : _b.value;
            if (typeof tourNumberFromAdditionalProperty === 'string') {
                tourNumber = tourNumberFromAdditionalProperty;
            }
            results.push({
                performance_id: performance.id,
                performance_day: moment(performance.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD'),
                start_time: moment(performance.startDate).tz('Asia/Tokyo').format('HHmm'),
                end_time: moment(performance.endDate).tz('Asia/Tokyo').format('HHmm'),
                start_date: performance.startDate,
                end_date: performance.endDate,
                tour_number: tourNumber,
                ev_service_status: extension.ev_service_status,
                ev_service_status_name: EV_SERVICE_STATUS_NAMES[extension.ev_service_status],
                online_sales_update_at: extension.online_sales_update_at,
                online_sales_update_user: extension.online_sales_update_user,
                canceled: numberOfReservations,
                arrived: numberOfReservations - nubmerOfUncheckedReservations,
                refund_status: extension.refund_status,
                refund_status_name: (extension.refund_status !== undefined) ? REFUND_STATUS_NAMES[extension.refund_status] : undefined,
                refunded: extension.refunded_count
            });
            // レート制限に考慮して、やや時間をおく
            yield new Promise((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 
                // tslint:disable-next-line:no-magic-numbers
                300);
            });
        }
        return { results, totalCount };
    });
}
/**
 * 返金処理(api)
 */
function returnOrders(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const eventService = new tttsapi.service.Event({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const performanceId = req.params.performanceId;
            // パフォーマンス終了済かどうか確認
            const performance = yield eventService.findPerofrmanceById({ id: performanceId });
            debug('starting returnOrders by performance...', performance.id);
            const now = moment();
            const endDate = moment(performance.endDate);
            if (endDate >= now) {
                throw new Error('上映が終了していないので返品処理を実行できません。');
            }
            // 返金対象注文を抽出する
            const returningOrders = yield searchOrderNumberss4refund(req, performanceId, [...FRONTEND_CLIENT_IDS, ...POS_CLIENT_IDS]);
            // パフォーマンス返金ステータス調整
            yield eventService.updateExtension(Object.assign({ id: performanceId, refundStatus: tttsapi.factory.performance.RefundStatus.Instructed, refundStatusUpdateAt: new Date() }, {
                refundCount: 0,
                unrefundCount: returningOrders.length // 未返金数をセット
            }));
            yield processReturnOrders({
                req: req,
                agentId: process.env.API_CLIENT_ID,
                orders: returningOrders
            });
            res.status(http_status_1.NO_CONTENT)
                .end();
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                errors: [
                    { message: error.message }
                ]
            });
        }
    });
}
exports.returnOrders = returnOrders;
function searchOrderNumberss4refund(req, performanceId, 
/**
 * 返品対象の注文クライアントID
 */
clientIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservationService = new tttsapi.service.Reservation({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        // パフォーマンスに対する取引リストを、予約コレクションから検索する
        let reservations = [];
        if (clientIds.length > 0) {
            const searchReservationsResult = yield reservationService.search(Object.assign({ limit: 100, typeOf: tttsapi.factory.chevre.reservationType.EventReservation, reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed], reservationFor: { id: performanceId }, underName: {
                    identifiers: clientIds.map((clientId) => {
                        return { name: 'clientId', value: clientId };
                    })
                } }, {
                noTotalCount: '1'
            }));
            reservations = searchReservationsResult.data;
        }
        // 入場履歴なしの注文番号を取り出す
        let orderNumbers = reservations.map((r) => { var _a, _b, _c; return (_c = (_b = (_a = r.underName) === null || _a === void 0 ? void 0 : _a.identifier) === null || _b === void 0 ? void 0 : _b.find((p) => p.name === 'orderNumber')) === null || _c === void 0 ? void 0 : _c.value; });
        const orderNumbersWithCheckins = reservations
            .filter((r) => (r.checkins.length > 0))
            .map((r) => { var _a, _b, _c; return (_c = (_b = (_a = r.underName) === null || _a === void 0 ? void 0 : _a.identifier) === null || _b === void 0 ? void 0 : _b.find((p) => p.name === 'orderNumber')) === null || _c === void 0 ? void 0 : _c.value; });
        orderNumbers = uniq(difference(orderNumbers, orderNumbersWithCheckins));
        const returningOrderNumbers = orderNumbers.filter((orderNumber) => typeof orderNumber === 'string');
        const orderService = new cinerinoapi.service.Order({
            endpoint: process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const searchOrdersResult = yield orderService.search({
            limit: 100,
            orderNumbers: returningOrderNumbers
        });
        return searchOrdersResult.data;
    });
}
function processReturnOrders(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const returnOrderService = new cinerinoapi.service.transaction.ReturnOrder({
            endpoint: process.env.CINERINO_API_ENDPOINT,
            auth: params.req.tttsAuthClient
        });
        const returnableOrders = [];
        const returnOrderActions = [];
        yield Promise.all(params.orders.map((order) => __awaiter(this, void 0, void 0, function* () {
            // 返品メール作成
            const emailCustomization = yield createEmailMessage4sellerReason(order);
            const paymentMethods = order.paymentMethods;
            const refundCreditCardActionsParams = paymentMethods
                .filter((p) => p.typeOf === cinerinoapi.factory.paymentMethodType.CreditCard)
                .map((p) => {
                return {
                    object: {
                        object: [{
                                paymentMethod: {
                                    paymentMethodId: p.paymentMethodId
                                }
                            }]
                    },
                    potentialActions: {
                        sendEmailMessage: {
                            object: {
                                sender: emailCustomization.sender,
                                toRecipient: emailCustomization.toRecipient,
                                about: emailCustomization.about,
                                text: emailCustomization.text
                            }
                        }
                    }
                };
            });
            returnableOrders.push({ orderNumber: order.orderNumber });
            returnOrderActions.push({
                object: { orderNumber: order.orderNumber },
                potentialActions: {
                    refundCreditCard: refundCreditCardActionsParams
                }
            });
        })));
        const returnOrderTransaction = yield returnOrderService.start({
            expires: moment()
                .add(1, 'minute')
                .toDate(),
            object: {
                order: returnableOrders
            },
            agent: Object.assign({ identifier: [
                    { name: 'reason', value: cinerinoapi.factory.transaction.returnOrder.Reason.Seller }
                ] }, {
                typeOf: cinerinoapi.factory.personType.Person,
                id: params.agentId
            })
        });
        yield returnOrderService.confirm({
            id: returnOrderTransaction.id,
            potentialActions: {
                returnOrder: returnOrderActions
            }
        });
    });
}
function getUnitPriceByAcceptedOffer(offer) {
    var _a, _b;
    let unitPrice = 0;
    if (offer.priceSpecification !== undefined) {
        const priceFromUnitPriceSpec = (_b = (_a = offer.priceSpecification.priceComponent) === null || _a === void 0 ? void 0 : _a.find((c) => c.typeOf === cinerinoapi.factory.chevre.priceSpecificationType.UnitPriceSpecification)) === null || _b === void 0 ? void 0 : _b.price;
        if (typeof priceFromUnitPriceSpec === 'number') {
            unitPrice = priceFromUnitPriceSpec;
        }
    }
    else if (typeof offer.price === 'number') {
        unitPrice = offer.price;
    }
    return unitPrice;
}
/**
 * 販売者都合での返品メール作成
 */
function createEmailMessage4sellerReason(order) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservation = order.acceptedOffers[0].itemOffered;
        const email = new Email({
            views: { root: `${__dirname}/../../../../../emails` },
            message: {},
            // uncomment below to send emails in development/test env:
            // send: true
            transport: {
                jsonTransport: true
            }
            // htmlToText: false
        });
        // 券種ごとに合計枚数算出
        const ticketInfos = {};
        order.acceptedOffers.forEach((o) => {
            const r = o.itemOffered;
            const unitPrice = getUnitPriceByAcceptedOffer(o);
            // チケットタイプごとにチケット情報セット
            if (ticketInfos[r.reservedTicket.ticketType.id] === undefined) {
                ticketInfos[r.reservedTicket.ticketType.id] = {
                    name: r.reservedTicket.ticketType.name,
                    charge: `\\${numeral(unitPrice).format('0,0')}`,
                    count: 0
                };
            }
            ticketInfos[r.reservedTicket.ticketType.id].count += 1;
        });
        // 券種ごとの表示情報編集 (sort順を変えないよう同期Loop:"for of")
        const ticketInfoJa = Object.keys(ticketInfos).map((ticketTypeId) => {
            const ticketInfo = ticketInfos[ticketTypeId];
            return `${ticketInfo.name.ja} ${ticketInfo.charge} × ${ticketInfo.count}枚`;
        }).join('\n');
        const ticketInfoEn = Object.keys(ticketInfos).map((ticketTypeId) => {
            const ticketInfo = ticketInfos[ticketTypeId];
            return `${ticketInfo.name.en} ${ticketInfo.charge} × ${ticketInfo.count} ticket(s)`;
        }).join('\n');
        let paymentNo = '';
        if (Array.isArray(order.identifier)) {
            const paymentNoProperty = order.identifier.find((p) => p.name === 'paymentNo');
            if (paymentNoProperty !== undefined) {
                paymentNo = paymentNoProperty.value;
            }
        }
        const message = yield email.render('returnOrderBySeller', {
            purchaserNameJa: `${order.customer.familyName} ${order.customer.givenName}`,
            purchaserNameEn: order.customer.name,
            paymentNo: paymentNo,
            day: moment(reservation.reservationFor.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD'),
            startTime: moment(reservation.reservationFor.startDate).tz('Asia/Tokyo').format('HH:mm'),
            amount: numeral(order.price).format('0,0'),
            numberOfReservations: order.acceptedOffers.length,
            ticketInfoJa,
            ticketInfoEn
        });
        return {
            typeOf: cinerinoapi.factory.creativeWorkType.EmailMessage,
            sender: {
                typeOf: cinerinoapi.factory.organizationType.Corporation,
                name: 'Tokyo Tower TOP DECK TOUR Online Ticket',
                email: 'noreply@tokyotower.co.jp'
            },
            toRecipient: {
                typeOf: cinerinoapi.factory.personType.Person,
                name: (order.customer.name !== undefined) ? String(order.customer.name) : '',
                email: (order.customer.email !== undefined) ? order.customer.email : ''
            },
            about: '東京タワートップデッキツアー 返金完了のお知らせ (Payment Refund Notification for the Tokyo Tower Top Deck Tour)',
            text: message
        };
    });
}
