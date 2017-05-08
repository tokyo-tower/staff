"use strict";
/**
 * 当日窓口座席予約コントローラー
 *
 * @class controller/window/reserve
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
const chevre_domain_1 = require("@motionpicture/chevre-domain");
const gmo_service_1 = require("@motionpicture/gmo-service");
const moment = require("moment");
const _ = require("underscore");
const reservePerformanceForm_1 = require("../../forms/reserve/reservePerformanceForm");
const reserveSeatForm_1 = require("../../forms/reserve/reserveSeatForm");
const session_1 = require("../../models/reserve/session");
const reserveBaseController = require("../reserveBase");
const PURCHASER_GROUP = chevre_domain_1.ReservationUtil.PURCHASER_GROUP_WINDOW;
const layout = 'layouts/window/layout';
function start(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = yield reserveBaseController.processStart(PURCHASER_GROUP, req);
            reservationModel.save(req);
            if (reservationModel.performance !== undefined) {
                const cb = '/window/reserve/seats';
                res.redirect(`/window/reserve/terms?cb=${encodeURIComponent(cb)}`);
            }
            else {
                const cb = '/window/reserve/performances';
                res.redirect(`/window/reserve/terms?cb=${encodeURIComponent(cb)}`);
            }
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
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
                next(new Error(req.__('Message.Expired')));
                return;
            }
            if (req.method === 'POST') {
                reservePerformanceForm_1.default(req);
                const validationResult = yield req.getValidationResult();
                if (!validationResult.isEmpty()) {
                    next(new Error(req.__('Message.UnexpectedError')));
                    return;
                }
                try {
                    // パフォーマンスFIX
                    yield reserveBaseController.processFixPerformance(reservationModel, req.body.performanceId, req);
                    reservationModel.save(req);
                    res.redirect('/window/reserve/seats');
                }
                catch (error) {
                    next(error);
                }
            }
            else {
                // 仮予約あればキャンセルする
                try {
                    yield reserveBaseController.processCancelSeats(reservationModel);
                    reservationModel.save(req);
                    res.render('window/reserve/performances', {
                        FilmUtil: chevre_domain_1.FilmUtil,
                        layout: layout
                    });
                }
                catch (error) {
                    next(error);
                }
            }
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.performances = performances;
/**
 * 座席選択
 */
function seats(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Message.Expired')));
                return;
            }
            const limit = reservationModel.getSeatsLimit();
            if (req.method === 'POST') {
                reserveSeatForm_1.default(req);
                const validationResult = yield req.getValidationResult();
                if (!validationResult.isEmpty()) {
                    res.redirect('/window/reserve/seats');
                    return;
                }
                const seatCodes = JSON.parse(req.body.seatCodes);
                // 追加指定席を合わせて制限枚数を超過した場合
                if (seatCodes.length > limit) {
                    const message = req.__('Message.seatsLimit{{limit}}', { limit: limit.toString() });
                    res.redirect(`/window/reserve/seats?message=${encodeURIComponent(message)}`);
                    return;
                }
                // 仮予約あればキャンセルする
                yield reserveBaseController.processCancelSeats(reservationModel);
                try {
                    // 座席FIX
                    yield reserveBaseController.processFixSeats(reservationModel, seatCodes, req);
                    reservationModel.save(req);
                    // 券種選択へ
                    res.redirect('/window/reserve/tickets');
                }
                catch (error) {
                    reservationModel.save(req);
                    const message = req.__('Message.SelectedSeatsUnavailable');
                    res.redirect(`/window/reserve/seats?message=${encodeURIComponent(message)}`);
                    return;
                }
            }
            else {
                res.render('window/reserve/seats', {
                    reservationModel: reservationModel,
                    limit: limit,
                    layout: layout
                });
                return;
            }
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
    });
}
exports.seats = seats;
/**
 * 券種選択
 */
