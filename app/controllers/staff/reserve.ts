/**
 * 内部関係者座席予約コントローラー
 *
 * @namespace controller/staff/reserve
 */
import * as GMO from '@motionpicture/gmo-service';
import * as TTTS from '@motionpicture/ttts-domain';
import * as conf from 'config';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as request from 'request'; // for token
import * as _ from 'underscore';

import reservePerformanceForm from '../../forms/reserve/reservePerformanceForm';
import ReserveSessionModel from '../../models/reserve/session';
import * as reserveBaseController from '../reserveBase';

const PURCHASER_GROUP: string = TTTS.ReservationUtil.PURCHASER_GROUP_STAFF;
const layout: string = 'layouts/staff/layout';

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
async function getToken(): Promise<any> {
    return new Promise((resolve, reject) => {
        request.post(`${process.env.API_ENDPOINT}oauth/token`, {
            body: {
                grant_type: 'client_credencials',
                client_id: 'motionpicture',
                client_secret: 'motionpicture',
                state: 'state123456789',
                scope: [
                    'performances.read-only'
                ]
            },
            json: true
            },       (error, response, body) => {
            // tslint:disable-next-line:no-magic-numbers
            if (response.statusCode === 200) {
                resolve(body);
            } else {
                reject(error);
            }
        });
    });
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
            next(new Error(req.__('Message.Expired')));
            return;
        }

        const token: string = await getToken();
        // tslint:disable-next-line:no-console
        console.log('token=' + JSON.stringify(token));

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
                FilmUtil: TTTS.FilmUtil,
                token: JSON.stringify(token),
                layout: layout
            });
        }
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}

//2017/06/23 座席選択削除
// /**
//  * 座席選択
//  */
// export async function seats(req: Request, res: Response, next: NextFunction): Promise<void> {
//     try {
//         let reservationModel = ReservationModel.FIND(req);

//         if (reservationModel === null) {
//             next(new Error(req.__('Message.Expired')));
//             return;
//         }

//         const limit = reservationModel.getSeatsLimit();

//         if (req.method === 'POST') {
//             reserveSeatForm(req);
//             const validationResult = await req.getValidationResult();
//             if (!validationResult.isEmpty()) {
//                 res.redirect('/staff/reserve/seats');
//                 return;
//             }
//             reservationModel = <ReservationModel>reservationModel;
//             const seatCodes: string[] = JSON.parse(req.body.seatCodes);

//             // 追加指定席を合わせて制限枚数を超過した場合
//             if (seatCodes.length > limit) {
//                 const message = req.__('Message.seatsLimit{{limit}}', { limit: limit.toString() });
//                 res.redirect(`/staff/reserve/seats?message=${encodeURIComponent(message)}`);
//                 return;
//             }

//             // 仮予約あればキャンセルする
//             await processCancelSeats(reservationModel);

//             try {
//                 // 座席FIX
//                 await processFixSeats(reservationModel, seatCodes, req);
//                 reservationModel.save(req);
//                 // 券種選択へ
//                 res.redirect('/staff/reserve/tickets');
//                 return;
//             } catch (error) {
//                 reservationModel.save(req);
//                 const message = req.__('Message.SelectedSeatsUnavailable');
//                 res.redirect(`/staff/reserve/seats?message=${encodeURIComponent(message)}`);
//                 return;
//             }
//         } else {
//             res.render('staff/reserve/seats', {
//                 reservationModel: reservationModel,
//                 limit: limit,
//                 layout: layout
//             });
//             return;
//         }
//     } catch (error) {
//         next(new Error(req.__('Message.UnexpectedError')));
//         return;
//     }

// }

// /**
//  * 券種選択(旧)
//  */
// export async function tickets(req: Request, res: Response, next: NextFunction): Promise<void> {
//     try {
//         const reservationModel = ReservationModel.FIND(req);

//         if (reservationModel === null) {
//             next(new Error(req.__('Message.Expired')));
//             return;
//         }

//         if (req.method === 'POST') {
//             try {
//                 await reserveBaseController.processFixTickets(reservationModel, req);
//                 reservationModel.save(req);
//                 res.redirect('/staff/reserve/profile');
//             } catch (error) {
//                 res.redirect('/staff/reserve/tickets');
//             }
//         } else {
//             res.render('staff/reserve/tickets', {
//                 reservationModel: reservationModel,
//                 layout: layout
//             });
//         }
//     } catch (error) {
//         next(new Error(req.__('Message.UnexpectedError')));
//     }
// }

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

// /**
//  * 購入者情報(スキップ)
//  */
// export async function profile(req: Request, res: Response, next: NextFunction): Promise<void> {
//     try {
//         const reservationModel = ReserveSessionModel.FIND(req);

//         if (reservationModel === null) {
//             next(new Error(req.__('Message.Expired')));
//             return;
//         }

