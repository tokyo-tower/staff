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
const CODE_EXPIRES_IN_SECONDS = 60; // その場で使用するだけなので短くてよし
/**
 * QRコード認証画面
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
 * いったん予約キャッシュを廃止してみる
 */
function getReservations(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // const now = moment();
            if (req.staffUser === undefined) {
                throw new Error('checkinAdminUser not defined.');
            }
            // 予約を検索
            // const tttsReservationService = new tttsapi.service.Reservation({
            //     endpoint: <string>process.env.API_ENDPOINT,
            //     auth: req.tttsAuthClient
            // });
            // const searchReservationsResult = await tttsReservationService.search({
            //     limit: 100,
            //     typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
            //     reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed],
            //     reservationFor: {
            //         id: ((typeof req.body.performanceId === 'number' || typeof req.body.performanceId === 'string')
            //             && String(req.body.performanceId).length > 0)
            //             ? String(req.body.performanceId)
            //             : undefined,
            //         startThrough: now.add(1, 'second').toDate(),
            //         ...{ endFrom: now.toDate() }
            //     },
            //     ...{
            //         noTotalCount: '1'
            //     }
            // });
            // const reservations = searchReservationsResult.data.map(chevreReservation2ttts);
            const reservationsById = {};
            const reservationIdsByQrStr = {};
            // reservations.forEach((reservation) => {
            //     reservationsById[reservation.id] = reservation;
            //     reservationIdsByQrStr[reservation.id] = reservation.id;
            // });
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
            const reservationService = new cinerinoapi.service.Reservation({
                endpoint: process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const searchReservationsResult = yield reservationService.search({
                typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
                id: { $eq: req.params.qr }
            });
            const reservation = searchReservationsResult.data.shift();
            if (reservation === undefined) {
                throw new cinerinoapi.factory.errors.NotFound('Reservation');
            }
            // const tttsReservationService = new tttsapi.service.Reservation({
            //     endpoint: <string>process.env.API_ENDPOINT,
            //     auth: req.tttsAuthClient
            // });
            // const reservation = await tttsReservationService.findById({ id: req.params.qr });
            if (reservation.reservationStatus !== tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed) {
                res.status(http_status_1.NOT_FOUND)
                    .json(null);
                return;
            }
            // 予約使用アクション検索
            const searchUseActionsResult = yield reservationService.searchUseActions({
                object: { id: reservation.id }
            });
            const checkins = searchUseActionsResult.data
                .filter((action) => {
                var _a;
                const agentIdentifier = action.agent.identifier;
                return Array.isArray(agentIdentifier)
                    && typeof ((_a = agentIdentifier.find((p) => p.name === 'when')) === null || _a === void 0 ? void 0 : _a.value) === 'string';
            })
                .map((action) => {
                var _a, _b, _c, _d;
                const agentIdentifier = action.agent.identifier;
                let when = '';
                let where;
                let why;
                let how;
                if (Array.isArray(agentIdentifier)) {
                    when = (_a = agentIdentifier.find((p) => p.name === 'when')) === null || _a === void 0 ? void 0 : _a.value;
                    where = (_b = agentIdentifier.find((p) => p.name === 'where')) === null || _b === void 0 ? void 0 : _b.value;
                    why = (_c = agentIdentifier.find((p) => p.name === 'why')) === null || _c === void 0 ? void 0 : _c.value;
                    how = (_d = agentIdentifier.find((p) => p.name === 'how')) === null || _d === void 0 ? void 0 : _d.value;
                }
                return {
                    when: moment(when)
                        .toDate(),
                    where: (typeof where === 'string') ? where : '',
                    why: (typeof why === 'string') ? why : '',
                    how: (typeof how === 'string') ? how : '',
                    id: action.id
                };
            });
            res.json(reservation_1.chevreReservation2ttts(Object.assign(Object.assign({}, reservation), { checkins })));
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
            const reservationId = req.params.qr;
            // 予約取得
            const reservationService = new cinerinoapi.service.Reservation({
                endpoint: process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const searchReservationsResult = yield reservationService.search({
                typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
                id: { $eq: reservationId }
            });
            const reservation = searchReservationsResult.data.shift();
            if (reservation === undefined) {
                throw new cinerinoapi.factory.errors.NotFound('Reservation');
            }
            // Cinerinoで、req.body.codeを使用して予約使用
            let token;
            let code = req.body.code;
            // コードの指定がなければ注文コードを発行
            if (typeof code !== 'string' || code.length === 0) {
                code = yield publishCode(req, reservation);
            }
            if (typeof code === 'string' && code.length > 0) {
                try {
                    // getToken
                    const tokenService = new cinerinoapi.service.Token({
                        endpoint: process.env.CINERINO_API_ENDPOINT,
                        auth: req.tttsAuthClient
                    });
                    const getTokenResult = yield tokenService.getToken({ code });
                    token = getTokenResult.token;
                }
                catch (error) {
                    // tslint:disable-next-line:no-console
                    console.error('getToken failed', error);
                    // throw new Error('トークンを発行できませんでした');
                }
            }
            const checkin = Object.assign({ when: moment(req.body.when).toDate(), where: req.body.where, why: '', how: req.body.how }, (typeof token === 'string') ? { instrument: { token } } : undefined);
            const tttsReservationService = new tttsapi.service.Reservation({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            yield tttsReservationService.addCheckin({
                reservationId: reservationId,
                checkin: checkin
            });
            // 入場済予約リスト更新
            yield updateCheckedReservations(req, reservation);
            res.status(http_status_1.CREATED)
                .json(checkin);
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR)
                .json({
                error: 'チェックイン情報作成失敗',
                message: error.message
            });
        }
    });
}
exports.addCheckIn = addCheckIn;
function publishCode(req, reservation) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
        let code;
        try {
            const orderNumber = (_c = (_b = (_a = reservation.underName) === null || _a === void 0 ? void 0 : _a.identifier) === null || _b === void 0 ? void 0 : _b.find((p) => p.name === 'orderNumber')) === null || _c === void 0 ? void 0 : _c.value;
            const telephone = (_d = reservation.underName) === null || _d === void 0 ? void 0 : _d.telephone;
            if (typeof orderNumber === 'string' && typeof telephone === 'string') {
                const orderService = new cinerinoapi.service.Order({
                    endpoint: process.env.CINERINO_API_ENDPOINT,
                    auth: req.tttsAuthClient
                });
                const authorizeOrderResult = yield orderService.authorize({
                    object: {
                        orderNumber,
                        customer: { telephone }
                    },
                    result: {
                        expiresInSeconds: CODE_EXPIRES_IN_SECONDS
                    }
                });
                code = authorizeOrderResult.code;
            }
        }
        catch (error) {
            // tslint:disable-next-line:no-console
            console.error('authorize order failed', error);
        }
        return code;
    });
}
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
                res.status(http_status_1.BAD_REQUEST)
                    .json({
                    error: 'チェックイン取り消し失敗',
                    message: 'Invalid request.'
                });
                return;
            }
            const reservationId = req.params.qr;
            // 予約取得
            const reservationService = new cinerinoapi.service.Reservation({
                endpoint: process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const searchReservationsResult = yield reservationService.search({
                typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
                id: { $eq: reservationId }
            });
            const reservation = searchReservationsResult.data.shift();
            if (reservation === undefined) {
                throw new cinerinoapi.factory.errors.NotFound('Reservation');
            }
            const tttsReservationService = new tttsapi.service.Reservation({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            yield tttsReservationService.cancelCheckin({
                reservationId: reservationId,
                when: moment(req.body.when)
                    .toDate()
            });
            // 入場済予約リスト更新
            yield updateCheckedReservations(req, reservation);
            res.status(http_status_1.NO_CONTENT)
                .end();
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR)
                .json({
                error: 'チェックイン取り消し失敗',
                message: error.message
            });
        }
    });
}
exports.removeCheckIn = removeCheckIn;
function updateCheckedReservations(req, reservation) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 予約取得
            const reservationService = new cinerinoapi.service.Reservation({
                endpoint: process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            // 入場済予約検索
            const searchReservationsResult4event = yield reservationService.search({
                limit: 100,
                typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
                reservationStatuses: [cinerinoapi.factory.chevre.reservationStatusType.ReservationConfirmed],
                reservationFor: { id: reservation.reservationFor.id }
            });
            const checkedReservations = searchReservationsResult4event.data
                .filter((r) => r.useActionExists === true)
                .map((r) => {
                return { id: String(r.id) };
            });
            const performanceService = new tttsapi.service.Event({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            yield performanceService.updateExtension(Object.assign({ id: reservation.reservationFor.id }, {
                checkedReservations
            }));
        }
        catch (error) {
            // tslint:disable-next-line:no-console
            console.error('updateCheckedReservations failed', error);
        }
    });
}
