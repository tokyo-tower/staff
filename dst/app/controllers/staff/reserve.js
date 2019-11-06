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
 * 内部関係者座席予約コントローラー
 */
const cinerinoapi = require("@cinerino/api-nodejs-client");
const conf = require("config");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const numeral = require("numeral");
const _ = require("underscore");
const reservePerformanceForm_1 = require("../../forms/reserve/reservePerformanceForm");
const session_1 = require("../../models/reserve/session");
const reserveBaseController = require("../reserveBase");
const debug = createDebug('ttts-staff:controller');
const layout = 'layouts/staff/layout';
const reserveMaxDateInfo = conf.get('reserve_max_date');
function start(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 購入結果セッション初期化
            delete req.session.transactionResult;
            delete req.session.printToken;
            const reservationModel = yield reserveBaseController.processStart(req);
            reservationModel.save(req);
            if (reservationModel.transactionInProgress.performance !== undefined) {
                const cb = '/staff/reserve/tickets';
                res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
            }
            else {
                const cb = '/staff/reserve/performances';
                res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
            }
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.start = start;
/**
 * 規約(スキップ)
 */
function terms(req, res, __) {
    const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/';
    res.redirect(cb);
}
exports.terms = terms;
/**
 * スケジュール選択
 */
function performances(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Expired')));
                return;
            }
            const token = req.tttsAuthClient.credentials;
            const maxDate = moment();
            Object.keys(reserveMaxDateInfo).forEach((key) => {
                maxDate.add(reserveMaxDateInfo[key], key);
            });
            const reserveMaxDate = maxDate.format('YYYY/MM/DD');
            if (req.method === 'POST') {
                reservePerformanceForm_1.default(req);
                const validationResult = yield req.getValidationResult();
                if (!validationResult.isEmpty()) {
                    next(new Error(req.__('UnexpectedError')));
                    return;
                }
                try {
                    // パフォーマンスFIX
                    yield reserveBaseController.processFixPerformance(reservationModel, req.body.performanceId, req);
                    reservationModel.save(req);
                    res.redirect('/staff/reserve/tickets');
                    return;
                }
                catch (error) {
                    next(new Error(req.__('UnexpectedError')));
                    return;
                }
            }
            else {
                res.render('staff/reserve/performances', {
                    token: token,
                    reserveMaxDate: reserveMaxDate,
                    reserveStartDate: '',
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.performances = performances;
/**
 * 券種選択
 */
function tickets(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Expired')));
                return;
            }
            // パフォーマンスは指定済みのはず
            if (reservationModel.transactionInProgress.performance === undefined) {
                throw new Error(req.__('UnexpectedError'));
            }
            reservationModel.transactionInProgress.paymentMethod = reserveBaseController.PaymentMethodType.CP;
            if (req.method === 'POST') {
                // 仮予約あればキャンセルする
                try {
                    // セッション中の予約リストを初期化
                    reservationModel.transactionInProgress.reservations = [];
                    // 座席仮予約があればキャンセル
                    if (reservationModel.transactionInProgress.seatReservationAuthorizeActionId !== undefined) {
                        const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
                            endpoint: process.env.CINERINO_API_ENDPOINT,
                            auth: req.tttsAuthClient
                        });
                        debug('canceling seat reservation authorize action...');
                        const actionId = reservationModel.transactionInProgress.seatReservationAuthorizeActionId;
                        delete reservationModel.transactionInProgress.seatReservationAuthorizeActionId;
                        yield placeOrderTransactionService.cancelSeatReservationAuthorization({
                            transactionId: reservationModel.transactionInProgress.id,
                            actionId: actionId
                        });
                        debug('seat reservation authorize action canceled.');
                    }
                }
                catch (error) {
                    next(error);
                    return;
                }
                try {
                    // 現在時刻がイベント終了時刻を過ぎている時
                    if (moment(reservationModel.transactionInProgress.performance.endDate).toDate() < moment().toDate()) {
                        //「ご希望の枚数が用意できないため予約できません。」
                        throw new Error(req.__('NoAvailableSeats'));
                    }
                    // 予約処理
                    yield reserveBaseController.processFixSeatsAndTickets(reservationModel, req);
                    reservationModel.save(req);
                    res.redirect('/staff/reserve/profile');
                }
                catch (error) {
                    // "予約可能な席がございません"などのメッセージ表示
                    res.locals.message = error.message;
                    // 残席数不足、あるいは車椅子レート制限を超過の場合
                    if (error.code === http_status_1.CONFLICT || error.code === http_status_1.TOO_MANY_REQUESTS) {
                        res.locals.message = req.__('NoAvailableSeats');
                    }
                    // reservation初期化後のエラーだとcommentが消えちゃうのでセット
                    let reserveMemo = '';
                    if (Array.isArray(JSON.parse(req.body.choices))) {
                        reserveMemo = JSON.parse(req.body.choices)[0].watcher_name;
                    }
                    res.render('staff/reserve/tickets', {
                        reservationModel: reservationModel,
                        watcher_name: reserveMemo,
                        layout: layout
                    });
                }
            }
            else {
                // 券種選択画面へ遷移
                res.locals.message = '';
                res.render('staff/reserve/tickets', {
                    reservationModel: reservationModel,
                    watcher_name: '',
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.tickets = tickets;
/**
 * 購入者情報
 */
function profile(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Expired')));
                return;
            }
            if (req.method === 'POST') {
                try {
                    yield reserveBaseController.processFixProfile(reservationModel, req, res);
                    reservationModel.save(req);
                    res.redirect('/staff/reserve/confirm');
                }
                catch (error) {
                    res.render('staff/reserve/profile', {
                        reservationModel: reservationModel,
                        layout: layout
                    });
                }
            }
            else {
                // セッションに情報があれば、フォーム初期値設定
                const email = reservationModel.transactionInProgress.purchaser.email;
                res.locals.lastName = reservationModel.transactionInProgress.purchaser.lastName;
                res.locals.firstName = reservationModel.transactionInProgress.purchaser.firstName;
                res.locals.tel = reservationModel.transactionInProgress.purchaser.tel;
                res.locals.age = reservationModel.transactionInProgress.purchaser.age;
                res.locals.address = reservationModel.transactionInProgress.purchaser.address;
                res.locals.gender = reservationModel.transactionInProgress.purchaser.gender;
                res.locals.email = (!_.isEmpty(email)) ? email : '';
                res.locals.emailConfirm = (!_.isEmpty(email)) ? email.substr(0, email.indexOf('@')) : '';
                res.locals.emailConfirmDomain = (!_.isEmpty(email)) ? email.substr(email.indexOf('@') + 1) : '';
                res.locals.paymentMethod =
                    (!_.isEmpty(reservationModel.transactionInProgress.paymentMethod))
                        ? reservationModel.transactionInProgress.paymentMethod
                        : reserveBaseController.PaymentMethodType.CP;
                res.render('staff/reserve/profile', {
                    reservationModel: reservationModel,
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.profile = profile;
/**
 * 予約内容確認
 */
// tslint:disable-next-line:max-func-body-length
function confirm(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null || moment(reservationModel.transactionInProgress.expires).toDate() <= moment().toDate()) {
                next(new Error(req.__('Expired')));
                return;
            }
            if (req.method === 'POST') {
                try {
                    const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
                        endpoint: process.env.CINERINO_API_ENDPOINT,
                        auth: req.tttsAuthClient
                    });
                    const paymentService = new cinerinoapi.service.Payment({
                        endpoint: process.env.CINERINO_API_ENDPOINT,
                        auth: req.tttsAuthClient
                    });
                    // 汎用決済承認
                    const amount = reservationModel.getTotalCharge();
                    const paymentAuthorization = yield paymentService.authorizeAnyPayment({
                        object: {
                            typeOf: cinerinoapi.factory.paymentMethodType.Others,
                            name: reservationModel.transactionInProgress.paymentMethod,
                            additionalProperty: [],
                            amount: amount
                        },
                        purpose: { typeOf: cinerinoapi.factory.transactionType.PlaceOrder, id: reservationModel.transactionInProgress.id }
                    });
                    debug('payment authorized', paymentAuthorization);
                    const potentialActions = createPotentialActions(reservationModel);
                    // 取引確定
                    const transactionResult = yield placeOrderTransactionService.confirm({
                        id: reservationModel.transactionInProgress.id,
                        potentialActions: potentialActions
                    });
                    // 購入結果セッション作成
                    req.session.transactionResult = transactionResult;
                    try {
                        // 完了メールキュー追加
                        const emailAttributes = yield reserveBaseController.createEmailAttributes(transactionResult.order, res);
                        yield placeOrderTransactionService.sendEmailNotification({
                            transactionId: reservationModel.transactionInProgress.id,
                            emailMessageAttributes: emailAttributes
                        });
                        debug('email sent.');
                    }
                    catch (error) {
                        // 失敗してもスルー
                    }
                    // 購入フローセッションは削除
                    session_1.default.REMOVE(req);
                    res.redirect('/staff/reserve/complete');
                    return;
                }
                catch (error) {
                    session_1.default.REMOVE(req);
                    next(error);
                    return;
                }
            }
            else {
                // チケットを券種コードでソート
                sortReservationstByTicketType(reservationModel.transactionInProgress.reservations);
                const ticketInfos = {};
                for (const reservation of reservationModel.transactionInProgress.reservations) {
                    const ticketType = reservation.reservedTicket.ticketType;
                    const price = reservation.unitPrice;
                    const dataValue = ticketType.identifier;
                    // チケットタイプごとにチケット情報セット
                    if (!ticketInfos.hasOwnProperty(dataValue)) {
                        ticketInfos[dataValue] = {
                            ticket_type_name: ticketType.name,
                            charge: `\\${numeral(price).format('0,0')}`,
                            watcher_name: reservation.additionalTicketText,
                            count: 1
                        };
                    }
                    else {
                        ticketInfos[dataValue].count += 1;
                    }
                }
                // 券種ごとの表示情報編集
                Object.keys(ticketInfos).forEach((key) => {
                    const ticketInfo = ticketInfos[key];
                    ticketInfos[key].info =
                        `${ticketInfo.ticket_type_name[res.locale]} ${ticketInfo.charge} × ${res.__('{{n}}Leaf', { n: ticketInfo.count })}`;
                });
                res.render('staff/reserve/confirm', {
                    reservationModel: reservationModel,
                    ticketInfos: ticketInfos,
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.confirm = confirm;
// tslint:disable-next-line:max-func-body-length
function createPotentialActions(reservationModel) {
    // 予約連携パラメータ作成
    const authorizeSeatReservationResult = reservationModel.transactionInProgress.authorizeSeatReservationResult;
    if (authorizeSeatReservationResult === undefined) {
        throw new Error('No Seat Reservation');
    }
    const acceptedOffers = (Array.isArray(authorizeSeatReservationResult.acceptedOffers))
        ? authorizeSeatReservationResult.acceptedOffers
        : [];
    const reserveTransaction = authorizeSeatReservationResult.responseBody;
    if (reserveTransaction === undefined) {
        throw new cinerinoapi.factory.errors.Argument('Transaction', 'Reserve trasaction required');
    }
    const chevreReservations = (Array.isArray(reserveTransaction.object.reservations))
        ? reserveTransaction.object.reservations
        : [];
    const event = reserveTransaction.object.reservationFor;
    if (event === undefined || event === null) {
        throw new cinerinoapi.factory.errors.Argument('Transaction', 'Event required');
    }
    let paymentNo;
    if (chevreReservations[0].underName !== undefined && Array.isArray(chevreReservations[0].underName.identifier)) {
        const paymentNoProperty = chevreReservations[0].underName.identifier.find((p) => p.name === 'paymentNo');
        if (paymentNoProperty !== undefined) {
            paymentNo = paymentNoProperty.value;
        }
    }
    const transactionAgent = reservationModel.transactionInProgress.agent;
    if (transactionAgent === undefined) {
        throw new Error('No Transaction Agent');
    }
    const customerProfile = reservationModel.transactionInProgress.profile;
    if (customerProfile === undefined) {
        throw new Error('No Customer Profile');
    }
    // 予約確定パラメータを生成
    const eventReservations = acceptedOffers.map((acceptedOffer, index) => {
        const reservation = acceptedOffer.itemOffered;
        const chevreReservation = chevreReservations.find((r) => r.id === reservation.id);
        if (chevreReservation === undefined) {
            throw new cinerinoapi.factory.errors.Argument('Transaction', `Unexpected temporary reservation: ${reservation.id}`);
        }
        return temporaryReservation2confirmed({
            reservation: reservation,
            chevreReservation: chevreReservation,
            transactionId: reservationModel.transactionInProgress.id,
            customer: transactionAgent,
            profile: customerProfile,
            paymentNo: paymentNo,
            gmoOrderId: '',
            paymentSeatIndex: index.toString(),
            paymentMethodName: reservationModel.transactionInProgress.paymentMethod
        });
    });
    const confirmReservationParams = [];
    confirmReservationParams.push({
        object: {
            typeOf: reserveTransaction.typeOf,
            id: reserveTransaction.id,
            object: {
                reservations: [
                    ...eventReservations.map((r) => {
                        // プロジェクト固有の値を連携
                        return {
                            id: r.id,
                            additionalTicketText: r.additionalTicketText,
                            underName: r.underName,
                            additionalProperty: r.additionalProperty
                        };
                    }),
                    // 余分確保分の予約にもextraプロパティを連携
                    ...chevreReservations.filter((r) => {
                        // 注文アイテムに存在しない予約(余分確保分)にフィルタリング
                        const orderItem = eventReservations.find((eventReservation) => eventReservation.id === r.id);
                        return orderItem === undefined;
                    })
                        .map((r) => {
                        return {
                            id: r.id,
                            additionalProperty: [
                                { name: 'extra', value: '1' }
                            ]
                        };
                    })
                ]
            }
        }
    });
    return {
        order: {
            potentialActions: {
                sendOrder: {
                    potentialActions: {
                        confirmReservation: confirmReservationParams
                    }
                },
                informOrder: [
                    { recipient: { url: `${process.env.API_ENDPOINT}/webhooks/onPlaceOrder` } }
                ]
            }
        }
    };
}
/**
 * 仮予約から確定予約を生成する
 */
function temporaryReservation2confirmed(params) {
    const customer = params.customer;
    const underName = Object.assign({}, params.profile, { typeOf: cinerinoapi.factory.personType.Person, id: customer.id, name: `${params.profile.givenName} ${params.profile.familyName}`, identifier: [
            { name: 'paymentNo', value: params.paymentNo },
            { name: 'transaction', value: params.transactionId },
            { name: 'gmoOrderId', value: params.gmoOrderId },
            ...(typeof params.profile.age === 'string')
                ? [{ name: 'age', value: params.profile.age }]
                : [],
            ...(Array.isArray(customer.identifier)) ? customer.identifier : [],
            ...(customer.memberOf !== undefined && customer.memberOf.membershipNumber !== undefined)
                ? [{ name: 'username', value: customer.memberOf.membershipNumber }]
                : [],
            ...(params.paymentMethodName !== undefined)
                ? [{ name: 'paymentMethod', value: params.paymentMethodName }]
                : []
        ] });
    return Object.assign({}, params.chevreReservation, { underName: underName, additionalProperty: [
            ...(Array.isArray(params.reservation.additionalProperty)) ? params.reservation.additionalProperty : [],
            { name: 'paymentSeatIndex', value: params.paymentSeatIndex }
        ], additionalTicketText: params.reservation.additionalTicketText });
}
/**
 * 予約完了
 */
function complete(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // セッションに取引結果があるはず
            const transactionResult = req.session.transactionResult;
            if (transactionResult === undefined) {
                next(new Error(req.__('NotFound')));
                return;
            }
            const reservations = transactionResult.order.acceptedOffers.map((o) => {
                const unitPrice = reserveBaseController.getUnitPriceByAcceptedOffer(o);
                return Object.assign({}, o.itemOffered, { unitPrice: unitPrice });
            });
            // チケットを券種コードでソート
            sortReservationstByTicketType(reservations);
            res.render('staff/reserve/complete', {
                order: transactionResult.order,
                reservations: reservations,
                printToken: transactionResult.printToken,
                layout: layout
            });
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.complete = complete;
/**
 * チケットを券種コードでソートする
 */
function sortReservationstByTicketType(reservations) {
    // チケットを券種コードでソート
    reservations.sort((a, b) => {
        if (a.reservedTicket.ticketType.identifier > b.reservedTicket.ticketType.identifier) {
            return 1;
        }
        if (a.reservedTicket.ticketType.identifier < b.reservedTicket.ticketType.identifier) {
            return -1;
        }
        return 0;
    });
}
