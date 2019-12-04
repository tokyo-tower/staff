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
 * 座席予約ベースコントローラー
 */
const cinerinoapi = require("@cinerino/api-nodejs-client");
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const conf = require("config");
const createDebug = require("debug");
const moment = require("moment-timezone");
const request = require("request-promise-native");
const _ = require("underscore");
const reserveProfileForm_1 = require("../forms/reserve/reserveProfileForm");
const reserveTicketForm_1 = require("../forms/reserve/reserveTicketForm");
const session_1 = require("../models/reserve/session");
const debug = createDebug('ttts-staff:controller');
var PaymentMethodType;
(function (PaymentMethodType) {
    PaymentMethodType["CP"] = "CP";
    PaymentMethodType["Invoice"] = "Invoice";
    PaymentMethodType["GroupReservation"] = "GroupReservation";
    PaymentMethodType["Charter"] = "Charter";
    PaymentMethodType["OTC"] = "OTC";
    PaymentMethodType["Invitation"] = "Invitation";
})(PaymentMethodType = exports.PaymentMethodType || (exports.PaymentMethodType = {}));
/**
 * 購入開始プロセス
 */
// tslint:disable-next-line:max-func-body-length
function processStart(req) {
    return __awaiter(this, void 0, void 0, function* () {
        // 言語も指定
        req.session.locale = (!_.isEmpty(req.query.locale)) ? req.query.locale : 'ja';
        const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
            endpoint: process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const sellerService = new cinerinoapi.service.Seller({
            endpoint: process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const searchSellersResult = yield sellerService.search({
            limit: 1
        });
        const seller = searchSellersResult.data.shift();
        if (seller === undefined) {
            throw new Error('Seller not found');
        }
        // WAITER許可証を取得
        const scope = 'placeOrderTransaction.TokyoTower.Staff';
        const { token } = yield request.post(`${process.env.WAITER_ENDPOINT}/projects/${process.env.PROJECT_ID}/passports`, {
            json: true,
            body: { scope: scope }
        }).then((body) => body);
        const expires = moment().add(conf.get('temporary_reservation_valid_period_seconds'), 'seconds').toDate();
        const transaction = yield placeOrderTransactionService.start({
            agent: {
                identifier: [
                    { name: 'customerGroup', value: 'Staff' }
                ]
            },
            expires: expires,
            object: {
                passport: { token: token }
            },
            seller: {
                typeOf: seller.typeOf,
                id: seller.id
            }
        });
        // 取引セッションを初期化
        const transactionInProgress = {
            id: transaction.id,
            agent: transaction.agent,
            seller: transaction.seller,
            category: req.query.category,
            expires: expires.toISOString(),
            paymentMethodChoices: [],
            ticketTypes: [],
            purchaser: {
                lastName: '',
                firstName: '',
                tel: '',
                email: '',
                age: '',
                address: '',
                gender: ''
            },
            paymentMethod: cinerinoapi.factory.paymentMethodType.CreditCard,
            reservations: []
        };
        const reservationModel = new session_1.default(transactionInProgress);
        // セッションに購入者情報があれば初期値セット
        const purchaserFromSession = req.session.purchaser;
        if (purchaserFromSession !== undefined) {
            reservationModel.transactionInProgress.purchaser = purchaserFromSession;
        }
        if (!_.isEmpty(req.query.performance)) {
            // パフォーマンス指定遷移の場合 パフォーマンスFIX
            yield processFixPerformance(reservationModel, req.query.performance, req);
        }
        return reservationModel;
    });
}
exports.processStart = processStart;
/**
 * 座席・券種確定プロセス
 */
function processFixSeatsAndTickets(reservationModel, req) {
    return __awaiter(this, void 0, void 0, function* () {
        // パフォーマンスは指定済みのはず
        if (reservationModel.transactionInProgress.performance === undefined) {
            throw new Error(req.__('UnexpectedError'));
        }
        // 検証(券種が選択されていること)+チケット枚数合計計算
        const checkInfo = yield checkFixSeatsAndTickets(reservationModel, req);
        if (checkInfo.status === false) {
            throw new Error(checkInfo.message);
        }
        // チケット情報に枚数セット(画面で選択された枚数<画面再表示用)
        reservationModel.transactionInProgress.ticketTypes.forEach((ticketType) => {
            const choice = checkInfo.choices.find((c) => (ticketType.id === c.ticket_type));
            ticketType.count = (choice !== undefined) ? Number(choice.ticket_count) : 0;
        });
        // セッション中の予約リストを初期化
        reservationModel.transactionInProgress.reservations = [];
        // 座席承認アクション
        const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
            endpoint: process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const offers = checkInfo.choicesAll.map((choice) => {
            return {
                ticket_type: choice.ticket_type,
                watcher_name: choice.watcher_name
            };
        });
        debug(`creating seatReservation authorizeAction on ${offers.length} offers...`);
        // tslint:disable-next-line:max-line-length
        let action;
        try {
            // 車椅子レート制限
            yield processLockTicketTypeCategoryRateLimit(reservationModel, req);
            action = yield placeOrderTransactionService.createSeatReservationAuthorization({
                transactionId: reservationModel.transactionInProgress.id,
                performanceId: reservationModel.transactionInProgress.performance.id,
                offers: offers
            });
        }
        catch (error) {
            yield processUnlockTicketTypeCategoryRateLimit(reservationModel, req);
            throw error;
        }
        reservationModel.transactionInProgress.seatReservationAuthorizeActionId = action.id;
        // セッションに保管
        reservationModel.transactionInProgress.authorizeSeatReservationResult = action.result;
        reservationModel.transactionInProgress.reservations = offers.map((o) => {
            const ticketType = reservationModel.transactionInProgress.ticketTypes.find((t) => t.id === o.ticket_type);
            if (ticketType === undefined) {
                throw new Error(`Unknown Ticket Type ${o.ticket_type}`);
            }
            return {
                additionalTicketText: o.watcher_name,
                reservedTicket: { ticketType: ticketType },
                unitPrice: (ticketType.priceSpecification !== undefined) ? ticketType.priceSpecification.price : 0
            };
        });
    });
}
exports.processFixSeatsAndTickets = processFixSeatsAndTickets;
function processLockTicketTypeCategoryRateLimit(reservationModel, req) {
    return __awaiter(this, void 0, void 0, function* () {
        // パフォーマンスは指定済みのはず
        if (reservationModel.transactionInProgress.performance !== undefined) {
            const tickeTypeCategoryRateLimitService = new tttsapi.service.TicketTypeCategoryRateLimit({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            // 車椅子レート制限解放
            const performanceStartDate = moment(reservationModel.transactionInProgress.performance.startDate)
                .toDate();
            yield Promise.all(reservationModel.transactionInProgress.ticketTypes.map((ticketType) => __awaiter(this, void 0, void 0, function* () {
                if (ticketType.count > 0) {
                    let ticketTypeCategory = tttsapi.factory.ticketTypeCategory.Normal;
                    if (Array.isArray(ticketType.additionalProperty)) {
                        const categoryProperty = ticketType.additionalProperty.find((p) => p.name === 'category');
                        if (categoryProperty !== undefined) {
                            ticketTypeCategory = categoryProperty.value;
                        }
                    }
                    if (ticketTypeCategory === tttsapi.factory.ticketTypeCategory.Wheelchair) {
                        const rateLimitKey = {
                            performanceStartDate: performanceStartDate,
                            ticketTypeCategory: ticketTypeCategory,
                            holder: reservationModel.transactionInProgress.id
                        };
                        debug('locking ticket catefory rate limit...ticketTypeCategory:', rateLimitKey);
                        yield tickeTypeCategoryRateLimitService.lock(rateLimitKey);
                        debug('ticket catefory rate limit locked');
                    }
                }
            })));
        }
    });
}
exports.processLockTicketTypeCategoryRateLimit = processLockTicketTypeCategoryRateLimit;
function processUnlockTicketTypeCategoryRateLimit(reservationModel, req) {
    return __awaiter(this, void 0, void 0, function* () {
        // パフォーマンスは指定済みのはず
        if (reservationModel.transactionInProgress.performance !== undefined) {
            const tickeTypeCategoryRateLimitService = new tttsapi.service.TicketTypeCategoryRateLimit({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            // 車椅子レート制限解放
            const performanceStartDate = moment(reservationModel.transactionInProgress.performance.startDate)
                .toDate();
            yield Promise.all(reservationModel.transactionInProgress.ticketTypes.map((ticketType) => __awaiter(this, void 0, void 0, function* () {
                if (ticketType.count > 0) {
                    let ticketTypeCategory = tttsapi.factory.ticketTypeCategory.Normal;
                    if (Array.isArray(ticketType.additionalProperty)) {
                        const categoryProperty = ticketType.additionalProperty.find((p) => p.name === 'category');
                        if (categoryProperty !== undefined) {
                            ticketTypeCategory = categoryProperty.value;
                        }
                    }
                    if (ticketTypeCategory === tttsapi.factory.ticketTypeCategory.Wheelchair) {
                        const rateLimitKey = {
                            performanceStartDate: performanceStartDate,
                            ticketTypeCategory: ticketTypeCategory,
                            holder: reservationModel.transactionInProgress.id
                        };
                        debug('unlocking ticket catefory rate limit...ticketTypeCategory:', rateLimitKey);
                        yield tickeTypeCategoryRateLimitService.unlock(rateLimitKey);
                        debug('ticket catefory rate limit unlocked');
                    }
                }
            })));
        }
    });
}
exports.processUnlockTicketTypeCategoryRateLimit = processUnlockTicketTypeCategoryRateLimit;
/**
 * 座席・券種確定プロセス/検証処理
 */
function checkFixSeatsAndTickets(__, req) {
    return __awaiter(this, void 0, void 0, function* () {
        const checkInfo = {
            status: false,
            choices: [],
            choicesAll: [],
            selectedCount: 0,
            extraCount: 0,
            message: ''
        };
        // 検証(券種が選択されていること)
        reserveTicketForm_1.default(req);
        const validationResult = yield req.getValidationResult();
        if (!validationResult.isEmpty()) {
            checkInfo.message = req.__('Invalid"');
            return checkInfo;
        }
        // 画面から座席選択情報が生成できなければエラー
        const choices = JSON.parse(req.body.choices);
        if (!Array.isArray(choices)) {
            checkInfo.message = req.__('UnexpectedError');
            return checkInfo;
        }
        checkInfo.choices = choices;
        // チケット枚数合計計算
        choices.forEach((choice) => {
            // チケットセット(選択枚数分)
            checkInfo.selectedCount += Number(choice.ticket_count);
            for (let index = 0; index < Number(choice.ticket_count); index += 1) {
                const choiceInfo = {
                    ticket_type: choice.ticket_type,
                    ticketCount: 1,
                    watcher_name: (typeof choice.watcher_name === 'string') ? choice.watcher_name : '',
                    choicesExtra: [],
                    updated: false
                };
                // 選択チケット本体分セット(選択枚数分)
                checkInfo.choicesAll.push(choiceInfo);
            }
        });
        checkInfo.status = true;
        return checkInfo;
    });
}
/**
 * 購入者情報確定プロセス
 */
function processFixProfile(reservationModel, req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        reserveProfileForm_1.default(req);
        const validationResult = yield req.getValidationResult();
        res.locals.validation = validationResult.mapped();
        res.locals.paymentMethod = req.body.paymentMethod;
        if (!validationResult.isEmpty()) {
            throw new Error(req.__('Invalid'));
        }
        // 購入者情報を保存して座席選択へ
        const contact = {
            lastName: req.staffUser.familyName,
            firstName: req.staffUser.givenName,
            tel: req.staffUser.telephone,
            email: req.staffUser.email,
            age: reservationModel.transactionInProgress.purchaser.age,
            address: reservationModel.transactionInProgress.purchaser.address,
            gender: reservationModel.transactionInProgress.purchaser.gender
        };
        reservationModel.transactionInProgress.purchaser = contact;
        reservationModel.transactionInProgress.paymentMethod = req.body.paymentMethod;
        const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
            endpoint: process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const profile = yield placeOrderTransactionService.setCustomerContact({
            id: reservationModel.transactionInProgress.id,
            object: {
                customerContact: {
                    age: contact.age,
                    address: contact.address,
                    email: contact.email,
                    gender: contact.gender,
                    givenName: contact.firstName,
                    familyName: contact.lastName,
                    telephone: contact.tel,
                    telephoneRegion: contact.address
                }
            }
        });
        debug('profile set.', profile);
        reservationModel.transactionInProgress.profile = profile;
        // セッションに購入者情報格納
        req.session.purchaser = contact;
    });
}
exports.processFixProfile = processFixProfile;
/**
 * パフォーマンスをFIXするプロセス
 * パフォーマンスIDから、パフォーマンスを検索し、その後プロセスに必要な情報をreservationModelに追加する
 */
function processFixPerformance(reservationModel, perfomanceId, req) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('fixing performance...', perfomanceId);
        // パフォーマンス取得
        const eventService = new tttsapi.service.Event({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const performance = yield eventService.findPerofrmanceById({ id: perfomanceId });
        // 券種セット
        if (performance.ticket_type_group !== undefined) {
            reservationModel.transactionInProgress.ticketTypes = performance.ticket_type_group.ticket_types.map((t) => {
                return Object.assign({}, t, { count: 0, watcher_name: '' }, { id: t.identifier });
            });
        }
        // パフォーマンス情報を保管
        reservationModel.transactionInProgress.performance = performance;
    });
}
exports.processFixPerformance = processFixPerformance;
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
