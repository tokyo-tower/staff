/**
 * 内部関係者座席予約コントローラー
 * @namespace controllers.staff.reserve
 */

import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import * as ttts from '@motionpicture/ttts-domain';
import * as conf from 'config';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as _ from 'underscore';

import reservePerformanceForm from '../../forms/reserve/reservePerformanceForm';
import ReserveSessionModel from '../../models/reserve/session';
import * as reserveBaseController from '../reserveBase';

const debug = createDebug('ttts-staff:controller:reserve');
const PURCHASER_GROUP: string = ttts.factory.person.Group.Staff;
const layout: string = 'layouts/staff/layout';

const paymentMethodNames: any = { F: '無料招待券', I: '請求書支払い' };
const reserveMaxDateInfo = conf.get<{ [period: string]: number }>('reserve_max_date');

const redisClient = ttts.redis.createClient({
    host: <string>process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(<string>process.env.REDIS_PORT, 10),
    password: <string>process.env.REDIS_KEY,
    tls: { servername: <string>process.env.REDIS_HOST }
});

export async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
    // 期限指定
    if (moment() < moment(conf.get<string>('datetimes.reservation_start_staffs'))) {
        next(new Error(req.__('Message.OutOfTerm')));

        return;
    }

    try {
        // 購入結果セッション初期化
        delete (<Express.Session>req.session).transactionResult;
        delete (<Express.Session>req.session).printToken;

        const reservationModel = await reserveBaseController.processStart(PURCHASER_GROUP, req);
        reservationModel.save(req);

        if (reservationModel.transactionInProgress.performance !== undefined) {
            const cb = '/staff/reserve/tickets';
            res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
        } else {
            const cb = '/staff/reserve/performances';
            res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
        }
    } catch (error) {
        console.error(error);
        next(new Error(req.__('UnexpectedError')));
    }
}

/**
 * 規約(スキップ)
 */
export function terms(req: Request, res: Response, __: NextFunction): void {
    const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/';
    res.redirect(cb);
}

/**
 * スケジュール選択
 * @method performances
 * @returns {Promise<void>}
 */
export async function performances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReserveSessionModel.FIND(req);

        if (reservationModel === null) {
            next(new Error(req.__('Expired')));

            return;
        }

        const token = req.tttsAuthClient.credentials;

        const maxDate = moment();
        Object.keys(reserveMaxDateInfo).forEach((key: any) => {
            maxDate.add(reserveMaxDateInfo[key], key);
        });
        const reserveMaxDate: string = maxDate.format('YYYY/MM/DD');

        if (req.method === 'POST') {
            reservePerformanceForm(req);
            const validationResult = await req.getValidationResult();
            if (!validationResult.isEmpty()) {
                next(new Error(req.__('UnexpectedError')));

                return;
            }
            try {
                // パフォーマンスFIX
                await reserveBaseController.processFixPerformance(
                    <ReserveSessionModel>reservationModel,
                    req.body.performanceId,
                    req
                );
                reservationModel.save(req);
                res.redirect('/staff/reserve/tickets');

                return;
            } catch (error) {
                next(new Error(req.__('UnexpectedError')));

                return;
            }
        } else {
            res.render('staff/reserve/performances', {
                token: token,
                reserveMaxDate: reserveMaxDate,
                layout: layout
            });
        }
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}

/**
 * 券種選択
 */