//         await reserveBaseController.processAllExceptConfirm(reservationModel, req);
//         res.redirect('/staff/reserve/confirm');
//     } catch (error) {
//         next(new Error(req.__('Message.UnexpectedError')));
//     }
// }
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
                // クレジットカード決済のオーソリ、あるいは、オーダーID発行
                //await processFixGMO(reservationModel, req);
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
                (!_.isEmpty(reservationModel.paymentMethod)) ? reservationModel.paymentMethod : GMO.Util.PAY_TYPE_CREDIT;

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
            res.render('staff/reserve/confirm', {
                reservationModel: reservationModel,
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

// /**
//  * 予約フロー中の座席をキャンセルするプロセス
//  *
//  * @override
//  */
// export async function processCancelSeats(reservationModel: ReserveSessionModel): Promise<void> {
//     const seatCodesInSession = (reservationModel.seatCodes !== undefined) ? reservationModel.seatCodes : [];
//     if (seatCodesInSession.length === 0) {
//         return;
//     }

//     // セッション中の予約リストを初期化
//     reservationModel.seatCodes = [];

//     // 仮予約をTTTS確保ステータスに戻す
//     try {
//         await TTTS.Models.Reservation.update(
//             {
//                 performance: reservationModel.performance._id,
//                 seat_code: { $in: seatCodesInSession },
//                 status: TTTS.ReservationUtil.STATUS_TEMPORARY_ON_KEPT_BY_TTTS
//             },
//             {
//                 $set: {
//                     status: TTTS.ReservationUtil.STATUS_KEPT_BY_TTTS
//                 },
//                 $unset: {
//                     owner: ''
//                 }
//             },
//             {
//                 multi: true
//             }
//         ).exec();

//         // 仮予約を空席ステータスに戻す
//         await TTTS.Models.Reservation.remove(
//             {
//                 performance: reservationModel.performance._id,
//                 seat_code: { $in: seatCodesInSession },
//                 status: TTTS.ReservationUtil.STATUS_TEMPORARY
//             }
//         ).exec();
//     } catch (error) {
//         // 失敗したとしても時間経過で消えるので放置
//     }
// }

// /**
//  * 座席をFIXするプロセス
//  *
//  * @override
//  */
// export async function processFixSeats(reservationModel: ReserveSessionModel, seatCodes: string[], req: Request): Promise<void> {
//     if (req.staffUser === undefined) {
//         throw new Error(req.__('Message.UnexpectedError'));
//     }

//     const staffUser = req.staffUser;

//     // セッション中の予約リストを初期化
//     reservationModel.seatCodes = [];
//     reservationModel.expiredAt = moment().add(conf.get<number>('temporary_reservation_valid_period_seconds'), 'seconds').valueOf();

//     // 新たな座席指定と、既に仮予約済みの座席コードについて
//     const promises = seatCodes.map(async (seatCode) => {
//         const seatInfo = reservationModel.performance.screen.sections[0].seats.find((seat) => {
//             return (seat.code === seatCode);
//         });

//         // 万が一、座席が存在しなかったら
//         if (seatInfo === undefined) {
//             throw new Error(req.__('Message.InvalidSeatCode'));
//         }

//         // 予約データを作成(同時作成しようとしたり、既に予約があったとしても、unique indexではじかれる)
//         try {
//             const reservation = await TTTS.Models.Reservation.create(
//                 {
//                     performance: reservationModel.performance._id,
//                     seat_code: seatCode,
//                     status: TTTS.ReservationUtil.STATUS_TEMPORARY,
//                     expired_at: reservationModel.expiredAt,
//                     owner: staffUser.get('_id')
//                 }
//             );

//             // ステータス更新に成功したらセッションに保管
//             reservationModel.seatCodes.push(seatCode);
//             reservationModel.setReservation(seatCode, {
//                 _id: reservation.get('_id'),
//                 status: reservation.get('status'),
//                 seat_code: reservation.get('seat_code'),
//                 seat_grade_name: seatInfo.grade.name,
//                 seat_grade_additional_charge: seatInfo.grade.additional_charge,
//                 ticket_type: '',
//                 ticket_type_name: {
//                     ja: '',
//                     en: ''
//                 },
//                 ticket_type_charge: 0,
//                 watcher_name: ''
//             });
//         } catch (error) {
//             // TTTS確保からの仮予約を試みる
//             const reservation = await TTTS.Models.Reservation.findOneAndUpdate(
//                 {
//                     performance: reservationModel.performance._id,
//                     seat_code: seatCode,
//                     status: TTTS.ReservationUtil.STATUS_KEPT_BY_TTTS
//                 },
//                 {
//                     status: TTTS.ReservationUtil.STATUS_TEMPORARY_ON_KEPT_BY_TTTS,
//                     expired_at: reservationModel.expiredAt,
//                     owner: staffUser.get('_id')
//                 },
//                 {
//                     new: true
//                 }
//             ).exec();

//             if (reservation === null) {
//                 throw new Error(req.__('Message.UnexpectedError'));
//             }

//             // ステータス更新に成功したらセッションに保管
//             reservationModel.seatCodes.push(seatCode);
//             reservationModel.setReservation(seatCode, {
//                 _id: reservation.get('_id'),
//                 status: reservation.get('status'),
//                 seat_code: reservation.get('seat_code'),
//                 seat_grade_name: seatInfo.grade.name,
//                 seat_grade_additional_charge: seatInfo.grade.additional_charge,
//                 ticket_type: '',
//                 ticket_type_name: {
//                     ja: '',
//                     en: ''
//                 },
//                 ticket_type_charge: 0,
//                 watcher_name: ''
//             });
//         }
//     });

//     await Promise.all(promises);
//     // 座席コードのソート(文字列順に)
//     reservationModel.seatCodes.sort(TTTS.ScreenUtil.sortBySeatCode);
// }