function tickets(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Message.Expired')));
                return;
            }
            reservationModel.paymentMethod = '';
            if (req.method === 'POST') {
                try {
                    yield reserveBaseController.processFixTickets(reservationModel, req);
                    reservationModel.save(req);
                    res.redirect('/window/reserve/profile');
                }
                catch (error) {
                    res.redirect('/window/reserve/tickets');
                }
            }
            else {
                res.render('window/reserve/tickets', {
                    reservationModel: reservationModel,
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
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
                next(new Error(req.__('Message.Expired')));
                return;
            }
            if (req.method === 'POST') {
                try {
                    yield reserveBaseController.processFixProfile(reservationModel, req, res);
                    yield reserveBaseController.processAllExceptConfirm(reservationModel, req);
                    reservationModel.save(req);
                    res.redirect('/window/reserve/confirm');
                }
                catch (error) {
                    res.render('window/reserve/profile', {
                        reservationModel: reservationModel,
                        layout: layout
                    });
                }
            }
            else {
                // セッションに情報があれば、フォーム初期値設定
                const email = reservationModel.purchaser.email;
                res.locals.lastName = reservationModel.purchaser.lastName;
                res.locals.firstName = reservationModel.purchaser.firstName;
                res.locals.tel = reservationModel.purchaser.tel;
                res.locals.age = reservationModel.purchaser.age;
                res.locals.address = reservationModel.purchaser.address;
                res.locals.gender = reservationModel.purchaser.gender;
                res.locals.email = (!_.isEmpty(email)) ? email : '';
                res.locals.emailConfirm = (!_.isEmpty(email)) ? email.substr(0, email.indexOf('@')) : '';
                res.locals.emailConfirmDomain = (!_.isEmpty(email)) ? email.substr(email.indexOf('@') + 1) : '';
                res.locals.paymentMethod = gmo_service_1.Util.PAY_TYPE_CREDIT;
                if (!_.isEmpty(reservationModel.paymentMethod)) {
                    res.locals.paymentMethod = reservationModel.paymentMethod;
                }
                res.render('window/reserve/profile', {
                    reservationModel: reservationModel,
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.profile = profile;
/**
 * 予約内容確認
 */
function confirm(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Message.Expired')));
                return;
            }
            if (req.method === 'POST') {
                try {
                    // 仮押さえ有効期限チェック
                    if (reservationModel.expiredAt !== undefined && reservationModel.expiredAt < moment().valueOf()) {
                        throw new Error(req.__('Message.Expired'));
                    }
                    // 予約確定
                    yield reserveBaseController.processFixReservations(reservationModel.performance.day, reservationModel.paymentNo, {}, res);
                    session_1.default.REMOVE(req);
                    res.redirect(`/window/reserve/${reservationModel.performance.day}/${reservationModel.paymentNo}/complete`);
                }
                catch (error) {
                    session_1.default.REMOVE(req);
                    next(error);
                }
            }
            else {
                res.render('window/reserve/confirm', {
                    reservationModel: reservationModel,
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.confirm = confirm;
/**
 * 予約完了
 */
function complete(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.windowUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        try {
            const reservations = yield chevre_domain_1.Models.Reservation.find({
                performance_day: req.params.performanceDay,
                payment_no: req.params.paymentNo,
                status: chevre_domain_1.ReservationUtil.STATUS_RESERVED,
                window: req.windowUser.get('_id'),
                purchased_at: {
                    $gt: moment().add(-30, 'minutes').toISOString() // tslint:disable-line:no-magic-numbers
                }
            }).exec();
            if (reservations.length === 0) {
                next(new Error(req.__('Message.NotFound')));
                return;
            }
            reservations.sort((a, b) => {
                return chevre_domain_1.ScreenUtil.sortBySeatCode(a.get('seat_code'), b.get('seat_code'));
            });
            res.render('window/reserve/complete', {
                reservationDocuments: reservations,
                layout: layout
            });
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.complete = complete;
