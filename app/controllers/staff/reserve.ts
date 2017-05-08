/**
 * 内部関係者座席予約コントローラー
 *
 * @namespace controller/staff/reserve
 */

import * as chevre from '@motionpicture/chevre-domain';
import * as conf from 'config';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as _ from 'underscore';

import reservePerformanceForm from '../../forms/reserve/reservePerformanceForm';
import reserveSeatForm from '../../forms/reserve/reserveSeatForm';
import ReservationModel from '../../models/reserve/session';
import * as reserveBaseController from '../reserveBase';

const PURCHASER_GROUP: string = chevre.ReservationUtil.PURCHASER_GROUP_STAFF;
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
            const cb = '/staff/reserve/seats';
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
 * スケジュール選択
 * @method performances
 * @returns {Promise<void>}
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
                await reserveBaseController.processFixPerformance(
                    <ReservationModel>reservationModel,
                    req.body.performanceId,
                    req
                );
                reservationModel.save(req);
                res.redirect('/staff/reserve/seats');
                return;
            } catch (error) {
                next(new Error(req.__('Message.UnexpectedError')));
                return;
            }
        } else {
            // 仮予約あればキャンセルする
            await processCancelSeats(<ReservationModel>reservationModel);
            reservationModel.save(req);

            res.render('staff/reserve/performances', {
                FilmUtil: chevre.FilmUtil,
                layout: layout
            });
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
        let reservationModel = ReservationModel.FIND(req);

        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));
            return;
        }

        const limit = reservationModel.getSeatsLimit();

        if (req.method === 'POST') {
            reserveSeatForm(req);
            const validationResult = await req.getValidationResult();
            if (!validationResult.isEmpty()) {
                res.redirect('/staff/reserve/seats');
                return;
            }
            reservationModel = <ReservationModel>reservationModel;
            const seatCodes: string[] = JSON.parse(req.body.seatCodes);

            // 追加指定席を合わせて制限枚数を超過した場合
            if (seatCodes.length > limit) {
                const message = req.__('Message.seatsLimit{{limit}}', { limit: limit.toString() });
                res.redirect(`/staff/reserve/seats?message=${encodeURIComponent(message)}`);
                return;
            }

            // 仮予約あればキャンセルする
            await processCancelSeats(reservationModel);

            try {
                // 座席FIX
                await processFixSeats(reservationModel, seatCodes, req);
                reservationModel.save(req);
                // 券種選択へ
                res.redirect('/staff/reserve/tickets');
                return;
            } catch (error) {
                reservationModel.save(req);
                const message = req.__('Message.SelectedSeatsUnavailable');
                res.redirect(`/staff/reserve/seats?message=${encodeURIComponent(message)}`);
                return;
            }
        } else {
            res.render('staff/reserve/seats', {
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

        if (req.method === 'POST') {
            try {
                await reserveBaseController.processFixTickets(reservationModel, req);
                reservationModel.save(req);
                res.redirect('/staff/reserve/profile');
            } catch (error) {
                res.redirect('/staff/reserve/tickets');
            }
        } else {
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
 * 購入者情報(スキップ)
 */
export async function profile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReservationModel.FIND(req);

        if (reservationModel === null) {
            next(new Error(req.__('Message.Expired')));
            return;
        }

        await reserveBaseController.processAllExceptConfirm(reservationModel, req);
        res.redirect('/staff/reserve/confirm');
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
                res.redirect(`/staff/reserve/${reservationModel.performance.day}/${reservationModel.paymentNo}/complete`);
            } catch (error) {
                ReservationModel.REMOVE(req);
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

export async function complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    try {
        const reservations = await chevre.Models.Reservation.find(
            {
                performance_day: req.params.performanceDay,
                payment_no: req.params.paymentNo,
                status: chevre.ReservationUtil.STATUS_RESERVED,
                staff: req.staffUser.get('_id'),
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
            return chevre.ScreenUtil.sortBySeatCode(a.get('seat_code'), b.get('seat_code'));
        });

        res.render('staff/reserve/complete', {
            reservationDocuments: reservations,
            layout: layout
        });
    } catch (error) {
        next(new Error(req.__('Message.UnexpectedError')));
    }
}

/**
 * 予約フロー中の座席をキャンセルするプロセス
 *
 * @override
 */
// tslint:disable-next-line:prefer-function-over-method
export async function processCancelSeats(reservationModel: ReservationModel): Promise<void> {
    const seatCodesInSession = (reservationModel.seatCodes !== undefined) ? reservationModel.seatCodes : [];
    if (seatCodesInSession.length === 0) {
        return;
    }

    // セッション中の予約リストを初期化
    reservationModel.seatCodes = [];

    // 仮予約をCHEVRE確保ステータスに戻す
    try {
        await chevre.Models.Reservation.update(
            {
                performance: reservationModel.performance._id,
                seat_code: { $in: seatCodesInSession },
                status: chevre.ReservationUtil.STATUS_TEMPORARY_ON_KEPT_BY_CHEVRE
            },
            {
                $set: {
                    status: chevre.ReservationUtil.STATUS_KEPT_BY_CHEVRE
                },
                $unset: {
                    staff: ''
                }
            },
            {
                multi: true
            }
        ).exec();

        // 仮予約を空席ステータスに戻す
        await chevre.Models.Reservation.remove(
            {
                performance: reservationModel.performance._id,
                seat_code: { $in: seatCodesInSession },
                status: chevre.ReservationUtil.STATUS_TEMPORARY
            }
        ).exec();
    } catch (error) {
        // 失敗したとしても時間経過で消えるので放置
    }
}

/**
 * 座席をFIXするプロセス
 *
 * @override
 */
export async function processFixSeats(reservationModel: ReservationModel, seatCodes: string[], req: Request): Promise<void> {
    if (req.staffUser === undefined) {
        throw new Error(req.__('Message.UnexpectedError'));
    }

    const staffUser = req.staffUser;

    // セッション中の予約リストを初期化
    reservationModel.seatCodes = [];
    reservationModel.expiredAt = moment().add(conf.get<number>('temporary_reservation_valid_period_seconds'), 'seconds').valueOf();

    // 新たな座席指定と、既に仮予約済みの座席コードについて
    const promises = seatCodes.map(async (seatCode) => {
        const seatInfo = reservationModel.performance.screen.sections[0].seats.find((seat) => {
            return (seat.code === seatCode);
        });

        // 万が一、座席が存在しなかったら
        if (seatInfo === undefined) {
            throw new Error(req.__('Message.InvalidSeatCode'));
        }

        // 予約データを作成(同時作成しようとしたり、既に予約があったとしても、unique indexではじかれる)
        try {
            const reservation = await chevre.Models.Reservation.create(
                {
                    performance: reservationModel.performance._id,
                    seat_code: seatCode,
                    status: chevre.ReservationUtil.STATUS_TEMPORARY,
                    expired_at: reservationModel.expiredAt,
                    staff: staffUser.get('_id')
                }
            );

            // ステータス更新に成功したらセッションに保管
            reservationModel.seatCodes.push(seatCode);
            reservationModel.setReservation(seatCode, {
                _id: reservation.get('_id'),
                status: reservation.get('status'),
                seat_code: reservation.get('seat_code'),
                seat_grade_name: seatInfo.grade.name,
                seat_grade_additional_charge: seatInfo.grade.additional_charge,
                ticket_type: '',
                ticket_type_name: {
                    ja: '',
                    en: ''
                },
                ticket_type_charge: 0,
                watcher_name: ''
            });
        } catch (error) {
            // CHEVRE確保からの仮予約を試みる
            const reservation = await chevre.Models.Reservation.findOneAndUpdate(
                {
                    performance: reservationModel.performance._id,
                    seat_code: seatCode,
                    status: chevre.ReservationUtil.STATUS_KEPT_BY_CHEVRE
                },
                {
                    status: chevre.ReservationUtil.STATUS_TEMPORARY_ON_KEPT_BY_CHEVRE,
                    expired_at: reservationModel.expiredAt,
                    staff: staffUser.get('_id')
                },
                {
                    new: true
                }
            ).exec();

            if (reservation === null) {
                throw new Error(req.__('Message.UnexpectedError'));
            }

            // ステータス更新に成功したらセッションに保管
            reservationModel.seatCodes.push(seatCode);
            reservationModel.setReservation(seatCode, {
                _id: reservation.get('_id'),
                status: reservation.get('status'),
                seat_code: reservation.get('seat_code'),
                seat_grade_name: seatInfo.grade.name,
                seat_grade_additional_charge: seatInfo.grade.additional_charge,
                ticket_type: '',
                ticket_type_name: {
                    ja: '',
                    en: ''
                },
                ticket_type_charge: 0,
                watcher_name: ''
            });
        }
    });

    await Promise.all(promises);
    // 座席コードのソート(文字列順に)
    reservationModel.seatCodes.sort(chevre.ScreenUtil.sortBySeatCode);
}
