/**
 * GMO関連予約コントローラー
 * 座席予約フローのうちGMOと連携するアクションを実装しています。
 *
 * @namespace controller/customer/reserve/gmo
 */

import { CommonUtil, Models, ReservationUtil } from '@motionpicture/chevre-domain';
import { Util as GMOUtil } from '@motionpicture/gmo-service';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as querystring from 'querystring';
import * as _ from 'underscore';
import * as util from 'util';

import GMOResultModel from '../../../models/gmo/result';
import ReservationModel from '../../../models/reserve/session';
import * as gmoReserveCvsController from './gmo/cvs';

const debug = createDebug('chevre-frontend:controller:gmoReserve');

/**
 * マルチバイト文字列対応String.substr
 *
 * @params {number} start
 * @params {number} length
 */
(<any>String.prototype).mbSubstr = function (this: any, start: number, length: number) {
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
export async function start(req: Request, res: Response, next: NextFunction) {
    try {
        const reservationModel = ReservationModel.FIND(req);

        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));
            return;
        }

        // 予約情報セッション削除
        ReservationModel.REMOVE(req);

        // GMOへ遷移画面

        // 作品名から、特定文字以外を取り除く
        const filmNameFullWidth = CommonUtil.toFullWidth(reservationModel.performance.film.name.ja);
        const filmNameFullWidthLength = filmNameFullWidth.length;
        let registerDisp1 = '';
        // todo 文字列のループはこの書き方は本来よろしくないので、暇があったら直す
        // tslint:disable-next-line:no-increment-decrement
        for (let i = 0; i < filmNameFullWidthLength; i++) {
            const letter = filmNameFullWidth[i];
            if (
                /[Ａ-Ｚａ-ｚ０-９]/.test(letter) || // 全角英数字
                /[\u3040-\u309F]/.test(letter) || // ひらがな
                /[\u30A0-\u30FF]/.test(letter) || // カタカナ
                /[一-龠]/.test(letter) // 漢字
            ) {
                registerDisp1 += letter;
            }
        }

        // tslint:disable-next-line:no-magic-numbers
        res.locals.registerDisp1 = (<any>registerDisp1).mbSubstr(0, 32);

        res.locals.registerDisp2 = CommonUtil.toFullWidth(
            util.format(
                '%s／%s／%s',
                reservationModel.performance.day.substr(0, 4), // tslint:disable-line:no-magic-numbers
                reservationModel.performance.day.substr(4, 2), // tslint:disable-line:no-magic-numbers
                reservationModel.performance.day.substr(6) // tslint:disable-line:no-magic-numbers
            )
        );
        res.locals.registerDisp3 = CommonUtil.toFullWidth(reservationModel.performance.theater.name.ja);
        res.locals.registerDisp4 = CommonUtil.toFullWidth(
            util.format(
                '開場%s:%s　開演%s:%s',
                reservationModel.performance.open_time.substr(0, 2), // tslint:disable-line:no-magic-numbers
                reservationModel.performance.open_time.substr(2), // tslint:disable-line:no-magic-numbers
                reservationModel.performance.start_time.substr(0, 2), // tslint:disable-line:no-magic-numbers
                reservationModel.performance.start_time.substr(2) // tslint:disable-line:no-magic-numbers
            )
        );

        res.locals.shopId = process.env.GMO_SHOP_ID;
        res.locals.orderID = reservationModel.transactionGMO.orderId;
        res.locals.reserveNo = reservationModel.paymentNo;
        res.locals.amount = reservationModel.getTotalCharge().toString();
        res.locals.dateTime = moment(reservationModel.purchasedAt).format('YYYYMMDDHHmmss');
        res.locals.useCredit = (reservationModel.paymentMethod === GMOUtil.PAY_TYPE_CREDIT) ? '1' : '0';
        res.locals.useCvs = (reservationModel.paymentMethod === GMOUtil.PAY_TYPE_CVS) ? '1' : '0';
        res.locals.shopPassString = GMOUtil.createShopPassString({
            shopId: process.env.GMO_SHOP_ID,
            shopPass: process.env.GMO_SHOP_PASS,
            orderId: res.locals.orderID,
            amount: reservationModel.getTotalCharge(),
            dateTime: res.locals.dateTime
        });

        res.locals.retURL = util.format(
            '%s%s?locale=%s',
            process.env.FRONTEND_GMO_RESULT_ENDPOINT,
            '/customer/reserve/gmo/result',
            req.getLocale()
        );
        // 決済キャンセル時に遷移する加盟店URL
        res.locals.cancelURL = util.format(
            '%s%s?locale=%s',
            process.env.FRONTEND_GMO_RESULT_ENDPOINT,
            `/customer/reserve/gmo/${res.locals.orderID}/cancel`,
            req.getLocale()
        );

        debug('redirecting to GMO payment...');
        // GMOへの送信データをログに残すために、一度htmlを取得してからrender
        res.render('customer/reserve/gmo/start');
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}

/**
 * GMOからの結果受信
 * GMOで何かしらエラーが発生して「決済をやめる」ボタンから遷移してくることもある
 */
export async function result(req: Request, res: Response, next: NextFunction): Promise<void> {
    const gmoResultModel = GMOResultModel.parse(req.body);
    debug('gmoResultModel:', gmoResultModel);

    // エラー結果の場合
    if (!_.isEmpty(gmoResultModel.ErrCode)) {
        try {
            debug('finding reservations...');
            const reservations = await Models.Reservation.find(
                {
                    gmo_order_id: gmoResultModel.OrderID
                },
                'purchased_at'
            ).exec();
            debug('reservations found.', reservations.length);

            if (reservations.length === 0) {
                next(new Error(req.__('Message.NotFound')));
                return;
            }

            // 特に何もしない
            res.render('customer/reserve/gmo/cancel');
        } catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    } else {
        // 決済方法によって振り分け
        switch (gmoResultModel.PayType) {
            case GMOUtil.PAY_TYPE_CVS:
                debug('starting GMOReserveCsvController.result...');
                await gmoReserveCvsController.result(gmoResultModel, req, res, next);
                break;

            default:
                next(new Error(req.__('Message.UnexpectedError')));
                break;
        }
    }
}

/**
 * 決済キャンセル時に遷移
 */
export async function cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    debug('start process GMOReserveController.cancel.');
    try {
        debug('finding reservations...', req.params.orderId);
        const reservations = await Models.Reservation.find(
            {
                gmo_order_id: req.params.orderId,
                status: ReservationUtil.STATUS_WAITING_SETTLEMENT // GMO決済離脱組の処理なので、必ず決済中ステータスになっている
            }
        ).exec();
        debug('reservations found.', reservations);

        if (reservations.length === 0) {
            next(new Error(req.__('Message.NotFound')));
            return;
        }

        // 特に何もしない
        res.render('customer/reserve/gmo/cancel');
    } catch (error) {
        console.error(error);
        next(new Error(req.__('Message.UnexpectedError')));
    }
}
