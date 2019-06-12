/**
 * 座席予約ベースコントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as conf from 'config';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import * as moment from 'moment';
import * as numeral from 'numeral';
import * as _ from 'underscore';

import reserveProfileForm from '../forms/reserve/reserveProfileForm';
import reserveTicketForm from '../forms/reserve/reserveTicketForm';
import ReserveSessionModel from '../models/reserve/session';
import StaffUser from '../models/user/staff';

const debug = createDebug('ttts-staff:controller');

/**
 * 購入開始プロセス
 * @param {string} purchaserGroup 購入者区分
 */
// tslint:disable-next-line:max-func-body-length
export async function processStart(purchaserGroup: string, req: Request): Promise<ReserveSessionModel> {
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
        sellerIdentifier: sellerIdentifier, // 電波塔さんの組織識別子(現時点で固定)
        purchaserGroup: <any>purchaserGroup
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
        // seatGradeCodesInScreen: [],
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
        purchaserGroup: purchaserGroup,
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
    // この時点で購入番号が発行される
    reservationModel.transactionInProgress.paymentNo =
        (<tttsapi.factory.action.authorize.seatReservation.IResult>action.result).tmpReservations[0].payment_no;
    const tmpReservations = (<tttsapi.factory.action.authorize.seatReservation.IResult>action.result).tmpReservations;

    // セッションに保管
    reservationModel.transactionInProgress.reservations = tmpReservations.filter(
        (r) => r.status_after === tttsapi.factory.reservationStatusType.ReservationConfirmed
    );
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
        contact: {
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
    reservationModel.transactionInProgress.ticketTypes = performance.ticket_type_group.ticket_types.map((t) => {
        return { ...t, ...{ count: 0, watcher_name: '' } };
    });

    // パフォーマンス情報を保管
    reservationModel.transactionInProgress.performance = performance;

    // 座席グレードリスト抽出
    // reservationModel.transactionInProgress.seatGradeCodesInScreen = performance.screen.sections[0].seats
    //     .map((seat) => seat.grade.code)
    //     .filter((seatCode, index, seatCodes) => seatCodes.indexOf(seatCode) === index);
}

/**
 * 予約完了メールを作成する
 * @memberof ReserveBaseController
 */
export async function createEmailAttributes(
    reservations: tttsapi.factory.reservation.event.IReservation[],
    res: Response
): Promise<tttsapi.factory.creativeWork.message.email.IAttributes> {
    // チケットコード順にソート
    reservations.sort((a, b) => {
        if (a.ticket_type < b.ticket_type) {
            return -1;
        }
        if (a.ticket_type > b.ticket_type) {
            return 1;
        }

        return 0;
    });

    const to = <string>reservations[0].owner_email;
    debug('to is', to);
    if (to.length === 0) {
        throw new Error('email to unknown');
    }

    const title = res.__('Title');
    const titleEmail = res.__('EmailTitle');

    // 券種ごとに合計枚数算出
    const ticketInfos: {} = {};
    for (const reservation of reservations) {
        // チケットタイプセット
        const dataValue = reservation.ticket_type;
        // チケットタイプごとにチケット情報セット
        if (!ticketInfos.hasOwnProperty(dataValue)) {
            (<any>ticketInfos)[dataValue] = {
                ticket_type_name: reservation.ticket_type_name,
                charge: `\\${numeral(reservation.charge).format('0,0')}`,
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

    const day: string = moment(reservations[0].performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
    // tslint:disable-next-line:no-magic-numbers
    const time: string = `${reservations[0].performance_start_time.substr(0, 2)}:${reservations[0].performance_start_time.substr(2, 2)}`;

    // 日本語の時は"姓名"他は"名姓"
    const purchaserName = (res.locale === 'ja') ?
        `${reservations[0].purchaser_last_name} ${reservations[0].purchaser_first_name}` :
        `${reservations[0].purchaser_first_name} ${reservations[0].purchaser_last_name}`;

    debug('rendering template...');

    return new Promise<tttsapi.factory.creativeWork.message.email.IAttributes>((resolve, reject) => {
        res.render(
            'email/reserve/complete',
            {
                layout: false,
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
                    sender: {
                        name: conf.get<string>('email.fromname'),
                        email: conf.get<string>('email.from')
                    },
                    toRecipient: {
                        name: reservations[0].purchaser_name,
                        email: to
                    },
                    about: `${title} ${titleEmail}`,
                    text: text
                });
            });
    });
}

/**
 * チケット情報(券種ごとの枚数)取得
 *
 * @param {any[]} reservations
 * @returns {any}
 */
export function getTicketInfos(reservations: any[]): any {
    // 券種ごとに合計枚数算出
    const keyName: string = 'ticket_type';
    const ticketInfos: {} = {};
    for (const reservation of reservations) {
        // チケットタイプセット
        const dataValue = reservation[keyName];
        // チケットタイプごとにチケット情報セット
        if (!ticketInfos.hasOwnProperty(dataValue)) {
            (<any>ticketInfos)[dataValue] = {
                ticket_type_name: reservation.ticket_type_name,
                charge: `\\${numeral(reservation.charge).format('0,0')}`,
                watcher_name: reservation.watcher_name,
                count: 1
            };
        } else {
            (<any>ticketInfos)[dataValue].count += 1;
        }
    }

    return ticketInfos;
}
