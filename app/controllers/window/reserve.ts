/**
 * 当日窓口座席予約コントローラー
 *
 * @class controller/window/reserve
 */

import { FilmUtil, Models, ReservationUtil, ScreenUtil } from '@motionpicture/chevre-domain';
import { Util as GMOUtil } from '@motionpicture/gmo-service';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as _ from 'underscore';

import reservePerformanceForm from '../../forms/reserve/reservePerformanceForm';
import reserveSeatForm from '../../forms/reserve/reserveSeatForm';
import ReservationModel from '../../models/reserve/session';
import * as reserveBaseController from '../reserveBase';

const PURCHASER_GROUP: string = ReservationUtil.PURCHASER_GROUP_WINDOW;
const layout: string = 'layouts/window/layout';

export async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = await reserveBaseController.processStart(PURCHASER_GROUP, req);
        reservationModel.save(req);

        if (reservationModel.performance !== undefined) {
            const cb = '/window/reserve/seats';
            res.redirect(`/window/reserve/terms?cb=${encodeURIComponent(cb)}`);
        } else {
            const cb = '/window/reserve/performances';
            res.redirect(`/window/reserve/terms?cb=${encodeURIComponent(cb)}`);
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
 * スケジュール選択
 */
export async function performances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReservationModel.FIND(req);

        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));
            return;
        }

        if (req.method === 'POST') {
            reservePerformanceForm(req);
            const validationResult = await req.getValidationResult();
            if (!validationResult.isEmpty()) {
                next(new Error(req.__('Message.UnexpectedError')));
                return;
            }
            try {
                // パフォーマンスFIX
                await reserveBaseController.processFixPerformance(reservationModel, req.body.performanceId, req);
                reservationModel.save(req);
                res.redirect('/window/reserve/seats');
            } catch (error) {
                next(error);
            }

        } else {
            // 仮予約あればキャンセルする
            try {
                await reserveBaseController.processCancelSeats(reservationModel);
                reservationModel.save(req);

                res.render('window/reserve/performances', {
                    FilmUtil: FilmUtil,
                    layout: layout
                });
            } catch (error) {
                next(error);
            }
        }
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}

/**
 * 座席選択
 */
export async function seats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReservationModel.FIND(req);

        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));
            return;
        }

        const limit = reservationModel.getSeatsLimit();

        if (req.method === 'POST') {
            reserveSeatForm(req);
            const validationResult = await req.getValidationResult();
            if (!validationResult.isEmpty()) {
                res.redirect('/window/reserve/seats');
                return;
            }
            const seatCodes: string[] = JSON.parse(req.body.seatCodes);

            // 追加指定席を合わせて制限枚数を超過した場合
            if (seatCodes.length > limit) {
                const message = req.__('Message.seatsLimit{{limit}}', { limit: limit.toString() });
                res.redirect(`/window/reserve/seats?message=${encodeURIComponent(message)}`);
                return;
            }

            // 仮予約あればキャンセルする
            await reserveBaseController.processCancelSeats(reservationModel);

            try {
                // 座席FIX
                await reserveBaseController.processFixSeats(reservationModel, seatCodes, req);
                reservationModel.save(req);
                // 券種選択へ
                res.redirect('/window/reserve/tickets');
            } catch (error) {
                reservationModel.save(req);
                const message = req.__('Message.SelectedSeatsUnavailable');
                res.redirect(`/window/reserve/seats?message=${encodeURIComponent(message)}`);
                return;
            }
        } else {
            res.render('window/reserve/seats', {
                reservationModel: reservationModel,
                limit: limit,
                layout: layout
            });
            return;
        }
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }
}

/**
 * 券種選択
 */
export async function tickets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReservationModel.FIND(req);

        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));
            return;
        }

        reservationModel.paymentMethod = '';

        if (req.method === 'POST') {
            try {
                await reserveBaseController.processFixTickets(reservationModel, req);
                reservationModel.save(req);
                res.redirect('/window/reserve/profile');
            } catch (error) {
                res.redirect('/window/reserve/tickets');
            }
        } else {
            res.render('window/reserve/tickets', {
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
        const reservationModel = ReservationModel.FIND(req);

        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));
            return;
        }

        if (req.method === 'POST') {
            try {
                await reserveBaseController.processFixProfile(reservationModel, req, res);
                await reserveBaseController.processAllExceptConfirm(reservationModel, req);
                reservationModel.save(req);
                res.redirect('/window/reserve/confirm');
            } catch (error) {
                res.render('window/reserve/profile', {
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
            res.locals.paymentMethod = GMOUtil.PAY_TYPE_CREDIT;
            if (!_.isEmpty(reservationModel.paymentMethod)) {
                res.locals.paymentMethod = reservationModel.paymentMethod;
            }

            res.render('window/reserve/profile', {
                reservationModel: reservationModel,
                layout: layout
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
        const reservationModel = ReservationModel.FIND(req);

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
                await reserveBaseController.processFixReservations(reservationModel.performance.day, reservationModel.paymentNo, {}, res);
                ReservationModel.REMOVE(req);
                res.redirect(`/window/reserve/${reservationModel.performance.day}/${reservationModel.paymentNo}/complete`);
            } catch (error) {
                ReservationModel.REMOVE(req);
                next(error);
            }
        } else {
            res.render('window/reserve/confirm', {
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
    if (req.windowUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    try {
        const reservations = await Models.Reservation.find(
            {
                performance_day: req.params.performanceDay,
                payment_no: req.params.paymentNo,
                status: ReservationUtil.STATUS_RESERVED,
                window: req.windowUser.get('_id'),
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
            return ScreenUtil.sortBySeatCode(a.get('seat_code'), b.get('seat_code'));
        });

        res.render('window/reserve/complete', {
            reservationDocuments: reservations,
            layout: layout
        });
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}
