"use strict";
/**
 * 一般予約キャンセルコントローラー
 *
 * @namespace controller/customer/cancel
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
const conf = require("config");
const createDebug = require("debug");
const moment = require("moment");
const numeral = require("numeral");
const sendgrid = require("sendgrid");
const util = require("util");
const customerCancelForm_1 = require("../../forms/customer/customerCancelForm");
const debug = createDebug('chevre-frontend:controller:customerCancel');
/**
 * チケットキャンセル
 * @method index
 * @returns {Promise<void>}
 */
function index(req, res, __) {
    return __awaiter(this, void 0, void 0, function* () {
        // 返金期限
        // if (moment('2016-11-19T00:00:00+09:00') <= moment()) {
        //     res.render('customer/cancel/outOfTerm', { layout: false });
        //     return;
        // }
        if (req.method === 'POST') {
            customerCancelForm_1.default(req);
            const validationResult = yield req.getValidationResult();
            if (!validationResult.isEmpty()) {
                res.json({
                    success: false,
                    message: '購入番号または電話番号下4ケタに誤りがあります<br>There are some mistakes in a transaction number or last 4 digits of tel'
                });
                return;
            }
            try {
                // 予約を取得(クレジットカード決済のみ)
                const reservations = yield chevre_domain_1.Models.Reservation.find({
                    payment_no: req.body.paymentNo,
                    purchaser_tel: { $regex: `${req.body.last4DigitsOfTel}$` },
                    purchaser_group: chevre_domain_1.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
                    status: chevre_domain_1.ReservationUtil.STATUS_RESERVED
                }).exec();
                if (reservations.length === 0) {
                    res.json({
                        success: false,
                        message: '購入番号または電話番号下4ケタに誤りがあります<br>There are some mistakes in a transaction number or last 4 digits of tel'
                    });
                    return;
                }
                try {
                    yield validate(reservations);
                    const results = reservations.map((reservation) => {
                        return {
                            _id: reservation.get('_id'),
                            seat_code: reservation.get('seat_code'),
                            payment_no: reservation.get('payment_no'),
                            film_name: reservation.get('film_name'),
                            performance_start_str: reservation.get('performance_start_str'),
                            location_str: reservation.get('location_str'),
                            payment_method: reservation.get('payment_method'),
                            charge: reservation.get('charge')
                        };
                    });
                    res.json({
                        success: true,
                        message: null,
                        reservations: results
                    });
                    return;
                }
                catch (error) {
                    res.json({
                        success: false,
                        message: error.message
                    });
                    return;
                }
            }
            catch (error) {
                res.json({
                    success: false,
                    message: 'A system error has occurred. Please try again later. Sorry for the inconvenience'
                });
                return;
            }
        }
        else {
            res.locals.paymentNo = '';
            res.locals.last4DigitsOfTel = '';
            res.render('customer/cancel');
            return;
        }
    });
}
exports.index = index;
/**
 * 購入番号からキャンセルする
 */
