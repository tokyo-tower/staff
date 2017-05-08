"use strict";
/**
 * 内部関係者座席予約コントローラー
 *
 * @namespace controller/staff/reserve
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
const chevre = require("@motionpicture/chevre-domain");
const conf = require("config");
const moment = require("moment");
const _ = require("underscore");
const reservePerformanceForm_1 = require("../../forms/reserve/reservePerformanceForm");
const reserveSeatForm_1 = require("../../forms/reserve/reserveSeatForm");
const session_1 = require("../../models/reserve/session");
const reserveBaseController = require("../reserveBase");
const PURCHASER_GROUP = chevre.ReservationUtil.PURCHASER_GROUP_STAFF;
const layout = 'layouts/staff/layout';
function start(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        // 期限指定
        if (moment() < moment(conf.get('datetimes.reservation_start_staffs'))) {
            next(new Error(req.__('Message.OutOfTerm')));
            return;
        }
        try {
            const reservationModel = yield reserveBaseController.processStart(PURCHASER_GROUP, req);
            reservationModel.save(req);
            if (reservationModel.performance !== undefined) {
                const cb = '/staff/reserve/seats';
                res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
            }
            else {
                const cb = '/staff/reserve/performances';
                res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
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
 * @method performances
 * @returns {Promise<void>}
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
                    res.redirect('/staff/reserve/seats');
                    return;
                }
                catch (error) {
                    next(new Error(req.__('Message.UnexpectedError')));
                    return;
                }
            }
            else {
                // 仮予約あればキャンセルする
                yield processCancelSeats(reservationModel);
                reservationModel.save(req);
                res.render('staff/reserve/performances', {
                    FilmUtil: chevre.FilmUtil,
                    layout: layout
                });
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
            let reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Message.Expired')));
                return;
            }
            const limit = reservationModel.getSeatsLimit();
            if (req.method === 'POST') {
                reserveSeatForm_1.default(req);
                const validationResult = yield req.getValidationResult();
                if (!validationResult.isEmpty()) {
                    res.redirect('/staff/reserve/seats');
                    return;
                }
                reservationModel = reservationModel;
                const seatCodes = JSON.parse(req.body.seatCodes);
                // 追加指定席を合わせて制限枚数を超過した場合
                if (seatCodes.length > limit) {
                    const message = req.__('Message.seatsLimit{{limit}}', { limit: limit.toString() });
                    res.redirect(`/staff/reserve/seats?message=${encodeURIComponent(message)}`);
                    return;
                }
                // 仮予約あればキャンセルする
                yield processCancelSeats(reservationModel);
                try {
                    // 座席FIX
                    yield processFixSeats(reservationModel, seatCodes, req);
                    reservationModel.save(req);
                    // 券種選択へ
                    res.redirect('/staff/reserve/tickets');
                    return;
                }
                catch (error) {
                    reservationModel.save(req);
                    const message = req.__('Message.SelectedSeatsUnavailable');
                    res.redirect(`/staff/reserve/seats?message=${encodeURIComponent(message)}`);
                    return;
                }
            }
            else {
                res.render('staff/reserve/seats', {
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
            if (req.method === 'POST') {
                try {
                    yield reserveBaseController.processFixTickets(reservationModel, req);
                    reservationModel.save(req);
                    res.redirect('/staff/reserve/profile');
                }
                catch (error) {
                    res.redirect('/staff/reserve/tickets');
                }
            }
            else {
                res.render('staff/reserve/tickets', {
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
 * 購入者情報(スキップ)
 */