export async function tickets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReserveSessionModel.FIND(req);
        if (reservationModel === null) {
            next(new Error(req.__('Expired')));

            return;
        }

        // パフォーマンスは指定済みのはず
        if (reservationModel.transactionInProgress.performance === undefined) {
            throw new Error(req.__('UnexpectedError'));
        }

        //reservationModel.transactionInProgress.paymentMethod = ttts.factory.paymentMethodType.Invitation;
        reservationModel.transactionInProgress.paymentMethod = ttts.factory.paymentMethodType.CP;

        if (req.method === 'POST') {
            // 仮予約あればキャンセルする
            try {
                // セッション中の予約リストを初期化
                reservationModel.transactionInProgress.reservations = [];

                // 座席仮予約があればキャンセル
                if (reservationModel.transactionInProgress.seatReservationAuthorizeActionId !== undefined) {
                    const placeOrderTransactionService = new tttsapi.service.transaction.PlaceOrder({
                        endpoint: <string>process.env.API_ENDPOINT,
                        auth: req.tttsAuthClient
                    });
                    debug('canceling seat reservation authorize action...');
                    const actionId = reservationModel.transactionInProgress.seatReservationAuthorizeActionId;
                    delete reservationModel.transactionInProgress.seatReservationAuthorizeActionId;
                    await placeOrderTransactionService.cancelSeatReservationAuthorization({
                        transactionId: reservationModel.transactionInProgress.id,
                        actionId: actionId
                    });
                    debug('seat reservation authorize action canceled.');
                }
            } catch (error) {
                next(error);

                return;
            }

            try {
                // 現在時刻が開始時刻を過ぎている時
                if (moment(reservationModel.transactionInProgress.performance.start_date).toDate() < moment().toDate()) {
                    //「ご希望の枚数が用意できないため予約できません。」
                    throw new Error(req.__('NoAvailableSeats'));
                }

                // 予約処理
                await reserveBaseController.processFixSeatsAndTickets(reservationModel, req);
                reservationModel.save(req);
                res.redirect('/staff/reserve/profile');
            } catch (error) {
                // "予約可能な席がございません"などのメッセージ表示
                res.locals.message = error.message;

                // 車椅子レート制限を超過した場合
                if (error instanceof ttts.factory.errors.RateLimitExceeded ||
                    error instanceof ttts.factory.errors.AlreadyInUse) {
                    res.locals.message = req.__('NoAvailableSeats');
                }

                res.render('staff/reserve/tickets', {
                    reservationModel: reservationModel,
                    layout: layout
                });
            }
        } else {
            // 券種選択画面へ遷移
            res.locals.message = '';
            res.render('staff/reserve/tickets', {
                reservationModel: reservationModel,
                layout: layout
            });
        }
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}

/**
 * 購入者情報
 */
export async function profile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReserveSessionModel.FIND(req);
        if (reservationModel === null) {
            next(new Error(req.__('Expired')));

            return;
        }

        if (req.method === 'POST') {
            try {
                await reserveBaseController.processFixProfile(reservationModel, req, res);

                reservationModel.save(req);
                res.redirect('/staff/reserve/confirm');
            } catch (error) {
                res.render('staff/reserve/profile', {
                    reservationModel: reservationModel,
                    layout: layout
                });
            }
        } else {
            // セッションに情報があれば、フォーム初期値設定
            const email = reservationModel.transactionInProgress.purchaser.email;
            res.locals.lastName = reservationModel.transactionInProgress.purchaser.lastName;
            res.locals.firstName = reservationModel.transactionInProgress.purchaser.firstName;
            res.locals.tel = reservationModel.transactionInProgress.purchaser.tel;
            res.locals.age = reservationModel.transactionInProgress.purchaser.age;
            res.locals.address = reservationModel.transactionInProgress.purchaser.address;
            res.locals.gender = reservationModel.transactionInProgress.purchaser.gender;
            res.locals.email = (!_.isEmpty(email)) ? email : '';
            res.locals.emailConfirm = (!_.isEmpty(email)) ? email.substr(0, email.indexOf('@')) : '';
            res.locals.emailConfirmDomain = (!_.isEmpty(email)) ? email.substr(email.indexOf('@') + 1) : '';
            res.locals.paymentMethod =
                (!_.isEmpty(reservationModel.transactionInProgress.paymentMethod))
                    ? reservationModel.transactionInProgress.paymentMethod
                    //: ttts.factory.paymentMethodType.Invitation;
                    : ttts.factory.paymentMethodType.CP;

            res.render('staff/reserve/profile', {
                reservationModel: reservationModel,
                layout: layout
            });
        }
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}

/**
 * 予約内容確認
 */
