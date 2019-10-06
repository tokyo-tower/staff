/**
 * 座席予約ベースコントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as conf from 'config';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import * as moment from 'moment-timezone';
import * as numeral from 'numeral';
import * as _ from 'underscore';

import reserveProfileForm from '../forms/reserve/reserveProfileForm';
import reserveTicketForm from '../forms/reserve/reserveTicketForm';
import ReserveSessionModel from '../models/reserve/session';
import StaffUser from '../models/user/staff';

const debug = createDebug('ttts-staff:controller');

/**
 * 購入開始プロセス
 */
// tslint:disable-next-line:max-func-body-length
export async function processStart(req: Request): Promise<ReserveSessionModel> {
    // 言語も指定
    (<Express.Session>req.session).locale = (!_.isEmpty(req.query.locale)) ? req.query.locale : 'ja';

    const placeOrderTransactionService = new tttsapi.service.transaction.PlaceOrder({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const oragnizationService = new tttsapi.service.Organization({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    const sellerIdentifier = 'TokyoTower';
    const seller = await oragnizationService.findCorporationByIdentifier({ identifier: sellerIdentifier });

    const expires = moment().add(conf.get<number>('temporary_reservation_valid_period_seconds'), 'seconds').toDate();
    const transaction = await placeOrderTransactionService.start({
        expires: expires,
        sellerIdentifier: sellerIdentifier // 電波塔さんの組織識別子(現時点で固定)
    });
    debug('transaction started.', transaction.id);

    // 取引セッションを初期化
    const transactionInProgress: Express.ITransactionInProgress = {
        id: transaction.id,
        agentId: transaction.agent.id,
        seller: seller,
        sellerId: transaction.seller.id,
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
        paymentMethod: tttsapi.factory.paymentMethodType.CreditCard,
        purchaserGroup: 'Staff',
        transactionGMO: {
            orderId: '',
            amount: 0,
            count: 0
        },
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
    const placeOrderTransactionService = new tttsapi.service.transaction.PlaceOrder({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const offers = checkInfo.choicesAll.map((choice) => {
        return {
            ticket_type: choice.ticket_type,
            watcher_name: choice.watcher_name
        };
    });
    debug(`creating seatReservation authorizeAction on ${offers.length} offers...`);
    const action = await placeOrderTransactionService.createSeatReservationAuthorization({
        transactionId: reservationModel.transactionInProgress.id,
        performanceId: reservationModel.transactionInProgress.performance.id,
        offers: offers
    });
    reservationModel.transactionInProgress.seatReservationAuthorizeActionId = action.id;

    // セッションに保管
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

    const placeOrderTransactionService = new tttsapi.service.transaction.PlaceOrder({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const customerContact = await placeOrderTransactionService.setCustomerContact({
        transactionId: reservationModel.transactionInProgress.id,
        contact: <any>{
            last_name: contact.lastName,
            first_name: contact.firstName,
            email: contact.email,
            tel: contact.tel,
            age: contact.age,
            address: contact.address,
            gender: contact.gender
        }
    });
    debug('customerContact set.', customerContact);

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

/**
 * 予約完了メールを作成する
 */
// tslint:disable-next-line:max-func-body-length
export async function createEmailAttributes(
    order: tttsapi.factory.order.IOrder,
    res: Response
): Promise<tttsapi.factory.creativeWork.message.email.IAttributes> {
    const acceptedOffers = order.acceptedOffers;

    // チケットコード順にソート
    acceptedOffers.sort((a, b) => {
        if ((<tttsapi.factory.order.IReservation>a.itemOffered).reservedTicket.ticketType.identifier
            < (<tttsapi.factory.order.IReservation>b.itemOffered).reservedTicket.ticketType.identifier) {
            return -1;
        }
        if ((<tttsapi.factory.order.IReservation>a.itemOffered).reservedTicket.ticketType.identifier
            > (<tttsapi.factory.order.IReservation>b.itemOffered).reservedTicket.ticketType.identifier) {
            return 1;
        }

        return 0;
    });

    const reservations = acceptedOffers.map((o) => <tttsapi.factory.order.IReservation>o.itemOffered);

    const to = (order.customer.email !== undefined)
        ? order.customer.email
        : '';
    debug('to is', to);
    if (to.length === 0) {
        throw new Error('email to unknown');
    }

    const title = res.__('Title');
    const titleEmail = res.__('EmailTitle');

    // 券種ごとに合計枚数算出
    const ticketInfos: {} = {};

    for (const acceptedOffer of acceptedOffers) {
        const reservation = <tttsapi.factory.order.IReservation>acceptedOffer.itemOffered;
        const ticketType = reservation.reservedTicket.ticketType;
        const price = getUnitPriceByAcceptedOffer(acceptedOffer);

        const dataValue = ticketType.identifier;
        // チケットタイプごとにチケット情報セット
        if (!ticketInfos.hasOwnProperty(dataValue)) {
            (<any>ticketInfos)[dataValue] = {
                ticket_type_name: ticketType.name,
                charge: `\\${numeral(price).format('0,0')}`,
                count: 1
            };
        } else {
            (<any>ticketInfos)[dataValue].count += 1;
        }
    }
    // 券種ごとの表示情報編集
    const ticketInfoArray: string[] = [];
    Object.keys(ticketInfos).forEach((key) => {
        const ticketInfo = (<any>ticketInfos)[key];
        ticketInfoArray.push(`${ticketInfo.ticket_type_name[res.locale]} ${res.__('{{n}}Leaf', { n: ticketInfo.count })}`);
    });
    const ticketInfoStr = ticketInfoArray.join('\n');

    const event = reservations[0].reservationFor;
    const day: string = moment(event.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD');
    const time: string = moment(event.startDate).tz('Asia/Tokyo').format('HH:mm');

    // 日本語の時は"姓名"他は"名姓"
    const purchaserName = (order.customer !== undefined)
        ? (res.locale === 'ja') ?
            `${order.customer.familyName} ${order.customer.givenName}` :
            `${order.customer.givenName} ${order.customer.familyName}`
        : '';

    return new Promise<tttsapi.factory.creativeWork.message.email.IAttributes>((resolve, reject) => {
        res.render(
            'email/reserve/complete',
            {
                layout: false,
                order: order,
                reservations: reservations,
                moment: moment,
                numeral: numeral,
                conf: conf,
                ticketInfoStr: ticketInfoStr,
                totalCharge: 0,
                dayTime: `${day} ${time}`,
                purchaserName: purchaserName
            },
            async (renderErr, text) => {
                debug('email template rendered.', renderErr);
                if (renderErr instanceof Error) {
                    reject(new Error('failed in rendering an email.'));

                    return;
                }

                resolve({
                    typeOf: tttsapi.factory.creativeWorkType.EmailMessage,
                    sender: {
                        name: conf.get<string>('email.fromname'),
                        email: conf.get<string>('email.from')
                    },
                    toRecipient: {
                        name: purchaserName,
                        email: to
                    },
                    about: `${title} ${titleEmail}`,
                    text: text
                });
            });
    });
}

export type ICompoundPriceSpecification = tttsapi.factory.chevre.compoundPriceSpecification.IPriceSpecification<any>;

export function getUnitPriceByAcceptedOffer(offer: tttsapi.factory.order.IAcceptedOffer<any>) {
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

/**
 * チケット情報(券種ごとの枚数)取得
 */
export function getTicketInfos(order: tttsapi.factory.order.IOrder): any {
    // 券種ごとに合計枚数算出
    const ticketInfos: {} = {};

    const acceptedOffers = order.acceptedOffers;

    // チケットコード順にソート
    acceptedOffers.sort((a, b) => {
        if ((<tttsapi.factory.order.IReservation>a.itemOffered).reservedTicket.ticketType.identifier
            < (<tttsapi.factory.order.IReservation>b.itemOffered).reservedTicket.ticketType.identifier
        ) {
            return -1;
        }
        if ((<tttsapi.factory.order.IReservation>a.itemOffered).reservedTicket.ticketType.identifier
            > (<tttsapi.factory.order.IReservation>b.itemOffered).reservedTicket.ticketType.identifier
        ) {
            return 1;
        }

        return 0;
    });

    for (const acceptedOffer of acceptedOffers) {
        const reservation = <tttsapi.factory.order.IReservation>acceptedOffer.itemOffered;
        const ticketType = reservation.reservedTicket.ticketType;
        const price = getUnitPriceByAcceptedOffer(acceptedOffer);

        const dataValue = ticketType.identifier;
        // チケットタイプごとにチケット情報セット
        if (!ticketInfos.hasOwnProperty(dataValue)) {
            (<any>ticketInfos)[dataValue] = {
                ticket_type_name: ticketType.name,
                charge: `\\${numeral(price).format('0,0')}`,
                watcher_name: reservation.additionalTicketText,
                count: 1
            };
        } else {
            (<any>ticketInfos)[dataValue].count += 1;
        }
    }

    return ticketInfos;
}