function profile(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Message.Expired')));
                return;
            }
            yield reserveBaseController.processAllExceptConfirm(reservationModel, req);
            res.redirect('/staff/reserve/confirm');
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
                    res.redirect(`/staff/reserve/${reservationModel.performance.day}/${reservationModel.paymentNo}/complete`);
                }
                catch (error) {
                    session_1.default.REMOVE(req);
                    next(error);
                }
            }
            else {
                res.render('staff/reserve/confirm', {
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
function complete(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        try {
            const reservations = yield chevre.Models.Reservation.find({
                performance_day: req.params.performanceDay,
                payment_no: req.params.paymentNo,
                status: chevre.ReservationUtil.STATUS_RESERVED,
                staff: req.staffUser.get('_id'),
                purchased_at: {
                    $gt: moment().add(-30, 'minutes').toISOString() // tslint:disable-line:no-magic-numbers
                }
            }).exec();
            if (reservations.length === 0) {
                next(new Error(req.__('Message.NotFound')));
                return;
            }
            reservations.sort((a, b) => {
                return chevre.ScreenUtil.sortBySeatCode(a.get('seat_code'), b.get('seat_code'));
            });
            res.render('staff/reserve/complete', {
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
/**
 * 予約フロー中の座席をキャンセルするプロセス
 *
 * @override
 */
// tslint:disable-next-line:prefer-function-over-method
function processCancelSeats(reservationModel) {
    return __awaiter(this, void 0, void 0, function* () {
        const seatCodesInSession = (reservationModel.seatCodes !== undefined) ? reservationModel.seatCodes : [];
        if (seatCodesInSession.length === 0) {
            return;
        }
        // セッション中の予約リストを初期化
        reservationModel.seatCodes = [];
        // 仮予約をCHEVRE確保ステータスに戻す
        try {
            yield chevre.Models.Reservation.update({
                performance: reservationModel.performance._id,
                seat_code: { $in: seatCodesInSession },
                status: chevre.ReservationUtil.STATUS_TEMPORARY_ON_KEPT_BY_CHEVRE
            }, {
                $set: {
                    status: chevre.ReservationUtil.STATUS_KEPT_BY_CHEVRE
                },
                $unset: {
                    staff: ''
                }
            }, {
                multi: true
            }).exec();
            // 仮予約を空席ステータスに戻す
            yield chevre.Models.Reservation.remove({
                performance: reservationModel.performance._id,
                seat_code: { $in: seatCodesInSession },
                status: chevre.ReservationUtil.STATUS_TEMPORARY
            }).exec();
        }
        catch (error) {
            // 失敗したとしても時間経過で消えるので放置
        }
    });
}
exports.processCancelSeats = processCancelSeats;
/**
 * 座席をFIXするプロセス
 *
 * @override
 */
function processFixSeats(reservationModel, seatCodes, req) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            throw new Error(req.__('Message.UnexpectedError'));
        }
        const staffUser = req.staffUser;
        // セッション中の予約リストを初期化
        reservationModel.seatCodes = [];
        reservationModel.expiredAt = moment().add(conf.get('temporary_reservation_valid_period_seconds'), 'seconds').valueOf();
        // 新たな座席指定と、既に仮予約済みの座席コードについて
        const promises = seatCodes.map((seatCode) => __awaiter(this, void 0, void 0, function* () {
            const seatInfo = reservationModel.performance.screen.sections[0].seats.find((seat) => {
                return (seat.code === seatCode);
            });
            // 万が一、座席が存在しなかったら
            if (seatInfo === undefined) {
                throw new Error(req.__('Message.InvalidSeatCode'));
            }
            // 予約データを作成(同時作成しようとしたり、既に予約があったとしても、unique indexではじかれる)
            try {
                const reservation = yield chevre.Models.Reservation.create({
                    performance: reservationModel.performance._id,
                    seat_code: seatCode,
                    status: chevre.ReservationUtil.STATUS_TEMPORARY,
                    expired_at: reservationModel.expiredAt,
                    staff: staffUser.get('_id')
                });
                // ステータス更新に成功したらセッションに保管
                reservationModel.seatCodes.push(seatCode);
                reservationModel.setReservation(seatCode, {
                    _id: reservation.get('_id'),
                    status: reservation.get('status'),
                    seat_code: reservation.get('seat_code'),
                    seat_grade_name: seatInfo.grade.name,
                    seat_grade_additional_charge: seatInfo.grade.additional_charge,
                    ticket_type: '',
                    ticket_type_name: {
                        ja: '',
                        en: ''
                    },
                    ticket_type_charge: 0,
                    watcher_name: ''
                });
            }
            catch (error) {
                // CHEVRE確保からの仮予約を試みる
                const reservation = yield chevre.Models.Reservation.findOneAndUpdate({
                    performance: reservationModel.performance._id,
                    seat_code: seatCode,
                    status: chevre.ReservationUtil.STATUS_KEPT_BY_CHEVRE
                }, {
                    status: chevre.ReservationUtil.STATUS_TEMPORARY_ON_KEPT_BY_CHEVRE,
                    expired_at: reservationModel.expiredAt,
                    staff: staffUser.get('_id')
                }, {
                    new: true
                }).exec();
                if (reservation === null) {
                    throw new Error(req.__('Message.UnexpectedError'));
                }
                // ステータス更新に成功したらセッションに保管
                reservationModel.seatCodes.push(seatCode);
                reservationModel.setReservation(seatCode, {
                    _id: reservation.get('_id'),
                    status: reservation.get('status'),
                    seat_code: reservation.get('seat_code'),
                    seat_grade_name: seatInfo.grade.name,
                    seat_grade_additional_charge: seatInfo.grade.additional_charge,
                    ticket_type: '',
                    ticket_type_name: {
                        ja: '',
                        en: ''
                    },
                    ticket_type_charge: 0,
                    watcher_name: ''
                });
            }
        }));
        yield Promise.all(promises);
        // 座席コードのソート(文字列順に)
        reservationModel.seatCodes.sort(chevre.ScreenUtil.sortBySeatCode);
    });
}
exports.processFixSeats = processFixSeats;
