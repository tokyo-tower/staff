/**
 * GMOコンビニ決済コントローラー
 *
 * @namespace controller/customer/reserve/gmo/cvs
 */

import { EmailQueueUtil, Models, ReservationUtil } from '@motionpicture/chevre-domain';
import * as GMO from '@motionpicture/gmo-service';
import * as conf from 'config';
import * as crypto from 'crypto';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as mongoose from 'mongoose';
import * as numeral from 'numeral';
import * as util from 'util';

import GMOResultModel from '../../../../models/gmo/result';

const debug = createDebug('chevre-frontend:controller:gmo:reserve:cvs');

/**
 * GMOからの結果受信
 */
export async function result(gmoResultModel: GMOResultModel, req: Request, res: Response, next: NextFunction) {
    // 内容の整合性チェック
    let reservations: mongoose.Document[] = [];
    try {
        debug('finding reservations...:');
        reservations = await Models.Reservation.find(
            {
                gmo_order_id: gmoResultModel.OrderID
            },
            '_id performance_day payment_no'
        ).exec();
        debug('reservations found.', reservations.length);

        if (reservations.length === 0) {
            throw new Error(req.__('Message.UnexpectedError'));
        }
        // チェック文字列
        // 8 ＋ 23 ＋ 24 ＋ 25 ＋ 39 + 14 ＋ショップパスワード
        const data2cipher = util.format(
            '%s%s%s%s%s%s%s',
            gmoResultModel.OrderID,
            gmoResultModel.CvsCode,
            gmoResultModel.CvsConfNo,
            gmoResultModel.CvsReceiptNo,
            gmoResultModel.PaymentTerm,
            gmoResultModel.TranDate,
            process.env.GMO_SHOP_PASS
        );
        const checkString = crypto.createHash('md5').update(data2cipher, 'utf8').digest('hex');
        debug('CheckString must be ', checkString);
        if (checkString !== gmoResultModel.CheckString) {
            throw new Error(req.__('Message.UnexpectedError'));
        }

    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    try {
        debug('updating reservations by paymentNo...', gmoResultModel.OrderID);
        const raw = await Models.Reservation.update(
            {
                gmo_order_id: gmoResultModel.OrderID
            },
            {
                gmo_shop_id: gmoResultModel.ShopID,
                gmo_amount: gmoResultModel.Amount,
                gmo_tax: gmoResultModel.Tax,
                gmo_cvs_code: gmoResultModel.CvsCode,
                gmo_cvs_conf_no: gmoResultModel.CvsConfNo,
                gmo_cvs_receipt_no: gmoResultModel.CvsReceiptNo,
                gmo_cvs_receipt_url: gmoResultModel.CvsReceiptUrl,
                gmo_payment_term: gmoResultModel.PaymentTerm
            },
            { multi: true }
        ).exec();
        debug('reservations updated.', raw);
    } catch (error) {
        next(new Error(req.__('Message.ReservationNotCompleted')));
        return;
    }

    // 仮予約完了メールキュー追加(あれば更新日時を更新するだけ)
    try {
        // GMOのオーダーIDから上映日と購入番号を取り出す
        const emailQueue = await createEmailQueue(res, reservations[0].get('performance_day'), reservations[0].get('payment_no'));
        await Models.EmailQueue.create(emailQueue);
    } catch (error) {
        console.error(error);
        // 失敗してもスルー(ログと運用でなんとかする)
    }

    debug('redirecting to waitingSettlement...');

    res.redirect(
        `/customer/reserve/${reservations[0].get('performance_day')}/${reservations[0].get('payment_no')}/waitingSettlement`
    );
}

/**
 * 完了メールキューインタフェース
 *
 * @interface IEmailQueue
 */
interface IEmailQueue {
    // tslint:disable-next-line:no-reserved-keywords
    from: { // 送信者
        address: string;
        name: string;
    };
    to: { // 送信先
        address: string;
        name?: string;
    };
    subject: string;
    content: { // 本文
        mimetype: string;
        text: string;
    };
    status: string;
}

/**
 * 仮予約完了メールを作成する
 *
 * @memberOf ReserveBaseController
 */
async function createEmailQueue(res: Response, performanceDay: string, paymentNo: string): Promise<IEmailQueue> {
    const reservations = await Models.Reservation.find({
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
    return new Promise<IEmailQueue>((resolve, reject) => {
        res.render(
            'email/reserve/waitingSettlement',
            {
                layout: false,
                titleJa: titleJa,
                titleEn: titleEn,
                reservations: reservations,
                moment: moment,
                numeral: numeral,
                conf: conf,
                GMOUtil: GMO.Util,
                ReservationUtil: ReservationUtil
            },
            async (renderErr, text) => {
                debug('email template rendered.', renderErr);
                if (renderErr instanceof Error) {
                    reject(new Error('failed in rendering an email.'));
                    return;
                }

                const emailQueue = {
                    from: { // 送信者
                        address: conf.get<string>('email.from'),
                        name: conf.get<string>('email.fromname')
                    },
                    to: { // 送信先
                        address: to
                        // name: 'testto'
                    },
                    subject: `${titleJa} ${titleEn}`,
                    content: { // 本文
                        mimetype: 'text/plain',
                        text: text
                    },
                    status: EmailQueueUtil.STATUS_UNSENT
                };
                resolve(emailQueue);
            });
    });
}
