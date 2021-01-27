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

import { chevreReservation2ttts, ICheckin, IReservation } from '../util/reservation';

const CODE_EXPIRES_IN_SECONDS = 60; // その場で使用するだけなので短くてよし

/**
 * QRコード認証画面
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
 * いったん予約キャッシュを廃止してみる
 */
export async function getReservations(req: Request, res: Response): Promise<void> {
    try {
        if (req.staffUser === undefined) {
            throw new Error('checkinAdminUser not defined.');
        }

        const reservationsById: {
            [id: string]: IReservation;
        } = {};
        const reservationIdsByQrStr: {
            [qr: string]: string;
        } = {};

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
        const reservationService = new cinerinoapi.service.Reservation({
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient,
            project: { id: req.project?.id }
        });
        const searchReservationsResult = await reservationService.search<cinerinoapi.factory.chevre.reservationType.EventReservation>({
            typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
            id: { $eq: req.params.qr }
        });
        const reservation = searchReservationsResult.data.shift();
        if (reservation === undefined) {
            res.status(NOT_FOUND)
                .json(null);

            return;
        }

        if (reservation.reservationStatus !== tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed) {
            res.status(NOT_FOUND)
                .json(null);

            return;
        }

        // 予約使用アクション検索
        const searchUseActionsResult = await reservationService.searchUseActions({
            object: { id: reservation.id }
        });
        const checkins: ICheckin[] = searchUseActionsResult.data
            .filter((action) => {

                const agentIdentifier = action.agent.identifier;

                return Array.isArray(agentIdentifier)
                    && typeof agentIdentifier.find((p) => p.name === 'when')?.value === 'string';
            })
            .map((action) => {
                const agentIdentifier = action.agent.identifier;

                let when: string = '';
                let where: string | undefined;
                let why: string | undefined;
                let how: string | undefined;
                if (Array.isArray(agentIdentifier)) {
                    when = <string>agentIdentifier.find((p) => p.name === 'when')?.value;
                    where = agentIdentifier.find((p) => p.name === 'where')?.value;
                    why = agentIdentifier.find((p) => p.name === 'why')?.value;
                    how = agentIdentifier.find((p) => p.name === 'how')?.value;
                }

                return {
                    when: moment(when)
                        .toDate(),
                    where: (typeof where === 'string') ? where : '',
                    why: (typeof why === 'string') ? why : '',
                    how: (typeof how === 'string') ? how : '',
                    id: action.id
                };
            });

        res.json(chevreReservation2ttts({
            ...reservation,
            checkins
        }));
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
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
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

        const reservationId = <string>req.params.qr;

        // 予約取得
        const reservationService = new cinerinoapi.service.Reservation({
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient,
            project: { id: req.project?.id }
        });
        const searchReservationsResult = await reservationService.search<cinerinoapi.factory.chevre.reservationType.EventReservation>({
            typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
            id: { $eq: reservationId }
        });
        const reservation = searchReservationsResult.data.shift();
        if (reservation === undefined) {
            throw new cinerinoapi.factory.errors.NotFound('Reservation');
        }

        // Cinerinoで、req.body.codeを使用して予約使用
        let token: string;
        let code: string = req.body.code;

        // コードの指定がなければ注文コードを発行
        if (typeof code !== 'string' || code.length === 0) {
            code = await publishCode(req, reservation);
        }

        try {
            // getToken
            const tokenService = new cinerinoapi.service.Token({
                endpoint: <string>process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient,
                project: { id: req.project?.id }
            });
            const getTokenResult = await tokenService.getToken({ code });
            token = getTokenResult.token;
        } catch (error) {
            // tslint:disable-next-line:no-console
            console.error('getToken failed', error);
            throw new Error('トークンを発行できませんでした');
        }

        const checkin: ICheckin = {
            when: moment(req.body.when).toDate(),
            where: req.body.where,
            why: '',
            how: req.body.how,
            // トークンを発行できていれば連携
            ...(typeof token === 'string') ? { instrument: { token } } : undefined
        };

        // 注文トークンで予約使用
        await reservationService.useByToken({
            object: { id: reservationId },
            instrument: { token },
            location: { identifier: req.body.where },
            ...{
                agent: {
                    identifier: [
                        ...(typeof req.body.how === 'string' && req.body.how.length > 0)
                            ? [{ name: 'how', value: String(req.body.how) }]
                            : [],
                        ...(typeof req.body.when === 'string' && req.body.when.length > 0)
                            ? [{ name: 'when', value: String(req.body.when) }] : [],
                        ...(typeof req.body.where === 'string' && req.body.where.length > 0)
                            ? [{ name: 'where', value: String(req.body.where) }]
                            : [],
                        ...(typeof req.body.why === 'string' && req.body.why.length > 0)
                            ? [{ name: 'why', value: String(req.body.why) }]
                            : []
                    ]
                },
                // how: "motionpicture"
                // when: "2021-01-06T23:51:18.293Z"
                // where: "Staff"
                includesActionId: '1'
            }
        });

        // 入場済予約リスト更新
        // await updateCheckedReservations(req, reservation);

        res.status(CREATED)
            .json(checkin);
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR)
            .json({
                error: 'チェックイン情報作成失敗',
                message: error.message
            });
    }
}