// tslint:disable-next-line:max-func-body-length
function executeByPaymentNo(req, res, __) {
    return __awaiter(this, void 0, void 0, function* () {
        if (moment('2016-11-19T00:00:00+09:00') <= moment()) {
            res.json({
                success: false,
                message: 'Out of term'
            });
            return;
        }
        const paymentNo = req.body.paymentNo;
        const last4DigitsOfTel = req.body.last4DigitsOfTel;
        try {
            debug('finding reservations...');
            const reservations = yield chevre_domain_1.Models.Reservation.find({
                payment_no: paymentNo,
                purchaser_tel: { $regex: `${last4DigitsOfTel}$` },
                purchaser_group: chevre_domain_1.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
                status: chevre_domain_1.ReservationUtil.STATUS_RESERVED
            }).exec();
            debug('reservations found', reservations);
            if (reservations.length === 0) {
                res.json({
                    success: false,
                    message: '購入番号または電話番号下4ケタに誤りがあります There are some mistakes in a transaction number or last 4 digits of tel'
                });
                return;
            }
            try {
                yield validate(reservations);
            }
            catch (error) {
                res.json({
                    success: false,
                    message: error.message
                });
                return;
            }
            if (reservations[0].get('payment_method') === gmo_service_1.Util.PAY_TYPE_CREDIT) {
                debug('removing reservations by customer... payment_no:', paymentNo);
                yield chevre_domain_1.Models.Reservation.remove({
                    payment_no: paymentNo,
                    purchaser_tel: { $regex: `${last4DigitsOfTel}$` },
                    purchaser_group: chevre_domain_1.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
                    status: chevre_domain_1.ReservationUtil.STATUS_RESERVED
                }).exec();
                debug('reservations removed by customer', 'payment_no:', paymentNo);
                // キャンセルリクエスト保管
                debug('creating CustomerCancelRequest...');
                yield chevre_domain_1.Models.CustomerCancelRequest.create({
                    payment_no: paymentNo,
                    payment_method: reservations[0].get('payment_method'),
                    email: reservations[0].get('purchaser_email'),
                    tel: reservations[0].get('purchaser_tel')
                });
                debug('CustomerCancelRequest created');
                // メール送信
                const to = reservations[0].get('purchaser_email');
                res.render('email/customer/cancel', {
                    layout: false,
                    to: to,
                    reservations: reservations,
                    moment: moment,
                    numeral: numeral,
                    conf: conf,
                    GMOUtil: gmo_service_1.Util,
                    ReservationUtil: chevre_domain_1.ReservationUtil
                }, (renderErr, text) => __awaiter(this, void 0, void 0, function* () {
                    debug('email rendered. text:', renderErr, text);
                    // メール失敗してもキャンセル成功
                    if (renderErr instanceof Error) {
                        res.json({ success: true, message: null });
                    }
                    else {
                        try {
                            debug('sending an email...');
                            yield sendEmail(to, text);
                            debug('an email sent');
                        }
                        catch (error) {
                            // メールが送れなくてもキャンセルは成功
                        }
                        res.json({
                            success: true,
                            message: null
                        });
                    }
                }));
            }
            else if (reservations[0].get('payment_method') === gmo_service_1.Util.PAY_TYPE_CVS) {
                // コンビニ決済の場合
                res.json({
                    success: false,
                    message: 'A system error has occurred. Please try again later. Sorry for the inconvenience'
                });
            }
            else {
                res.json({
                    success: false,
                    message: 'A system error has occurred. Please try again later. Sorry for the inconvenience'
                });
            }
        }
        catch (error) {
            res.json({
                success: false,
                message: 'A system error has occurred. Please try again later. Sorry for the inconvenience'
            });
        }
    });
}
exports.executeByPaymentNo = executeByPaymentNo;
/**
 * キャンセル受付対象かどうか確認する
 *
 * @ignore
 */
function validate(reservations) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            // 入場済みの座席があるかどうか確認
            const notEntered = reservations.every((reservation) => (reservation.get('checked_in') !== true));
            if (!notEntered) {
                reject(new Error('キャンセル受付対象外の座席です。<br>The cancel for your tickets is not applicable'));
                return;
            }
            // 一次販売(15日)許可
            if (moment(reservations[0].get('purchased_at')) < moment('2016-10-16T00:00:00+09:00')) {
                resolve();
                return;
            }
            reject(new Error('キャンセル受付対象外の座席です。<br>The cancel for your tickets is not applicable'));
        });
    });
}
/**
 * メールを送信する
 *
 * @ignore
 */
function sendEmail(to, text) {
    return __awaiter(this, void 0, void 0, function* () {
        const subject = util.format('%s%s %s', (process.env.NODE_ENV !== 'production') ? `[${process.env.NODE_ENV}]` : '', 'CHEVRE_EVENT_NAMEチケット キャンセル完了のお知らせ', 'Notice of Completion of Cancel for CHEVRE Tickets');
        const mail = new sendgrid.mail.Mail(new sendgrid.mail.Email(conf.get('email.from'), conf.get('email.fromname')), subject, new sendgrid.mail.Email(to), new sendgrid.mail.Content('text/plain', text));
        const sg = sendgrid(process.env.SENDGRID_API_KEY);
        const request = sg.emptyRequest({
            host: 'api.sendgrid.com',
            method: 'POST',
            path: '/v3/mail/send',
            headers: {},
            body: mail.toJSON(),
            queryParams: {},
            test: false,
            port: ''
        });
        yield sg.API(request);
    });
}
