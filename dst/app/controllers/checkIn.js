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
exports.removeCheckIn = exports.addCheckIn = exports.getReservation = exports.getReservations = exports.confirmTest = exports.confirm = void 0;
/**
 * 入場コントローラー
 * 上映当日入場画面から使う機能はここにあります。
 */
const cinerinoapi = require("@cinerino/sdk");
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
// tslint:disable-next-line:ordered-imports
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const reservation_1 = require("../util/reservation");
const authClient = new cinerinoapi.auth.ClientCredentials({
    domain: process.env.API_AUTHORIZE_SERVER_DOMAIN,
    clientId: process.env.API_CLIENT_ID_CLIENT_CREDENTIALS,
    clientSecret: process.env.API_CLIENT_SECRET_CLIENT_CREDENTIALS,
    scopes: [],
    state: ''
});
const tokenService = new cinerinoapi.service.Token({
    endpoint: process.env.CINERINO_API_ENDPOINT,
    auth: authClient
});
const reservationService = new cinerinoapi.service.Reservation({
    endpoint: process.env.CINERINO_API_ENDPOINT,
    auth: authClient
});
/**
 * QRコード認証画面
 * @desc Rコードを読み取って結果を表示するための画面
 */
function confirm(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req === null) {
            next(new Error('unexepected error'));
        }
        try {
            res.render('checkIn/confirm', {
                checkinAdminUser: req.staffUser,
                layout: 'layouts/checkIn/layout',
                pageId: 'page_checkin_confirm',
                pageClassName: 'page-checkin page-confirm'
            });
        }
        catch (error) {
            next(new Error('unexepected error'));
        }
    });
}
exports.confirm = confirm;
// for kusunose test
function confirmTest(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (req === null) {
                next(new Error('unexepected error'));
            }
            res.render('checkIn/confirmTest', {
                checkinAdminUser: req.staffUser,
                layout: 'layouts/checkIn/layout',
                pageId: 'page_checkin_confirm',
                pageClassName: 'page-checkin page-confirm'
            });
        }
        catch (error) {
            next(new Error('unexepected error'));
        }
    });
}
exports.confirmTest = confirmTest;
/**
 * 予約情報取得
 */
function getReservations(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const now = moment();
            if (req.staffUser === undefined) {
                throw new Error('checkinAdminUser not defined.');
            }
            // 予約を検索
            const tttsReservationService = new tttsapi.service.Reservation({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const searchReservationsResult = yield tttsReservationService.search(Object.assign({ limit: 100, typeOf: tttsapi.factory.chevre.reservationType.EventReservation, reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed], reservationFor: Object.assign({ id: ((typeof req.body.performanceId === 'number' || typeof req.body.performanceId === 'string')
                        && String(req.body.performanceId).length > 0)
                        ? String(req.body.performanceId)
                        : undefined, startThrough: now.add(1, 'second').toDate() }, { endFrom: now.toDate() }) }, {
                noTotalCount: '1'
            }));
            const reservations = searchReservationsResult.data.map(reservation_1.chevreReservation2ttts);
            const reservationsById = {};
            const reservationIdsByQrStr = {};
            reservations.forEach((reservation) => {
                reservationsById[reservation.id] = reservation;
                reservationIdsByQrStr[reservation.id] = reservation.id;
            });
            res.json({
                error: null,
                reservationsById: reservationsById,
                reservationIdsByQrStr: reservationIdsByQrStr
            });
        }
        catch (error) {
            res.json({
                error: '予約情報取得失敗'
            });
        }
    });
}
exports.getReservations = getReservations;
/**
 * 予約情報取得
 */
function getReservation(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            throw new Error('checkinAdminUser not defined.');
        }
        if (!req.staffUser.isAuthenticated()) {
            throw new Error('checkinAdminUser not authenticated.');
        }
        try {
            const tttsReservationService = new tttsapi.service.Reservation({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const reservation = yield tttsReservationService.findById({ id: req.params.qr });
            if (reservation.reservationStatus !== tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed) {
                res.status(http_status_1.NOT_FOUND).json(null);
            }
            else {
                res.json(reservation_1.chevreReservation2ttts(reservation));
            }
        }
        catch (error) {
            if (error.code === http_status_1.NOT_FOUND) {
                res.status(http_status_1.NOT_FOUND).json(null);
                return;
            }
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                error: '予約情報取得失敗',
                message: error
            });
        }
    });
}
exports.getReservation = getReservation;
/**
 * チェックイン作成
 */
function addCheckIn(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (req.staffUser === undefined) {
                throw new Error('checkinAdminUser not defined.');
            }
            if (!req.staffUser.isAuthenticated()) {
                throw new Error('checkinAdminUser not authenticated.');
            }
            if (!req.body.when || !req.body.where || !req.body.how) {
                res.status(http_status_1.BAD_REQUEST).json({
                    error: 'チェックイン情報作成失敗',
                    message: 'Invalid checkin.'
                });
                return;
            }
            const checkin = {
                when: moment(req.body.when).toDate(),
                where: req.body.where,
                why: '',
                how: req.body.how
            };
            const reservationId = req.params.qr;
            const tttsReservationService = new tttsapi.service.Reservation({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            yield tttsReservationService.addCheckin({
                reservationId: reservationId,
                checkin: checkin
            });
            // Cinerinoで、req.body.codeを使用して予約使用
            const code = req.body.code;
            if (typeof code === 'string' && code.length > 0) {
                try {
                    // getToken
                    const { token } = yield tokenService.getToken({ code });
                    // 予約使用
                    yield reservationService.useByToken(Object.assign({ object: { id: reservationId }, instrument: { token } }, {
                        location: { identifier: checkin.where }
                    }));
                }
                catch (error) {
                    // tslint:disable-next-line:no-console
                    console.error('useByToken failed', error);
                }
            }
            res.status(http_status_1.CREATED).json(checkin);
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                error: 'チェックイン情報作成失敗',
                message: error.message
            });
        }
    });
}
exports.addCheckIn = addCheckIn;
/**
 * チェックイン取り消し
 */
function removeCheckIn(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (req.staffUser === undefined) {
                throw new Error('checkinAdminUser not defined.');
            }
            if (!req.staffUser.isAuthenticated()) {
                throw new Error('checkinAdminUser not authenticated.');
            }
            if (!req.body.when) {
                res.status(http_status_1.BAD_REQUEST).json({
                    error: 'チェックイン取り消し失敗',
                    message: 'Invalid request.'
                });
                return;
            }
            const tttsReservationService = new tttsapi.service.Reservation({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            yield tttsReservationService.cancelCheckin({
                reservationId: req.params.qr,
                when: moment(req.body.when).toDate()
            });
            res.status(http_status_1.NO_CONTENT).end();
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                error: 'チェックイン取り消し失敗',
                message: error.message
            });
        }
    });
}
exports.removeCheckIn = removeCheckIn;