async function publishCode(
    req: Request,
    reservation: cinerinoapi.factory.chevre.reservation.IReservation<cinerinoapi.factory.chevre.reservationType.EventReservation>
) {
    let code: string;

    try {
        const orderNumber = reservation.underName?.identifier?.find((p) => p.name === 'orderNumber')?.value;
        const telephone = reservation.underName?.telephone;

        if (typeof orderNumber === 'string' && typeof telephone === 'string') {
            const orderService = new cinerinoapi.service.Order({
                endpoint: <string>process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient,
                project: { id: req.project?.id }
            });

            const authorizeOrderResult = await orderService.authorize({
                object: {
                    orderNumber,
                    customer: { telephone }
                },
                result: {
                    expiresInSeconds: CODE_EXPIRES_IN_SECONDS
                }
            });
            code = authorizeOrderResult.code;
        } else {
            throw new Error('予約に注文番号あるいは電話番号が見つかりません');
        }
    } catch (error) {
        // tslint:disable-next-line:no-console
        console.error('authorize order failed', error);
        throw new Error('コードを発行できませんでした');
    }

    return code;
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
            res.status(BAD_REQUEST)
                .json({
                    error: 'チェックイン取り消し失敗',
                    message: 'Invalid request.'
                });

            return;
        }

        const reservationId = <string>req.params.qr;

        // 予約取得
        const reservationService = new cinerinoapi.service.Reservation({
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient,
            project: { id: req.project?.id }
        });
        const searchReservationsResult = await reservationService.search<cinerinoapi.factory.chevre.reservationType.EventReservation>({
            typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
            id: { $eq: reservationId }
        });
        const reservation = searchReservationsResult.data.shift();
        if (reservation === undefined) {
            throw new cinerinoapi.factory.errors.NotFound('Reservation');
        }

        // 予約使用アクションから取り消そうとしているアクションを検索
        const searchUseActionsResult = await reservationService.searchUseActions({
            object: { id: reservation.id }
        });
        const cancelingAction = searchUseActionsResult.data.find((action) => {
            const agentIdentifier = action.agent.identifier;
            if (!Array.isArray(agentIdentifier)) {
                return false;
            }

            const whenValue = agentIdentifier.find((p) => p.name === 'when')?.value;

            return typeof whenValue === 'string'
                && whenValue === req.body.when;
        });
        if (cancelingAction !== undefined) {
            try {
                await reservationService.cancelUseAction({
                    id: cancelingAction.id,
                    object: { id: reservation.id }
                });
            } catch (error) {
                // tslint:disable-next-line:no-console
                console.log('cancelUseAction failed.', error);
            }
        }

        // 入場済予約リスト更新
        // await updateCheckedReservations(req, reservation);

        res.status(NO_CONTENT)
            .end();
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR)
            .json({
                error: 'チェックイン取り消し失敗',
                message: error.message
            });
    }
}

// async function updateCheckedReservations(
//     req: Request,
//     reservation: cinerinoapi.factory.chevre.reservation.IReservation<cinerinoapi.factory.chevre.reservationType.EventReservation>
// ) {
//     try {
//         // 予約取得
//         const reservationService = new cinerinoapi.service.Reservation({
//             endpoint: <string>process.env.CINERINO_API_ENDPOINT,
//             auth: req.tttsAuthClient,
//             project: { id: req.project?.id }
//         });

//         // 入場済予約検索
//         const searchReservationsResult4event = await reservationService.search({
//             limit: 100,
//             typeOf: cinerinoapi.factory.chevre.reservationType.EventReservation,
//             reservationStatuses: [cinerinoapi.factory.chevre.reservationStatusType.ReservationConfirmed],
//             reservationFor: { id: reservation.reservationFor.id }
//         });
//         const checkedReservations: { id: string }[] = searchReservationsResult4event.data
//             .filter((r) => r.reservedTicket?.dateUsed !== undefined && r.reservedTicket?.dateUsed !== null)
//             .map((r) => {
//                 return { id: String(r.id) };
//             });

//         const performanceService = new tttsapi.service.Event({
//             endpoint: <string>process.env.API_ENDPOINT,
//             auth: req.tttsAuthClient,
//             project: req.project
//         });
//         await performanceService.updateExtension({
//             id: reservation.reservationFor.id,
//             checkedReservations
//         });
//     } catch (error) {
//         // tslint:disable-next-line:no-console
//         console.error('updateCheckedReservations failed', error);
//     }

// }
