/**
 * 入場コントローラー
 * 上映当日入場画面から使う機能はここにあります。
 */
import * as cinerinoapi from '@cinerino/sdk';
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import { NextFunction, Request, Response } from 'express';
// tslint:disable-next-line:ordered-imports
import { BAD_REQUEST, CREATED, INTERNAL_SERVER_ERROR, NOT_FOUND, NO_CONTENT } from 'http-status';
import * as moment from 'moment-timezone';

import { chevreReservation2ttts } from '../util/reservation';

const authClient = new cinerinoapi.auth.ClientCredentials({
    domain: <string>process.env.API_AUTHORIZE_SERVER_DOMAIN,
    clientId: <string>process.env.API_CLIENT_ID_CLIENT_CREDENTIALS,
    clientSecret: <string>process.env.API_CLIENT_SECRET_CLIENT_CREDENTIALS,
    scopes: [],
    state: ''
});

const tokenService = new cinerinoapi.service.Token({
    endpoint: <string>process.env.CINERINO_API_ENDPOINT,
    auth: authClient
});
const reservationService = new cinerinoapi.service.Reservation({
    endpoint: <string>process.env.CINERINO_API_ENDPOINT,
    auth: authClient
});

/**
 * QRコード認証画面
 * @desc Rコードを読み取って結果を表示するための画面
 */
export async function confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req === null) {
        next(new Error('unexepected error'));
    }
    try {
        res.render('checkIn/confirm', {
            checkinAdminUser: req.staffUser,
            layout: 'layouts/checkIn/layout',
            pageId: 'page_checkin_confirm',
            pageClassName: 'page-checkin page-confirm'
        });
    } catch (error) {
        next(new Error('unexepected error'));
    }
}
// for kusunose test
export async function confirmTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (req === null) {
            next(new Error('unexepected error'));
        }
        res.render('checkIn/confirmTest', {
            checkinAdminUser: req.staffUser,
            layout: 'layouts/checkIn/layout',
            pageId: 'page_checkin_confirm',
            pageClassName: 'page-checkin page-confirm'
        });
    } catch (error) {
        next(new Error('unexepected error'));
    }
}

/**
 * 予約情報取得
 */
export async function getReservations(req: Request, res: Response): Promise<void> {
    try {
        const now = moment();

        if (req.staffUser === undefined) {
            throw new Error('checkinAdminUser not defined.');
        }

        // 予約を検索
        const tttsReservationService = new tttsapi.service.Reservation({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });

        const searchReservationsResult = await tttsReservationService.search({
            limit: 100,
            typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
            reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed],
            reservationFor: {
                id: ((typeof req.body.performanceId === 'number' || typeof req.body.performanceId === 'string')
                    && String(req.body.performanceId).length > 0)
                    ? String(req.body.performanceId)
                    : undefined,
                startThrough: now.add(1, 'second').toDate(),
                ...{ endFrom: now.toDate() }
            },
            ...{
                noTotalCount: '1'
            }
        });
        const reservations = searchReservationsResult.data.map(chevreReservation2ttts);

        const reservationsById: {
            [id: string]: tttsapi.factory.reservation.event.IReservation;
        } = {};
        const reservationIdsByQrStr: {
            [qr: string]: string;
        } = {};
        reservations.forEach((reservation) => {
            reservationsById[reservation.id] = reservation;
            reservationIdsByQrStr[reservation.id] = reservation.id;
        });

        res.json({
            error: null,
            reservationsById: reservationsById,
            reservationIdsByQrStr: reservationIdsByQrStr
        });
    } catch (error) {
        res.json({
            error: '予約情報取得失敗'
        });
    }
}

/**
 * 予約情報取得
 */
export async function getReservation(req: Request, res: Response): Promise<void> {
    if (req.staffUser === undefined) {
        throw new Error('checkinAdminUser not defined.');
    }
    if (!req.staffUser.isAuthenticated()) {
        throw new Error('checkinAdminUser not authenticated.');
    }

    try {
        const tttsReservationService = new tttsapi.service.Reservation({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const reservation = await tttsReservationService.findById({ id: req.params.qr });
        if (reservation.reservationStatus !== tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed) {
            res.status(NOT_FOUND).json(null);
        } else {
            res.json(chevreReservation2ttts(reservation));
        }
    } catch (error) {
        if (error.code === NOT_FOUND) {
            res.status(NOT_FOUND).json(null);

            return;
        }

        res.status(INTERNAL_SERVER_ERROR).json({
            error: '予約情報取得失敗',
            message: error
        });
    }
}

/**
 * チェックイン作成
 */
export async function addCheckIn(req: Request, res: Response): Promise<void> {
    try {
        if (req.staffUser === undefined) {
            throw new Error('checkinAdminUser not defined.');
        }
        if (!req.staffUser.isAuthenticated()) {
            throw new Error('checkinAdminUser not authenticated.');
        }

        if (!req.body.when || !req.body.where || !req.body.how) {
            res.status(BAD_REQUEST).json({
                error: 'チェックイン情報作成失敗',
                message: 'Invalid checkin.'
            });

            return;
        }

        const checkin = {
            when: moment(req.body.when).toDate(),
            where: req.body.where,
            why: '',
            how: req.body.how
        };

        const reservationId = req.params.qr;

        const tttsReservationService = new tttsapi.service.Reservation({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        await tttsReservationService.addCheckin({
            reservationId: reservationId,
            checkin: checkin
        });

        // Cinerinoで、req.body.codeを使用して予約使用
        const code = req.body.code;
        if (typeof code === 'string' && code.length > 0) {
            try {
                // getToken
                const { token } = await tokenService.getToken({ code });

                // 予約使用
                await reservationService.useByToken({
                    object: { id: reservationId },
                    instrument: { token },
                    ...{
                        location: { identifier: checkin.where }
                    }
                });
            } catch (error) {
                // tslint:disable-next-line:no-console
                console.error('useByToken failed', error);
            }
        }

        res.status(CREATED).json(checkin);
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            error: 'チェックイン情報作成失敗',
            message: error.message
        });
    }
}
/**
 * チェックイン取り消し
 */
export async function removeCheckIn(req: Request, res: Response): Promise<void> {
    try {
        if (req.staffUser === undefined) {
            throw new Error('checkinAdminUser not defined.');
        }
        if (!req.staffUser.isAuthenticated()) {
            throw new Error('checkinAdminUser not authenticated.');
        }
        if (!req.body.when) {
            res.status(BAD_REQUEST).json({
                error: 'チェックイン取り消し失敗',
                message: 'Invalid request.'
            });

            return;
        }

        const tttsReservationService = new tttsapi.service.Reservation({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        await tttsReservationService.cancelCheckin({
            reservationId: req.params.qr,
            when: moment(req.body.when).toDate()
        });

        res.status(NO_CONTENT).end();
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            error: 'チェックイン取り消し失敗',
            message: error.message
        });
    }
}
