"use strict";
/**
 * GMO関連予約コントローラー
 * 座席予約フローのうちGMOと連携するアクションを実装しています。
 *
 * @namespace controller/customer/reserve/gmo
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
const createDebug = require("debug");
const moment = require("moment");
const querystring = require("querystring");
const _ = require("underscore");
const util = require("util");
const result_1 = require("../../../models/gmo/result");
const session_1 = require("../../../models/reserve/session");
const gmoReserveCvsController = require("./gmo/cvs");
const debug = createDebug('chevre-frontend:controller:gmoReserve');
/**
 * マルチバイト文字列対応String.substr
 *
 * @params {number} start
 * @params {number} length
 */
String.prototype.mbSubstr = function (start, length) {
    // tslint:disable-next-line:no-invalid-this
    const letters = this.split('');
    const textLength = letters.length;
    let count = 0;
    let result = '';
    // todo 文字列のループはこの書き方は本来よろしくないので、暇があったら直す
    // tslint:disable-next-line:no-increment-decrement
    for (let i = 0; i < textLength; i++) {
        if (i + start > textLength - 1) {
            break;
        }
        // マルチバイト文字列かどうか
        const letter = letters[i + start];
        // tslint:disable-next-line:no-magic-numbers
        count += (querystring.escape(letter).length < 4) ? 1 : 2;
        if (count > length) {
            break;
        }
        result += letter;
    }
    return result;
};
/**
 * GMO決済を開始する
 */
function start(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Message.Expired')));
                return;
            }
            // 予約情報セッション削除
            session_1.default.REMOVE(req);
            // GMOへ遷移画面
            // 作品名から、特定文字以外を取り除く
            const filmNameFullWidth = chevre_domain_1.CommonUtil.toFullWidth(reservationModel.performance.film.name.ja);
            const filmNameFullWidthLength = filmNameFullWidth.length;
            let registerDisp1 = '';
            // todo 文字列のループはこの書き方は本来よろしくないので、暇があったら直す
            // tslint:disable-next-line:no-increment-decrement
            for (let i = 0; i < filmNameFullWidthLength; i++) {
                const letter = filmNameFullWidth[i];
                if (/[Ａ-Ｚａ-ｚ０-９]/.test(letter) ||
                    /[\u3040-\u309F]/.test(letter) ||
                    /[\u30A0-\u30FF]/.test(letter) ||
                    /[一-龠]/.test(letter) // 漢字
                ) {
                    registerDisp1 += letter;
                }
            }
            // tslint:disable-next-line:no-magic-numbers
            res.locals.registerDisp1 = registerDisp1.mbSubstr(0, 32);
            res.locals.registerDisp2 = chevre_domain_1.CommonUtil.toFullWidth(util.format('%s／%s／%s', reservationModel.performance.day.substr(0, 4), // tslint:disable-line:no-magic-numbers
            reservationModel.performance.day.substr(4, 2), // tslint:disable-line:no-magic-numbers
            reservationModel.performance.day.substr(6) // tslint:disable-line:no-magic-numbers
            ));
            res.locals.registerDisp3 = chevre_domain_1.CommonUtil.toFullWidth(reservationModel.performance.theater.name.ja);
            res.locals.registerDisp4 = chevre_domain_1.CommonUtil.toFullWidth(util.format('開場%s:%s　開演%s:%s', reservationModel.performance.open_time.substr(0, 2), // tslint:disable-line:no-magic-numbers
            reservationModel.performance.open_time.substr(2), // tslint:disable-line:no-magic-numbers
            reservationModel.performance.start_time.substr(0, 2), // tslint:disable-line:no-magic-numbers
            reservationModel.performance.start_time.substr(2) // tslint:disable-line:no-magic-numbers
            ));
            res.locals.shopId = process.env.GMO_SHOP_ID;
            res.locals.orderID = reservationModel.transactionGMO.orderId;
            res.locals.reserveNo = reservationModel.paymentNo;
            res.locals.amount = reservationModel.getTotalCharge().toString();
            res.locals.dateTime = moment(reservationModel.purchasedAt).format('YYYYMMDDHHmmss');
            res.locals.useCredit = (reservationModel.paymentMethod === gmo_service_1.Util.PAY_TYPE_CREDIT) ? '1' : '0';
            res.locals.useCvs = (reservationModel.paymentMethod === gmo_service_1.Util.PAY_TYPE_CVS) ? '1' : '0';
            res.locals.shopPassString = gmo_service_1.Util.createShopPassString({
                shopId: process.env.GMO_SHOP_ID,
                shopPass: process.env.GMO_SHOP_PASS,
                orderId: res.locals.orderID,
                amount: reservationModel.getTotalCharge(),
                dateTime: res.locals.dateTime
            });
            res.locals.retURL = util.format('%s%s?locale=%s', process.env.FRONTEND_GMO_RESULT_ENDPOINT, '/customer/reserve/gmo/result', req.getLocale());
            // 決済キャンセル時に遷移する加盟店URL
            res.locals.cancelURL = util.format('%s%s?locale=%s', process.env.FRONTEND_GMO_RESULT_ENDPOINT, `/customer/reserve/gmo/${res.locals.orderID}/cancel`, req.getLocale());
            debug('redirecting to GMO payment...');
            // GMOへの送信データをログに残すために、一度htmlを取得してからrender
            res.render('customer/reserve/gmo/start');
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.start = start;
/**
 * GMOからの結果受信
 * GMOで何かしらエラーが発生して「決済をやめる」ボタンから遷移してくることもある
 */
function result(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        const gmoResultModel = result_1.default.parse(req.body);
        debug('gmoResultModel:', gmoResultModel);
        // エラー結果の場合
        if (!_.isEmpty(gmoResultModel.ErrCode)) {
            try {
                debug('finding reservations...');
                const reservations = yield chevre_domain_1.Models.Reservation.find({
                    gmo_order_id: gmoResultModel.OrderID
                }, 'purchased_at').exec();
                debug('reservations found.', reservations.length);
                if (reservations.length === 0) {
                    next(new Error(req.__('Message.NotFound')));
                    return;
                }
                // 特に何もしない
                res.render('customer/reserve/gmo/cancel');
            }
            catch (error) {
                next(new Error(req.__('Message.UnexpectedError')));
            }
        }
        else {
            // 決済方法によって振り分け
            switch (gmoResultModel.PayType) {
                case gmo_service_1.Util.PAY_TYPE_CVS:
                    debug('starting GMOReserveCsvController.result...');
                    yield gmoReserveCvsController.result(gmoResultModel, req, res, next);
                    break;
                default:
                    next(new Error(req.__('Message.UnexpectedError')));
                    break;
            }
        }
    });
}
exports.result = result;
/**
 * 決済キャンセル時に遷移
 */
function cancel(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('start process GMOReserveController.cancel.');
        try {
            debug('finding reservations...', req.params.orderId);
            const reservations = yield chevre_domain_1.Models.Reservation.find({
                gmo_order_id: req.params.orderId,
                status: chevre_domain_1.ReservationUtil.STATUS_WAITING_SETTLEMENT // GMO決済離脱組の処理なので、必ず決済中ステータスになっている
            }).exec();
            debug('reservations found.', reservations);
            if (reservations.length === 0) {
                next(new Error(req.__('Message.NotFound')));
                return;
            }
            // 特に何もしない
            res.render('customer/reserve/gmo/cancel');
        }
        catch (error) {
            console.error(error);
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.cancel = cancel;
