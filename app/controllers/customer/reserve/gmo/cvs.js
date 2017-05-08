"use strict";
/**
 * GMOコンビニ決済コントローラー
 *
 * @namespace controller/customer/reserve/gmo/cvs
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
const GMO = require("@motionpicture/gmo-service");
const conf = require("config");
const crypto = require("crypto");
const createDebug = require("debug");
const moment = require("moment");
const numeral = require("numeral");
const util = require("util");
const debug = createDebug('chevre-frontend:controller:gmo:reserve:cvs');
/**
 * GMOからの結果受信
 */
function result(gmoResultModel, req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        // 内容の整合性チェック
        let reservations = [];
        try {
            debug('finding reservations...:');
            reservations = yield chevre_domain_1.Models.Reservation.find({
                gmo_order_id: gmoResultModel.OrderID
            }, '_id performance_day payment_no').exec();
            debug('reservations found.', reservations.length);
            if (reservations.length === 0) {
                throw new Error(req.__('Message.UnexpectedError'));
            }
            // チェック文字列
            // 8 ＋ 23 ＋ 24 ＋ 25 ＋ 39 + 14 ＋ショップパスワード
            const data2cipher = util.format('%s%s%s%s%s%s%s', gmoResultModel.OrderID, gmoResultModel.CvsCode, gmoResultModel.CvsConfNo, gmoResultModel.CvsReceiptNo, gmoResultModel.PaymentTerm, gmoResultModel.TranDate, process.env.GMO_SHOP_PASS);
            const checkString = crypto.createHash('md5').update(data2cipher, 'utf8').digest('hex');
            debug('CheckString must be ', checkString);
            if (checkString !== gmoResultModel.CheckString) {
                throw new Error(req.__('Message.UnexpectedError'));
            }
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        try {
            debug('updating reservations by paymentNo...', gmoResultModel.OrderID);
            const raw = yield chevre_domain_1.Models.Reservation.update({
                gmo_order_id: gmoResultModel.OrderID
            }, {
                gmo_shop_id: gmoResultModel.ShopID,
                gmo_amount: gmoResultModel.Amount,
                gmo_tax: gmoResultModel.Tax,
                gmo_cvs_code: gmoResultModel.CvsCode,
                gmo_cvs_conf_no: gmoResultModel.CvsConfNo,
                gmo_cvs_receipt_no: gmoResultModel.CvsReceiptNo,
                gmo_cvs_receipt_url: gmoResultModel.CvsReceiptUrl,
                gmo_payment_term: gmoResultModel.PaymentTerm
            }, { multi: true }).exec();
            debug('reservations updated.', raw);
        }
        catch (error) {
            next(new Error(req.__('Message.ReservationNotCompleted')));
            return;
        }
        // 仮予約完了メールキュー追加(あれば更新日時を更新するだけ)
        try {
            // GMOのオーダーIDから上映日と購入番号を取り出す
            const emailQueue = yield createEmailQueue(res, reservations[0].get('performance_day'), reservations[0].get('payment_no'));
            yield chevre_domain_1.Models.EmailQueue.create(emailQueue);
        }
        catch (error) {
            console.error(error);
            // 失敗してもスルー(ログと運用でなんとかする)
        }
        debug('redirecting to waitingSettlement...');
        res.redirect(`/customer/reserve/${reservations[0].get('performance_day')}/${reservations[0].get('payment_no')}/waitingSettlement`);
    });
}
exports.result = result;
/**
 * 仮予約完了メールを作成する
 *
 * @memberOf ReserveBaseController
 */
function createEmailQueue(res, performanceDay, paymentNo) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservations = yield chevre_domain_1.Models.Reservation.find({
            performance_day: performanceDay,
            payment_no: paymentNo
        }).exec();
        debug('reservations for email found.', reservations.length);
        if (reservations.length === 0) {
            throw new Error(`reservations of payment_no ${paymentNo} not found`);
        }
        const to = reservations[0].get('purchaser_email');
        debug('to:', to);
        if (to.length === 0) {
            throw new Error('email to unknown');
        }
        const titleJa = 'CHEVRE_EVENT_NAMEチケット 仮予約完了のお知らせ';
        const titleEn = 'Notice of Completion of Tentative Reservation for CHEVRE Tickets';
        debug('rendering template...');
        return new Promise((resolve, reject) => {
            res.render('email/reserve/waitingSettlement', {
                layout: false,
                titleJa: titleJa,
                titleEn: titleEn,
                reservations: reservations,
                moment: moment,
                numeral: numeral,
                conf: conf,
                GMOUtil: GMO.Util,
                ReservationUtil: chevre_domain_1.ReservationUtil
            }, (renderErr, text) => __awaiter(this, void 0, void 0, function* () {
                debug('email template rendered.', renderErr);
                if (renderErr instanceof Error) {
                    reject(new Error('failed in rendering an email.'));
                    return;
                }
                const emailQueue = {
                    from: {
                        address: conf.get('email.from'),
                        name: conf.get('email.fromname')
                    },
                    to: {
                        address: to
                        // name: 'testto'
                    },
                    subject: `${titleJa} ${titleEn}`,
                    content: {
                        mimetype: 'text/plain',
                        text: text
                    },
                    status: chevre_domain_1.EmailQueueUtil.STATUS_UNSENT
                };
                resolve(emailQueue);
            }));
        });
    });
}
