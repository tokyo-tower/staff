/**
 * 座席予約コントローラー
 */
import * as cinerinoapi from '@cinerino/api-nodejs-client';

import * as conf from 'config';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import { CONFLICT, TOO_MANY_REQUESTS } from 'http-status';
import * as jwt from 'jsonwebtoken';
import * as moment from 'moment-timezone';
import * as numeral from 'numeral';
import * as _ from 'underscore';

import reservePerformanceForm from '../../forms/reserve/reservePerformanceForm';
import ReserveSessionModel from '../../models/reserve/session';
import * as reserveBaseController from '../reserveBase';

const debug = createDebug('ttts-staff:controller');

const layout: string = 'layouts/staff/layout';

const reserveMaxDateInfo = conf.get<{ [period: string]: number }>('reserve_max_date');

export async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // 購入結果セッション初期化
        delete (<Express.Session>req.session).transactionResult;
        delete (<Express.Session>req.session).printToken;

        const reservationModel = await reserveBaseController.processStart(req);
        reservationModel.save(req);

        if (reservationModel.transactionInProgress.performance !== undefined) {
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
                    reservationModel,
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
                reserveStartDate: '',
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

        reservationModel.transactionInProgress.paymentMethod = reserveBaseController.PaymentMethodType.CP;

        if (req.method === 'POST') {
            // 仮予約あればキャンセルする
            try {
                // セッション中の予約リストを初期化
                reservationModel.transactionInProgress.reservations = [];

                // 座席仮予約があればキャンセル
                if (reservationModel.transactionInProgress.seatReservationAuthorizeActionId !== undefined) {
                    const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
                        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
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
                // 現在時刻がイベント終了時刻を過ぎている時
                if (moment(reservationModel.transactionInProgress.performance.endDate).toDate() < moment().toDate()) {
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

                // 残席数不足、あるいは車椅子レート制限を超過の場合
                if (error.code === CONFLICT || error.code === TOO_MANY_REQUESTS) {
                    res.locals.message = req.__('NoAvailableSeats');
                }

                // reservation初期化後のエラーだとcommentが消えちゃうのでセット
                let reserveMemo = '';
                if (Array.isArray(JSON.parse(req.body.choices))) {
                    reserveMemo = JSON.parse(req.body.choices)[0].watcher_name;
                }

                res.render('staff/reserve/tickets', {
                    reservationModel: reservationModel,
                    watcher_name: reserveMemo,
                    layout: layout
                });
            }
        } else {
            // 券種選択画面へ遷移
            res.locals.message = '';
            res.render('staff/reserve/tickets', {
                reservationModel: reservationModel,
                watcher_name: '',
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
                    : reserveBaseController.PaymentMethodType.CP;

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
// tslint:disable-next-line:max-func-body-length
export async function confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const reservationModel = ReserveSessionModel.FIND(req);
        if (reservationModel === null || moment(reservationModel.transactionInProgress.expires).toDate() <= moment().toDate()) {
            next(new Error(req.__('Expired')));

            return;
        }

        if (req.method === 'POST') {
            try {
                const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
                    endpoint: <string>process.env.CINERINO_API_ENDPOINT,
                    auth: req.tttsAuthClient
                });
                const paymentService = new cinerinoapi.service.Payment({
                    endpoint: <string>process.env.CINERINO_API_ENDPOINT,
                    auth: req.tttsAuthClient
                });

                // 汎用決済承認
                const amount = reservationModel.getTotalCharge();
                const paymentAuthorization = await paymentService.authorizeAnyPayment({
                    object: {
                        typeOf: cinerinoapi.factory.paymentMethodType.Others,
                        name: reservationModel.transactionInProgress.paymentMethod,
                        additionalProperty: [],
                        amount: amount
                    },
                    purpose: { typeOf: cinerinoapi.factory.transactionType.PlaceOrder, id: reservationModel.transactionInProgress.id }
                });
                debug('payment authorized', paymentAuthorization);

                const { potentialActions, result } = await createPotentialActions(reservationModel, res);

                // 取引確定
                const transactionResult = await placeOrderTransactionService.confirm({
                    id: reservationModel.transactionInProgress.id,
                    potentialActions: potentialActions,
                    ...{
                        result: result
                    }
                });

                // 印刷トークン生成
                const reservationIds =
                    transactionResult.order.acceptedOffers.map((o) => (<cinerinoapi.factory.order.IReservation>o.itemOffered).id);
                const printToken = await createPrintToken(reservationIds);

                // 購入結果セッション作成
                (<Express.Session>req.session).transactionResult = { ...transactionResult, printToken: printToken };

                // 購入フローセッションは削除
                ReserveSessionModel.REMOVE(req);

                res.redirect('/staff/reserve/complete');

                return;
            } catch (error) {
                ReserveSessionModel.REMOVE(req);
                next(error);

                return;
            }
        } else {
            // チケットを券種コードでソート
            sortReservationstByTicketType(reservationModel.transactionInProgress.reservations);

            const ticketInfos: { [key: string]: any } = {};
            for (const reservation of reservationModel.transactionInProgress.reservations) {
                const ticketType = reservation.reservedTicket.ticketType;
                const price = reservation.unitPrice;

                const dataValue = ticketType.identifier;
                // チケットタイプごとにチケット情報セット
                if (!ticketInfos.hasOwnProperty(dataValue)) {
                    ticketInfos[dataValue] = {
                        ticket_type_name: ticketType.name,
                        charge: `\\${numeral(price).format('0,0')}`,
                        watcher_name: reservation.additionalTicketText,
                        count: 1
                    };
                } else {
                    ticketInfos[dataValue].count += 1;
                }
            }

            // 券種ごとの表示情報編集
            Object.keys(ticketInfos).forEach((key) => {
                const ticketInfo = ticketInfos[key];
                ticketInfos[key].info =
                    `${ticketInfo.ticket_type_name[res.locale]} ${ticketInfo.charge} × ${res.__('{{n}}Leaf', { n: ticketInfo.count })}`;
            });

            res.render('staff/reserve/confirm', {
                reservationModel: reservationModel,
                ticketInfos: ticketInfos,
                layout: layout
            });
        }
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}

/**
 * 印刷トークンインターフェース
 */
export type IPrintToken = string;
/**
 * 印刷トークン対象(予約IDリスト)インターフェース
 */
export type IPrintObject = string[];

/**
 * 予約印刷トークンを発行する
 */
export async function createPrintToken(object: IPrintObject): Promise<IPrintToken> {
    return new Promise<IPrintToken>((resolve, reject) => {
        const payload = {
            object: object
        };

        jwt.sign(payload, <string>process.env.TTTS_TOKEN_SECRET, (jwtErr, token) => {
            if (jwtErr instanceof Error) {
                reject(jwtErr);
            } else {
                resolve(token);
            }
        });
    });
}

// tslint:disable-next-line:max-func-body-length
async function createPotentialActions(reservationModel: ReserveSessionModel, res: Response):
    Promise<{
        potentialActions: cinerinoapi.factory.transaction.placeOrder.IPotentialActionsParams;
        result: any;
    }> {
    // 予約連携パラメータ作成
    const authorizeSeatReservationResult = reservationModel.transactionInProgress.authorizeSeatReservationResult;
    if (authorizeSeatReservationResult === undefined) {
        throw new Error('No Seat Reservation');
    }
    const acceptedOffers = (Array.isArray(authorizeSeatReservationResult.acceptedOffers))
        ? authorizeSeatReservationResult.acceptedOffers
        : [];
    const reserveTransaction = authorizeSeatReservationResult.responseBody;
    if (reserveTransaction === undefined) {
        throw new cinerinoapi.factory.errors.Argument('Transaction', 'Reserve trasaction required');
    }
    const chevreReservations = (Array.isArray(reserveTransaction.object.reservations))
        ? reserveTransaction.object.reservations
        : [];

    let paymentNo: string | undefined;
    if (chevreReservations[0].underName !== undefined && Array.isArray(chevreReservations[0].underName.identifier)) {
        const paymentNoProperty = chevreReservations[0].underName.identifier.find((p) => p.name === 'paymentNo');
        if (paymentNoProperty !== undefined) {
            paymentNo = paymentNoProperty.value;
        }
    }
    if (paymentNo === undefined) {
        throw new Error('Payment No Not Found');
    }

    const transactionAgent = reservationModel.transactionInProgress.agent;
    if (transactionAgent === undefined) {
        throw new Error('No Transaction Agent');
    }

    const customerProfile = reservationModel.transactionInProgress.profile;
    if (customerProfile === undefined) {
        throw new Error('No Customer Profile');
    }

    // 予約確定パラメータを生成
    const eventReservations = acceptedOffers.map((acceptedOffer, index) => {
        const reservation = acceptedOffer.itemOffered;

        const chevreReservation = chevreReservations.find((r) => r.id === reservation.id);
        if (chevreReservation === undefined) {
            throw new cinerinoapi.factory.errors.Argument('Transaction', `Unexpected temporary reservation: ${reservation.id}`);
        }

        return temporaryReservation2confirmed({
            reservation: reservation,
            chevreReservation: chevreReservation,
            transactionId: reservationModel.transactionInProgress.id,
            customer: transactionAgent,
            profile: customerProfile,
            paymentNo: <string>paymentNo,
            gmoOrderId: '',
            paymentSeatIndex: index.toString(),
            paymentMethodName: reservationModel.transactionInProgress.paymentMethod
        });
    });

    const confirmReservationParams: cinerinoapi.factory.transaction.placeOrder.IConfirmReservationParams[] = [];
    confirmReservationParams.push({
        object: {
            typeOf: reserveTransaction.typeOf,
            id: reserveTransaction.id,
            object: {
                reservations: [
                    ...eventReservations.map((r) => {
                        // プロジェクト固有の値を連携
                        return {
                            id: r.id,
                            additionalTicketText: r.additionalTicketText,
                            underName: r.underName,
                            additionalProperty: r.additionalProperty
                        };
                    }),
                    // 余分確保分の予約にもextraプロパティを連携
                    ...chevreReservations.filter((r) => {
                        // 注文アイテムに存在しない予約(余分確保分)にフィルタリング
                        const orderItem = eventReservations.find(
                            (eventReservation) => eventReservation.id === r.id
                        );

                        return orderItem === undefined;
                    })
                        .map((r) => {
                            return {
                                id: r.id,
                                additionalProperty: [
                                    { name: 'extra', value: '1' }
                                ]
                            };
                        })
                ]
            }
        }
    });

    const event = reservationModel.transactionInProgress.performance;
    if (event === undefined) {
        throw new cinerinoapi.factory.errors.Argument('Transaction', 'Event required');
    }
    const ticketTypes = reservationModel.transactionInProgress.ticketTypes
        .filter((t) => Number(t.count) > 0);

    const emailAttributes = await reserveBaseController.createEmailAttributes(
        event,
        customerProfile,
        paymentNo,
        ticketTypes,
        res
    );

    const eventStartDateStr = moment(event.startDate)
        .tz('Asia/Tokyo')
        .format('YYYYMMDD');
    const confirmationNumber = `${eventStartDateStr}${paymentNo}`;
    const confirmationPass = (typeof customerProfile.telephone === 'string')
        // tslint:disable-next-line:no-magic-numbers
        ? customerProfile.telephone.slice(-4)
        : '9999';

    return {
        potentialActions: {
            order: {
                potentialActions: {
                    sendOrder: {
                        potentialActions: {
                            confirmReservation: confirmReservationParams,
                            sendEmailMessage: [{
                                object: emailAttributes
                            }]
                        }
                    },
                    informOrder: [
                        { recipient: { url: `${<string>process.env.API_ENDPOINT}/webhooks/onPlaceOrder` } }
                    ]
                }
            }
        },
        result: {
            order: {
                identifier: [
                    { name: 'confirmationNumber', value: confirmationNumber },
                    { name: 'confirmationPass', value: confirmationPass }
                ]
            }
        }
    };
}

/**
 * 仮予約から確定予約を生成する
 */
function temporaryReservation2confirmed(params: {
    reservation: cinerinoapi.factory.order.IReservation;
    chevreReservation: cinerinoapi.factory.chevre.reservation.IReservation<cinerinoapi.factory.chevre.reservationType.EventReservation>;
    transactionId: string;
    customer: cinerinoapi.factory.transaction.placeOrder.IAgent;
    profile: cinerinoapi.factory.person.IProfile;
    paymentNo: string;
    gmoOrderId: string;
    paymentSeatIndex: string;
    paymentMethodName: string;
}): cinerinoapi.factory.chevre.reservation.IReservation<cinerinoapi.factory.chevre.reservationType.EventReservation> {
    const customer = params.customer;

    const underName: cinerinoapi.factory.chevre.reservation.IUnderName<cinerinoapi.factory.chevre.reservationType.EventReservation> = {
        ...params.profile,
        typeOf: cinerinoapi.factory.personType.Person,
        id: customer.id,
        name: `${params.profile.givenName} ${params.profile.familyName}`,
        identifier: [
            { name: 'paymentNo', value: params.paymentNo },
            { name: 'transaction', value: params.transactionId },
            { name: 'gmoOrderId', value: params.gmoOrderId },
            ...(typeof params.profile.age === 'string')
                ? [{ name: 'age', value: params.profile.age }]
                : [],
            ...(Array.isArray(customer.identifier)) ? customer.identifier : [],
            ...(customer.memberOf !== undefined && customer.memberOf.membershipNumber !== undefined)
                ? [{ name: 'username', value: customer.memberOf.membershipNumber }]
                : [],
            ...(params.paymentMethodName !== undefined)
                ? [{ name: 'paymentMethod', value: params.paymentMethodName }]
                : []
        ]
    };

    return {
        ...params.chevreReservation,
        underName: underName,
        additionalProperty: [
            ...(Array.isArray(params.reservation.additionalProperty)) ? params.reservation.additionalProperty : [],
            { name: 'paymentSeatIndex', value: params.paymentSeatIndex }
        ],
        additionalTicketText: params.reservation.additionalTicketText
    };
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

        const reservations = transactionResult.order.acceptedOffers.map((o) => {
            const unitPrice = reserveBaseController.getUnitPriceByAcceptedOffer(o);

            return {
                ...<cinerinoapi.factory.order.IReservation>o.itemOffered,
                unitPrice: unitPrice
            };
        });

        // チケットを券種コードでソート
        sortReservationstByTicketType(reservations);

        res.render('staff/reserve/complete', {
            order: transactionResult.order,
            reservations: reservations,
            printToken: transactionResult.printToken,
            layout: layout
        });
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}

/**
 * チケットを券種コードでソートする
 */
function sortReservationstByTicketType(reservations: Express.ITmpReservation[]): void {
    // チケットを券種コードでソート
    reservations.sort((a, b) => {
        if (a.reservedTicket.ticketType.identifier > b.reservedTicket.ticketType.identifier) {
            return 1;
        }
        if (a.reservedTicket.ticketType.identifier < b.reservedTicket.ticketType.identifier) {
            return -1;
        }

        return 0;
    });
}
