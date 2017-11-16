/**
 * 内部関係者座席予約コントローラー
 *
 * @namespace controller/staff/reserve
 */
import * as TTTS from '@motionpicture/ttts-domain';
import * as conf from 'config';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
//import * as request from 'request'; // for token
import * as _ from 'underscore';

import reservePerformanceForm from '../../forms/reserve/reservePerformanceForm';
import ReserveSessionModel from '../../models/reserve/session';
import * as reserveBaseController from '../reserveBase';

const PURCHASER_GROUP: string = TTTS.ReservationUtil.PURCHASER_GROUP_STAFF;
const layout: string = 'layouts/staff/layout';

const PAY_TYPE_FREE: string = 'F';
const paymentMethodNames: any = {F: '無料招待券', I: '請求書支払い'};
const reserveMaxDateInfo: any = conf.get<any>('reserve_max_date');

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
        next(new Error(req.__('Message.UnexpectedError')));
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
 * token取得(いずれはttts-domainへ移動)
 */
// async function getToken(): Promise<any> {
//     return new Promise((resolve, reject) => {
//         request.post(`${process.env.API_ENDPOINT}oauth/token`, {
//             body: {
//                 grant_type: 'client_credentials',
//                 client_id: 'motionpicture',
//                 client_secret: 'motionpicture',
//                 state: 'state123456789',
//                 scopes: [
//                     'performances.read-only'
//                 ]
//             },
//             json: true
//             },       (error, response, body) => {
//             // tslint:disable-next-line:no-magic-numbers
//             if (response.statusCode === 200) {
//                 resolve(body);
//             } else {
//                 reject(error);
//             }
//         });
//     });
// }

/**
 * スケジュール選択
 * @method performances
 * @returns {Promise<void>}
 */
export async function performances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReserveSessionModel.FIND(req);

        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));
            return;
        }

        //const token: string = await getToken();
        const token: string = await TTTS.CommonUtil.getToken(process.env.API_ENDPOINT);
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
                next(new Error(req.__('Message.UnexpectedError')));
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
                next(new Error(req.__('Message.UnexpectedError')));
                return;
            }
        } else {
            // 仮予約あればキャンセルする
            await reserveBaseController.processCancelSeats(<ReserveSessionModel>reservationModel);
            reservationModel.save(req);

            res.render('staff/reserve/performances', {
                // FilmUtil: TTTS.FilmUtil,
                token: token,
                reserveMaxDate: reserveMaxDate,
                layout: layout
            });
        }
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}

/**
 * 券種選択
 */
export async function tickets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReserveSessionModel.FIND(req);
        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));

            return;
        }
        reservationModel.paymentMethod = '';
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
        next(new Error(req.__('Message.UnexpectedError')));
    }
}

/**
 * 購入者情報
 */
export async function profile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReserveSessionModel.FIND(req);
        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));

            return;
        }

        if (req.method === 'POST') {
            try {
                await reserveBaseController.processFixProfile(reservationModel, req, res);
                // 予約情報確定
                await reserveBaseController.processAllExceptConfirm(reservationModel, req);
                reservationModel.save(req);
                res.redirect('/staff/reserve/confirm');
            } catch (error) {
                console.error(error);
                res.render('staff/reserve/profile', {
                    reservationModel: reservationModel
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
                GMO_SHOP_ID: process.env.GMO_SHOP_ID
            });
        }
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}

/**
 * 予約内容確認
 */
export async function confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReserveSessionModel.FIND(req);
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
                await reserveBaseController.processFixReservations(
                    reservationModel,
                    reservationModel.performance.day,
                    reservationModel.paymentNo,
                    {},
                    res
                );
                ReserveSessionModel.REMOVE(req);
                res.redirect(`/staff/reserve/${reservationModel.performance.day}/${reservationModel.paymentNo}/complete`);
            } catch (error) {
                ReserveSessionModel.REMOVE(req);
                next(error);
            }
        } else {
            const reservations: any[] = reserveBaseController.getReservations(reservationModel);
            const ticketInfos: any = reserveBaseController.getTicketInfos(reservations);
            // 券種ごとの表示情報編集
            const leaf: string = res.__('Email.Leaf');
            Object.keys(ticketInfos).forEach((key) => {
                const ticketInfo = (<any>ticketInfos)[key];
                (<any>ticketInfos)[key].info =
                    `${ticketInfo.ticket_type_name[res.locale]} ${ticketInfo.charge} × ${ticketInfo.count}${leaf}`;
            });
            res.render('staff/reserve/confirm', {
                reservationModel: reservationModel,
                ticketInfos: ticketInfos,
                paymentMethodName: paymentMethodNames[reservationModel.paymentMethod],
                layout: layout
            });
        }
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}

/**
 * 予約完了
 */
export async function complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    try {
        const reservations = await TTTS.Models.Reservation.find(
            {
                performance_day: req.params.performanceDay,
                payment_no: req.params.paymentNo,
                status: TTTS.ReservationUtil.STATUS_RESERVED,
                owner: req.staffUser.get('_id'),
                purchased_at: { // 購入確定から30分有効
                    $gt: moment().add(-30, 'minutes').toISOString() // tslint:disable-line:no-magic-numbers
                }
            }
        ).exec();

        if (reservations.length === 0) {
            next(new Error(req.__('Message.NotFound')));
            return;
        }

        reservations.sort((a, b) => {
            return TTTS.ScreenUtil.sortBySeatCode(a.get('seat_code'), b.get('seat_code'));
        });

        res.render('staff/reserve/complete', {
            reservationDocuments: reservations,
            layout: layout
        });
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}