export async function confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReserveSessionModel.FIND(req);
        if (reservationModel === null || moment(reservationModel.transactionInProgress.expires).toDate() <= moment().toDate()) {
            next(new Error(req.__('Expired')));

            return;
        }

        if (req.method === 'POST') {
            try {
                // 予約確定
                const placeOrderTransactionService = new tttsapi.service.transaction.PlaceOrder({
                    endpoint: <string>process.env.API_ENDPOINT,
                    auth: req.tttsAuthClient
                });
                const transactionResult = await placeOrderTransactionService.confirm({
                    transactionId: reservationModel.transactionInProgress.id,
                    paymentMethod: reservationModel.transactionInProgress.paymentMethod
                });
                debug('transaction confirmed. orderNumber:', transactionResult.order.orderNumber);

                // 購入結果セッション作成
                (<Express.Session>req.session).transactionResult = transactionResult;

                try {
                    // 完了メールキュー追加(あれば更新日時を更新するだけ)
                    const emailAttributes = await reserveBaseController.createEmailAttributes(
                        transactionResult.eventReservations, reservationModel.getTotalCharge(), res
                    );

                    await placeOrderTransactionService.sendEmailNotification({
                        transactionId: reservationModel.transactionInProgress.id,
                        emailMessageAttributes: emailAttributes
                    });
                    debug('email sent.');
                } catch (error) {
                    // 失敗してもスルー
                }

                //　購入フローセッションは削除
                ReserveSessionModel.REMOVE(req);

                res.redirect('/staff/reserve/complete');

                return;
            } catch (error) {
                ReserveSessionModel.REMOVE(req);
                next(error);

                return;
            }
        } else {
            // チケットをticket_type(id)でソート
            sortReservationstByTicketType(reservationModel.transactionInProgress.reservations);

            const ticketInfos: any = reserveBaseController.getTicketInfos(reservationModel.transactionInProgress.reservations);
            // 券種ごとの表示情報編集
            Object.keys(ticketInfos).forEach((key) => {
                const ticketInfo = (<any>ticketInfos)[key];
                (<any>ticketInfos)[key].info =
                    `${ticketInfo.ticket_type_name[res.locale]} ${ticketInfo.charge} × ${res.__('{{n}}Leaf', { n: ticketInfo.count })}`;
            });

            res.render('staff/reserve/confirm', {
                reservationModel: reservationModel,
                ticketInfos: ticketInfos,
                paymentMethodName: paymentMethodNames[reservationModel.transactionInProgress.paymentMethod],
                layout: layout
            });
        }
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}

/**
 * 予約完了
 */
export async function complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // セッションに取引結果があるはず
        const transactionResult = (<Express.Session>req.session).transactionResult;
        if (transactionResult === undefined) {
            next(new Error(req.__('NotFound')));

            return;
        }

        let reservations = (<ttts.factory.transaction.placeOrder.IResult>transactionResult).eventReservations;
        debug(reservations.length, 'reservation(s) found.');
        reservations = reservations.filter((r) => r.status === ttts.factory.reservationStatusType.ReservationConfirmed);
        // チケットをticket_type(id)でソート
        sortReservationstByTicketType(reservations);

        // 初めてのアクセスであれば印刷トークン発行
        if ((<Express.Session>req.session).printToken === undefined) {
            const tokenRepo = new ttts.repository.Token(redisClient);
            const printToken = await tokenRepo.createPrintToken(reservations.map((r) => r.id));
            debug('printToken created.', printToken);
            (<Express.Session>req.session).printToken = printToken;
        }

        res.render('staff/reserve/complete', {
            reservations: reservations,
            printToken: (<Express.Session>req.session).printToken,
            layout: layout
        });
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}
/**
 * チケットをticket_type(id)でソートする
 * @method sortReservationstByTicketType
 */
function sortReservationstByTicketType(reservations: any[]): void {
    // チケットをticket_type(id)でソート
    reservations.sort((a: any, b: any) => {
        if (a.ticket_type > b.ticket_type) {
            return 1;
        }
        if (a.ticket_type < b.ticket_type) {
            return -1;
        }

        return 0;
    });
}
