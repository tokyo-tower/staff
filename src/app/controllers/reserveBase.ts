/**
 * 座席予約ベースコントローラー
 */
import * as cinerinoapi from '@cinerino/api-nodejs-client';
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as conf from 'config';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import * as moment from 'moment-timezone';
import * as request from 'request-promise-native';
import * as _ from 'underscore';

import reserveProfileForm from '../forms/reserve/reserveProfileForm';
import reserveTicketForm from '../forms/reserve/reserveTicketForm';
import ReserveSessionModel from '../models/reserve/session';
import StaffUser from '../models/user/staff';

const debug = createDebug('ttts-staff:controller');

export enum PaymentMethodType {
    CP = 'CP',
    Invoice = 'Invoice',
    GroupReservation = 'GroupReservation',
    Charter = 'Charter',
    OTC = 'OTC',
    Invitation = 'Invitation'
}

export type IReservationOrderItem = cinerinoapi.factory.order.IReservation;

/**
 * 購入開始プロセス
 */
// tslint:disable-next-line:max-func-body-length
export async function processStart(req: Request): Promise<ReserveSessionModel> {
    // 言語も指定
    (<Express.Session>req.session).locale = (!_.isEmpty(req.query.locale)) ? req.query.locale : 'ja';

    const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const sellerService = new cinerinoapi.service.Seller({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    const searchSellersResult = await sellerService.search({
        limit: 1
    });
    const seller = searchSellersResult.data.shift();
    if (seller === undefined) {
        throw new Error('Seller not found');
    }

    // WAITER許可証を取得
    const scope = 'placeOrderTransaction.TokyoTower.Staff';
    const { token } = await request.post(
        `${process.env.WAITER_ENDPOINT}/projects/${<string>process.env.PROJECT_ID}/passports`,
        {
            json: true,
            body: { scope: scope }
        }
    ).then((body) => body);

    const expires = moment().add(conf.get<number>('temporary_reservation_valid_period_seconds'), 'seconds').toDate();
    const transaction = await placeOrderTransactionService.start({
        agent: {
            identifier: [
                { name: 'customerGroup', value: 'Staff' }
            ]
        },
        expires: expires,
        object: {
            passport: { token: token }
        },
        seller: {
            typeOf: seller.typeOf,
            id: seller.id
        }
    });

    // 取引セッションを初期化
    const transactionInProgress: Express.ITransactionInProgress = {
        id: transaction.id,
        agent: transaction.agent,
        seller: transaction.seller,
        category: req.query.category,
        expires: expires.toISOString(),
        paymentMethodChoices: [],
        ticketTypes: [],
        purchaser: {
            lastName: '',
            firstName: '',
            tel: '',
            email: '',
            age: '',
            address: '',
            gender: ''
        },
        paymentMethod: cinerinoapi.factory.paymentMethodType.CreditCard,
        reservations: []
    };

    const reservationModel = new ReserveSessionModel(transactionInProgress);

    // セッションに購入者情報があれば初期値セット
    const purchaserFromSession = (<Express.Session>req.session).purchaser;
    if (purchaserFromSession !== undefined) {
        reservationModel.transactionInProgress.purchaser = purchaserFromSession;
    }

    if (!_.isEmpty(req.query.performance)) {
        // パフォーマンス指定遷移の場合 パフォーマンスFIX
        await processFixPerformance(reservationModel, req.query.performance, req);
    }

    return reservationModel;
}

/**
 * 座席・券種確定プロセス
 */
export async function processFixSeatsAndTickets(reservationModel: ReserveSessionModel, req: Request): Promise<void> {
    // パフォーマンスは指定済みのはず
    if (reservationModel.transactionInProgress.performance === undefined) {
        throw new Error(req.__('UnexpectedError'));
    }

    // 検証(券種が選択されていること)+チケット枚数合計計算
    const checkInfo = await checkFixSeatsAndTickets(reservationModel, req);
    if (checkInfo.status === false) {
        throw new Error(checkInfo.message);
    }

    // チケット情報に枚数セット(画面で選択された枚数<画面再表示用)
    reservationModel.transactionInProgress.ticketTypes.forEach((ticketType) => {
        const choice = checkInfo.choices.find((c: any) => (ticketType.id === c.ticket_type));
        ticketType.count = (choice !== undefined) ? Number(choice.ticket_count) : 0;
    });

    // セッション中の予約リストを初期化
    reservationModel.transactionInProgress.reservations = [];

    // 座席承認アクション
    const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const offers = checkInfo.choicesAll.map((choice) => {
        return {
            ticket_type: choice.ticket_type,
            watcher_name: choice.watcher_name
        };
    });

    debug(`creating seatReservation authorizeAction on ${offers.length} offers...`);
    // tslint:disable-next-line:max-line-length
    let action: cinerinoapi.factory.action.authorize.offer.seatReservation.IAction<cinerinoapi.factory.service.webAPI.Identifier.Chevre> | undefined;
    try {
        // 車椅子レート制限
        // await processLockTicketTypeCategoryRateLimit(reservationModel, req);

        action = await placeOrderTransactionService.createSeatReservationAuthorization({
            transactionId: reservationModel.transactionInProgress.id,
            performanceId: reservationModel.transactionInProgress.performance.id,
            offers: offers
        });
    } catch (error) {
        await processUnlockTicketTypeCategoryRateLimit(reservationModel, req);

        throw error;
    }

    reservationModel.transactionInProgress.seatReservationAuthorizeActionId = action.id;

    // セッションに保管
    reservationModel.transactionInProgress.authorizeSeatReservationResult = action.result;
    reservationModel.transactionInProgress.reservations = offers.map((o) => {
        const ticketType = reservationModel.transactionInProgress.ticketTypes.find((t) => t.id === o.ticket_type);
        if (ticketType === undefined) {
            throw new Error(`Unknown Ticket Type ${o.ticket_type}`);
        }

        return {
            additionalTicketText: o.watcher_name,
            reservedTicket: { ticketType: ticketType },
            unitPrice: (ticketType.priceSpecification !== undefined) ? ticketType.priceSpecification.price : 0
        };
    });
}

export async function processLockTicketTypeCategoryRateLimit(reservationModel: ReserveSessionModel, req: Request) {
    // パフォーマンスは指定済みのはず
    if (reservationModel.transactionInProgress.performance !== undefined) {
        const tickeTypeCategoryRateLimitService = new tttsapi.service.TicketTypeCategoryRateLimit({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });

        // 車椅子レート制限解放
        const performanceStartDate = moment(reservationModel.transactionInProgress.performance.startDate)
            .toDate();

        await Promise.all(reservationModel.transactionInProgress.ticketTypes.map(async (ticketType) => {
            if (ticketType.count > 0) {
                let ticketTypeCategory = tttsapi.factory.ticketTypeCategory.Normal;
                if (Array.isArray(ticketType.additionalProperty)) {
                    const categoryProperty = ticketType.additionalProperty.find((p) => p.name === 'category');
                    if (categoryProperty !== undefined) {
                        ticketTypeCategory = <tttsapi.factory.ticketTypeCategory>categoryProperty.value;
                    }
                }

                if (ticketTypeCategory === tttsapi.factory.ticketTypeCategory.Wheelchair) {
                    const rateLimitKey = {
                        performanceStartDate: performanceStartDate,
                        ticketTypeCategory: ticketTypeCategory,
                        holder: reservationModel.transactionInProgress.id
                    };
                    debug('locking ticket catefory rate limit...ticketTypeCategory:', rateLimitKey);
                    await tickeTypeCategoryRateLimitService.lock(rateLimitKey);
                    debug('ticket catefory rate limit locked');
                }
            }
        }));
    }
}

export async function processUnlockTicketTypeCategoryRateLimit(reservationModel: ReserveSessionModel, req: Request) {
    // パフォーマンスは指定済みのはず
    if (reservationModel.transactionInProgress.performance !== undefined) {
        const tickeTypeCategoryRateLimitService = new tttsapi.service.TicketTypeCategoryRateLimit({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });

        // 車椅子レート制限解放
        const performanceStartDate = moment(reservationModel.transactionInProgress.performance.startDate)
            .toDate();

        await Promise.all(reservationModel.transactionInProgress.ticketTypes.map(async (ticketType) => {
            if (ticketType.count > 0) {
                let ticketTypeCategory = tttsapi.factory.ticketTypeCategory.Normal;
                if (Array.isArray(ticketType.additionalProperty)) {
                    const categoryProperty = ticketType.additionalProperty.find((p) => p.name === 'category');
                    if (categoryProperty !== undefined) {
                        ticketTypeCategory = <tttsapi.factory.ticketTypeCategory>categoryProperty.value;
                    }
                }

                if (ticketTypeCategory === tttsapi.factory.ticketTypeCategory.Wheelchair) {
                    const rateLimitKey = {
                        performanceStartDate: performanceStartDate,
                        ticketTypeCategory: ticketTypeCategory,
                        holder: reservationModel.transactionInProgress.id
                    };
                    debug('unlocking ticket catefory rate limit...ticketTypeCategory:', rateLimitKey);
                    await tickeTypeCategoryRateLimitService.unlock(rateLimitKey);
                    debug('ticket catefory rate limit unlocked');
                }
            }
        }));
    }
}

export interface ICheckInfo {
    status: boolean;
    choices: IChoice[];
    choicesAll: IChoiceInfo[];
    selectedCount: number;
    extraCount: number;
    message: string;
}

export interface IChoice {
    ticket_count: string;
    ticket_type: string;
    watcher_name: string;
}

export interface IChoiceInfo {
    ticket_type: string;
    ticketCount: number;
    watcher_name: string;
    choicesExtra: {
        ticket_type: string;
        ticketCount: number;
        updated: boolean;
    }[];
    updated: boolean;
}

/**
 * 座席・券種確定プロセス/検証処理
 */
async function checkFixSeatsAndTickets(__: ReserveSessionModel, req: Request): Promise<ICheckInfo> {
    const checkInfo: ICheckInfo = {
        status: false,
        choices: [],
        choicesAll: [],
        selectedCount: 0,
        extraCount: 0,
        message: ''
    };
    // 検証(券種が選択されていること)
    reserveTicketForm(req);
    const validationResult = await req.getValidationResult();
    if (!validationResult.isEmpty()) {
        checkInfo.message = req.__('Invalid"');

        return checkInfo;
    }
    // 画面から座席選択情報が生成できなければエラー
    const choices: IChoice[] = JSON.parse(req.body.choices);
    if (!Array.isArray(choices)) {
        checkInfo.message = req.__('UnexpectedError');

        return checkInfo;
    }
    checkInfo.choices = choices;

    // チケット枚数合計計算
    choices.forEach((choice) => {
        // チケットセット(選択枚数分)
        checkInfo.selectedCount += Number(choice.ticket_count);
        for (let index = 0; index < Number(choice.ticket_count); index += 1) {
            const choiceInfo: IChoiceInfo = {
                ticket_type: choice.ticket_type,
                ticketCount: 1,
                watcher_name: (typeof choice.watcher_name === 'string') ? choice.watcher_name : '',
                choicesExtra: [],
                updated: false
            };

            // 選択チケット本体分セット(選択枚数分)
            checkInfo.choicesAll.push(choiceInfo);
        }
    });
    checkInfo.status = true;

    return checkInfo;
}

/**
 * 購入者情報確定プロセス
 */
export async function processFixProfile(reservationModel: ReserveSessionModel, req: Request, res: Response): Promise<void> {
    reserveProfileForm(req);

    const validationResult = await req.getValidationResult();
    res.locals.validation = validationResult.mapped();
    res.locals.paymentMethod = req.body.paymentMethod;
    if (!validationResult.isEmpty()) {
        throw new Error(req.__('Invalid'));
    }

    // 購入者情報を保存して座席選択へ
    const contact: Express.IPurchaser = {
        lastName: (<StaffUser>req.staffUser).familyName,
        firstName: (<StaffUser>req.staffUser).givenName,
        tel: (<StaffUser>req.staffUser).telephone,
        email: (<StaffUser>req.staffUser).email,
        age: reservationModel.transactionInProgress.purchaser.age,
        address: reservationModel.transactionInProgress.purchaser.address,
        gender: reservationModel.transactionInProgress.purchaser.gender
    };
    reservationModel.transactionInProgress.purchaser = contact;
    reservationModel.transactionInProgress.paymentMethod = req.body.paymentMethod;

    const placeOrderTransactionService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
        endpoint: <string>process.env.CINERINO_API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const profile = await placeOrderTransactionService.setCustomerContact({
        id: reservationModel.transactionInProgress.id,
        object: {
            customerContact: {
                age: contact.age,
                address: contact.address,
                email: contact.email,
                gender: contact.gender,
                givenName: contact.firstName,
                familyName: contact.lastName,
                telephone: contact.tel,
                telephoneRegion: contact.address
            }
        }
    });
    debug('profile set.', profile);
    reservationModel.transactionInProgress.profile = profile;

    // セッションに購入者情報格納
    (<Express.Session>req.session).purchaser = contact;
}

/**
 * パフォーマンスをFIXするプロセス
 * パフォーマンスIDから、パフォーマンスを検索し、その後プロセスに必要な情報をreservationModelに追加する
 */
export async function processFixPerformance(reservationModel: ReserveSessionModel, perfomanceId: string, req: Request): Promise<void> {
    debug('fixing performance...', perfomanceId);
    // パフォーマンス取得
    const eventService = new tttsapi.service.Event({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const performance = await eventService.findPerofrmanceById({ id: perfomanceId });

    // 券種セット
    if (performance.ticket_type_group !== undefined) {
        reservationModel.transactionInProgress.ticketTypes = performance.ticket_type_group.ticket_types.map((t) => {
            return { ...t, ...{ count: 0, watcher_name: '' }, id: t.identifier };
        });
    }

    // パフォーマンス情報を保管
    reservationModel.transactionInProgress.performance = performance;
}

export type ICompoundPriceSpecification = tttsapi.factory.chevre.compoundPriceSpecification.IPriceSpecification<any>;

export function getUnitPriceByAcceptedOffer(offer: cinerinoapi.factory.order.IAcceptedOffer<any>) {
    let unitPrice: number = 0;

    if (offer.priceSpecification !== undefined) {
        const priceSpecification = <ICompoundPriceSpecification>offer.priceSpecification;
        if (Array.isArray(priceSpecification.priceComponent)) {
            const unitPriceSpec = priceSpecification.priceComponent.find(
                (c) => c.typeOf === tttsapi.factory.chevre.priceSpecificationType.UnitPriceSpecification
            );
            if (unitPriceSpec !== undefined && unitPriceSpec.price !== undefined && Number.isInteger(unitPriceSpec.price)) {
                unitPrice = unitPriceSpec.price;
            }
        }
    }

    return unitPrice;
}
