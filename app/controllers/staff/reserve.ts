/**
 * 内部関係者座席予約コントローラー
 * @namespace controller/staff/reserve
 */
import * as ttts from '@motionpicture/ttts-domain';
import * as conf from 'config';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as _ from 'underscore';

import reservePerformanceForm from '../../forms/reserve/reservePerformanceForm';
import ReserveSessionModel from '../../models/reserve/session';
import * as reserveBaseController from '../reserveBase';
//import reservation from '@motionpicture/ttts-domain/lib/repo/mongoose/model/reservation';

const debug = createDebug('ttts-staff:controller:reserve');
const PURCHASER_GROUP: string = ttts.factory.person.Group.Staff;
const layout: string = 'layouts/staff/layout';

const PAY_TYPE_FREE: string = 'F';
const paymentMethodNames: any = { F: '無料招待券', I: '請求書支払い' };
const reserveMaxDateInfo: any = conf.get<any>('reserve_max_date');

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
        const reservationModel = await reserveBaseController.processStart(PURCHASER_GROUP, req);
        reservationModel.save(req);

        if (reservationModel.performance !== undefined) {
            const cb = '/staff/reserve/tickets';
            res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
        } else {
            const cb = '/staff/reserve/performances';
            res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
        }
    } catch (error) {
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

        const token = await ttts.CommonUtil.getToken({
            authorizeServerDomain: <string>process.env.API_AUTHORIZE_SERVER_DOMAIN,
            clientId: <string>process.env.API_CLIENT_ID,
            clientSecret: <string>process.env.API_CLIENT_SECRET,
            scopes: [
                `${<string>process.env.API_RESOURECE_SERVER_IDENTIFIER}/performances.read-only`
            ],
            state: ''
        });
        // tslint:disable-next-line:no-console
        // console.log('token=' + JSON.stringify(token));
        const maxDate = moment();
        Object.keys(reserveMaxDateInfo).forEach((key: any) => {
            maxDate.add(key, reserveMaxDateInfo[key]);
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
            // 仮予約あればキャンセルする
            await reserveBaseController.processCancelSeats(<ReserveSessionModel>reservationModel);
            reservationModel.save(req);

            res.render('staff/reserve/performances', {
                // FilmUtil: ttts.FilmUtil,
                token: token,
                reserveMaxDate: reserveMaxDate,
                layout: layout
            });
        }
    } catch (error) {
        console.error(error);
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
        reservationModel.paymentMethod = <any>'';
        if (req.method === 'POST') {
            // 仮予約あればキャンセルする
            try {
                await reserveBaseController.processCancelSeats(reservationModel);
            } catch (error) {
                // tslint:disable-next-line:no-console
                console.log(error);
                next(error);

                return;
            }
            try {
                // 予約処理
                await reserveBaseController.processFixSeatsAndTickets(reservationModel, req);
                reservationModel.save(req);
                res.redirect('/staff/reserve/profile');
            } catch (error) {
                // "予約可能な席がございません"などのメッセージ表示
                res.locals.message = error.message;

                // 車椅子レート制限を超過した場合
                if (error instanceof ttts.factory.errors.RateLimitExceeded) {
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
                console.error(error);
                res.render('staff/reserve/profile', {
                    reservationModel: reservationModel,
                    layout: layout
                });
            }
        } else {
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
            res.locals.paymentMethod =
                (!_.isEmpty(reservationModel.paymentMethod)) ? reservationModel.paymentMethod : PAY_TYPE_FREE;

            res.render('staff/reserve/profile', {
                reservationModel: reservationModel,
                GMO_ENDPOINT: process.env.GMO_ENDPOINT,
                GMO_SHOP_ID: process.env.GMO_SHOP_ID,
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
        if (reservationModel === null) {
            next(new Error(req.__('Expired')));

            return;
        }

        if (req.method === 'POST') {
            try {
                // 仮押さえ有効期限チェック
                if (reservationModel.expires <= moment().toDate()) {
                    throw new Error(req.__('Expired'));
                }

                const taskRepo = new ttts.repository.Task(ttts.mongoose.connection);
                const transactionRepo = new ttts.repository.Transaction(ttts.mongoose.connection);
                const creditCardAuthorizeActionRepo = new ttts.repository.action.authorize.CreditCard(ttts.mongoose.connection);
                const seatReservationAuthorizeActionRepo = new ttts.repository.action.authorize.SeatReservation(ttts.mongoose.connection);

                // 予約確定
                const transactionResult = await ttts.service.transaction.placeOrderInProgress.confirm({
                    agentId: reservationModel.agentId,
                    transactionId: reservationModel.id,
                    paymentMethod: reservationModel.paymentMethod
                })(transactionRepo, creditCardAuthorizeActionRepo, seatReservationAuthorizeActionRepo);
                debug('transaction confirmed. orderNumber:', transactionResult.order.orderNumber);

                try {
                    // 完了メールキュー追加(あれば更新日時を更新するだけ)
                    const emailAttributes = await reserveBaseController.createEmailAttributes(
                        transactionResult.eventReservations, reservationModel.getTotalCharge(), res
                    );

                    await ttts.service.transaction.placeOrder.sendEmail(
                        reservationModel.id,
                        emailAttributes
                    )(taskRepo, transactionRepo);
                    debug('email sent.');
                } catch (error) {
                    // 失敗してもスルー
                }

                ReserveSessionModel.REMOVE(req);
                res.redirect(`/staff/reserve/${reservationModel.performance.day}/${reservationModel.paymentNo}/complete`);
            } catch (error) {
                ReserveSessionModel.REMOVE(req);
                next(error);
            }
        } else {
            const reservations: any[] = reserveBaseController.getReservations(reservationModel);
            // チケットをticket_type(id)でソート
            sortReservationstByTicketType(reservations);
            const ticketInfos: any = reserveBaseController.getTicketInfos(reservations);
            // 券種ごとの表示情報編集
            Object.keys(ticketInfos).forEach((key) => {
                const ticketInfo = (<any>ticketInfos)[key];
                (<any>ticketInfos)[key].info =
                    `${ticketInfo.ticket_type_name[res.locale]} ${ticketInfo.charge} × ${res.__('{{n}}Leaf', { n: ticketInfo.count })}`;
            });
            res.render('staff/reserve/confirm', {
                reservationModel: reservationModel,
                ticketInfos: ticketInfos,
                paymentMethodName: paymentMethodNames[reservationModel.paymentMethod],
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
        const transactionRepo = new ttts.repository.Transaction(ttts.mongoose.connection);
        const transactionDoc = await transactionRepo.transactionModel.findOne(
            {
                'result.eventReservations.performance_day': req.params.performanceDay,
                'result.eventReservations.payment_no': req.params.paymentNo,
                'result.eventReservations.purchaser_group': PURCHASER_GROUP,
                'result.eventReservations.status': ttts.factory.reservationStatusType.ReservationConfirmed,
                'result.eventReservations.owner': (<Express.StaffUser>req.staffUser).get('id'),
                'result.eventReservations.purchased_at': { // 購入確定から30分有効
                    $gt: moment().add(-30, 'minutes').toDate() // tslint:disable-line:no-magic-numbers
                }
            }
        ).exec();
        if (transactionDoc === null) {
            next(new Error(req.__('NotFound')));

            return;
        }

        const transaction = <ttts.factory.transaction.placeOrder.ITransaction>transactionDoc.toObject();
        debug('confirmed transaction:', transaction.id);
        let reservations = (<ttts.factory.transaction.placeOrder.IResult>transaction.result).eventReservations;
        debug(reservations.length, 'reservation(s) found.');
        reservations = reservations.filter((r) => r.status === ttts.factory.reservationStatusType.ReservationConfirmed);

        if (reservations.length === 0) {
            next(new Error(req.__('NotFound')));

            return;
        }

        //reservations.sort((a, b) => ttts.factory.place.screen.sortBySeatCode(a.seat_code, b.seat_code));
        // チケットをticket_type(id)でソート
        sortReservationstByTicketType(reservations);

        // 印刷トークン発行
        const tokenRepo = new ttts.repository.Token(redisClient);
        const printToken = await tokenRepo.createPrintToken(reservations.map((r) => r.id));
        debug('printToken created.', printToken);

        res.render('staff/reserve/complete', {
            reservations: reservations,
            printToken: printToken,
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
        // 入塔日
        if (a.ticket_type > b.ticket_type) {
            return 1;
        }
        if (a.ticket_type < b.ticket_type) {
            return -1;
        }

        return 0;
    });
}
