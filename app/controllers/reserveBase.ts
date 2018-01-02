/**
 * 座席予約ベースコントローラー
 *
 * @namepace controller/reserveBase
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as conf from 'config';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import * as moment from 'moment';
import * as numeral from 'numeral';
import * as _ from 'underscore';

import reserveProfileForm from '../forms/reserve/reserveProfileForm';
import reserveTicketForm from '../forms/reserve/reserveTicketForm';
import ReserveSessionModel from '../models/reserve/session';

const debug = createDebug('ttts-staff:controller:reserveBase');

// 車椅子レート制限のためのRedis接続クライアント
const redisClient = ttts.redis.createClient({
    host: <string>process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(<string>process.env.REDIS_PORT, 10),
    password: <string>process.env.REDIS_KEY,
    tls: { servername: <string>process.env.REDIS_HOST }
});

/**
 * 座席・券種FIXプロセス
 *
 * @param {ReserveSessionModel} reservationModel
 * @returns {Promise<void>}
 */
export async function processFixSeatsAndTickets(reservationModel: ReserveSessionModel, req: Request): Promise<void> {
    // 検証(券種が選択されていること)+チケット枚数合計計算
    const checkInfo = await checkFixSeatsAndTickets(reservationModel, req);
    if (checkInfo.status === false) {
        throw new Error(checkInfo.message);
    }

    // 予約可能件数チェック+予約情報取得
    const infos = await getInfoFixSeatsAndTickets(reservationModel, req, Number(checkInfo.selectedCount) + Number(checkInfo.extraCount));
    if (infos.status === false) {
        throw new Error(infos.message);
    }

    // tslint:disable-next-line:no-console
    console.log(`reservationModel.performance=${reservationModel.performance.id}`);

    // チケット情報に枚数セット(画面で選択された枚数<画面再表示用)
    reservationModel.ticketTypes.forEach((ticketType) => {
        const choice = checkInfo.choices.find((c: any) => (ticketType.id === c.ticket_type));
        ticketType.count = (choice !== undefined) ? Number(choice.ticket_count) : 0;
    });

    // セッション中の予約リストを初期化
    reservationModel.seatCodes = [];
    reservationModel.seatCodesExtra = [];

    // 座席承認アクション
    const offers = checkInfo.choicesAll.map((choice) => {
        // チケット情報
        // tslint:disable-next-line:max-line-length
        const ticketType = reservationModel.ticketTypes.find((ticketTypeInArray) => (ticketTypeInArray.id === choice.ticket_type));
        if (ticketType === undefined) {
            throw new Error(req.__('UnexpectedError'));
        }

        return {
            ticket_type: ticketType.id,
            watcher_name: choice.watcher_name
        };
    });
    debug(`creating seatReservation authorizeAction on ${offers.length} offers...`);
    const action = await ttts.service.transaction.placeOrderInProgress.action.authorize.seatReservation.create(
        reservationModel.agentId,
        reservationModel.id,
        reservationModel.performance.id,
        offers
    )(
        new ttts.repository.Transaction(ttts.mongoose.connection),
        new ttts.repository.Performance(ttts.mongoose.connection),
        new ttts.repository.action.authorize.SeatReservation(ttts.mongoose.connection),
        new ttts.repository.PaymentNo(redisClient),
        new ttts.repository.rateLimit.TicketTypeCategory(redisClient)
        );
    reservationModel.seatReservationAuthorizeActionId = action.id;
    // この時点で購入番号が発行される
    reservationModel.paymentNo = (<ttts.factory.action.authorize.seatReservation.IResult>action.result).tmpReservations[0].payment_no;
    const tmpReservations = (<ttts.factory.action.authorize.seatReservation.IResult>action.result).tmpReservations;

    // セッションに保管
    reservationModel.seatCodes = tmpReservations.filter((r) => r.status_after === ttts.factory.reservationStatusType.ReservationConfirmed)
        .map((r) => r.seat_code);
    reservationModel.seatCodesExtra = tmpReservations.filter(
        (r) => r.status_after !== ttts.factory.reservationStatusType.ReservationConfirmed
    ).map((r) => r.seat_code);

    tmpReservations.forEach((tmpReservation) => {
        reservationModel.setReservation(tmpReservation.seat_code, tmpReservation);
    });
    // 座席コードのソート(文字列順に)
    // reservationModel.seatCodes.sort(ttts.factory.place.screen.sortBySeatCode);
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
 * 座席・券種FIXプロセス/検証処理
 *
 * @param {ReservationModel} reservationModel
 * @param {Request} req
 * @returns {Promise<void>}
 */
async function checkFixSeatsAndTickets(reservationModel: ReserveSessionModel, req: Request): Promise<ICheckInfo> {
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

    // 特殊チケット情報
    const extraSeatNum: {
        [key: string]: number
    } = {};
    reservationModel.ticketTypes.forEach((ticketTypeInArray) => {
        if (ticketTypeInArray.ttts_extension.category !== ttts.factory.ticketTypeCategory.Normal) {
            extraSeatNum[ticketTypeInArray.id] = ticketTypeInArray.ttts_extension.required_seat_num;
        }
    });

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
            // 特殊の時、必要枚数分セット
            if (extraSeatNum.hasOwnProperty(choice.ticket_type) === true) {
                const extraCount: number = Number(extraSeatNum[choice.ticket_type]) - 1;
                for (let indexExtra = 0; indexExtra < extraCount; indexExtra += 1) {
                    choiceInfo.choicesExtra.push({
                        ticket_type: choice.ticket_type,
                        ticketCount: 1,
                        updated: false
                    });
                    checkInfo.extraCount += 1;
                }
            }
            // 選択チケット本体分セット(選択枚数分)
            checkInfo.choicesAll.push(choiceInfo);
        }
    });
    checkInfo.status = true;

    return checkInfo;
}
/**
 * 座席・券種FIXプロセス/予約情報取得処理
 *
 * @param {ReservationModel} reservationModel
 * @param {Request} req
 * @param {number} selectedCount
 * @returns {Promise<void>}
 */
async function getInfoFixSeatsAndTickets(reservationModel: ReserveSessionModel, req: Request, selectedCount: number): Promise<any> {
    const stockRepo = new ttts.repository.Stock(ttts.mongoose.connection);

    const info: any = {
        status: false,
        results: null,
        message: ''
    };
    // 予約可能件数取得
    const conditions: any = {
        performance: reservationModel.performance.id,
        availability: ttts.factory.itemAvailability.InStock
    };
    const count = await stockRepo.stockModel.count(conditions).exec();
    // チケット枚数より少ない場合は、購入不可としてリターン
    if (count < selectedCount) {
        // "予約可能な席がございません"
        info.message = req.__('NoAvailableSeats');

        return info;
    }
    // 予約情報取得
    const stocks = await stockRepo.stockModel.find(conditions).exec();
    info.results = stocks.map((stock) => {
        return {
            id: stock.id,
            performance: (<any>stock).performance,
            seat_code: (<any>stock).seat_code,
            used: false
        };
    });
    // チケット枚数より少ない場合は、購入不可としてリターン
    if (info.results.length < selectedCount) {
        // "予約可能な席がございません"
        info.message = req.__('NoAvailableSeats');

        return info;
    }
    info.status = true;

    return info;
}

/**
 * 購入者情報FIXプロセス
 *
 * @param {ReservationModel} reservationModel
 * @returns {Promise<void>}
 */
export async function processFixProfile(reservationModel: ReserveSessionModel, req: Request, res: Response): Promise<void> {
    reserveProfileForm(req);

    const validationResult = await req.getValidationResult();
    res.locals.validation = validationResult.mapped();
    res.locals.paymentMethod = req.body.paymentMethod;
    if (!validationResult.isEmpty()) {
        throw new Error(req.__('Invalid"'));
    }

    // 購入情報を保存
    reservationModel.paymentMethod = req.body.paymentMethod;

    await ttts.service.transaction.placeOrderInProgress.setCustomerContact(
        reservationModel.agentId,
        reservationModel.id,
        {
            last_name: reservationModel.purchaser.lastName,
            first_name: reservationModel.purchaser.firstName,
            tel: reservationModel.purchaser.tel,
            email: reservationModel.purchaser.email,
            age: reservationModel.purchaser.age,
            address: reservationModel.purchaser.address,
            gender: reservationModel.purchaser.gender
        }
    )(new ttts.repository.Transaction(ttts.mongoose.connection));

    // セッションに購入者情報格納
    (<any>req.session).purchaser = {
        lastName: reservationModel.purchaser.lastName,
        firstName: reservationModel.purchaser.firstName,
        tel: reservationModel.purchaser.tel,
        email: reservationModel.purchaser.email,
        age: reservationModel.purchaser.age,
        address: reservationModel.purchaser.address,
        gender: reservationModel.purchaser.gender
    };
}

/**
 * 購入開始プロセス
 *
 * @param {string} purchaserGroup 購入者区分
 */
export async function processStart(purchaserGroup: string, req: Request): Promise<ReserveSessionModel> {
    // 言語も指定
    (<any>req.session).locale = (!_.isEmpty(req.query.locale)) ? req.query.locale : 'ja';

    // 予約トークンを発行
    const reservationModel = new ReserveSessionModel();
    reservationModel.purchaserGroup = purchaserGroup;
    initializePayment(reservationModel, req);

    if (!_.isEmpty(req.query.performance)) {
        // パフォーマンス指定遷移の場合 パフォーマンスFIX
        await processFixPerformance(reservationModel, req.query.performance, req);
    }

    reservationModel.expires = moment().add(conf.get<number>('temporary_reservation_valid_period_seconds'), 'seconds').toDate();
    const transaction = await ttts.service.transaction.placeOrderInProgress.start({
        expires: reservationModel.expires,
        agentId: (<Express.StaffUser>req.staffUser).get('_id'),
        sellerIdentifier: 'TokyoTower', // 組織識別子(現時点で固定)
        purchaserGroup: purchaserGroup
    })(
        new ttts.repository.Transaction(ttts.mongoose.connection),
        new ttts.repository.Organization(ttts.mongoose.connection),
        new ttts.repository.Owner(ttts.mongoose.connection)
        );
    debug('transaction started.', transaction.id);

    reservationModel.id = transaction.id;
    reservationModel.agentId = transaction.agent.id;
    reservationModel.sellerId = transaction.seller.id;

    return reservationModel;
}

/**
 * 購入情報を初期化する
 */
function initializePayment(reservationModel: ReserveSessionModel, req: Request): void {
    if (reservationModel.purchaserGroup === undefined) {
        throw new Error('purchaser group undefined.');
    }

    reservationModel.purchaser = {
        lastName: '',
        firstName: '',
        tel: '',
        email: '',
        age: '',
        address: '',
        gender: '1'
    };
    reservationModel.paymentMethodChoices = [];

    reservationModel.purchaser = {
        lastName: 'ナイブ',
        firstName: 'カンケイシャ',
        tel: '0334335111',
        email: (<Express.StaffUser>req.staffUser).get('email'),
        age: '00',
        address: '',
        gender: '1'
    };
}

/**
 * 予約フロー中の座席をキャンセルするプロセス
 *
 * @param {ReservationModel} reservationModel
 */
export async function processCancelSeats(reservationModel: ReserveSessionModel): Promise<void> {
    // セッション中の予約リストを初期化
    reservationModel.seatCodes = [];

    // 座席仮予約があればキャンセル
    if (reservationModel.seatReservationAuthorizeActionId !== undefined) {
        await ttts.service.transaction.placeOrderInProgress.action.authorize.seatReservation.cancel(
            reservationModel.agentId,
            reservationModel.id,
            reservationModel.seatReservationAuthorizeActionId
        )(
            new ttts.repository.Transaction(ttts.mongoose.connection),
            new ttts.repository.action.authorize.SeatReservation(ttts.mongoose.connection),
            new ttts.repository.rateLimit.TicketTypeCategory(redisClient)
            );
    }
}

/**
 * パフォーマンスをFIXするプロセス
 * パフォーマンスIDから、パフォーマンスを検索し、その後プロセスに必要な情報をreservationModelに追加する
 */
// tslint:disable-next-line:max-func-body-length
export async function processFixPerformance(reservationModel: ReserveSessionModel, perfomanceId: string, req: Request): Promise<void> {
    debug('fixing performance...', perfomanceId);
    // パフォーマンス取得
    const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
    const performance = await performanceRepo.findById(perfomanceId);

    if (performance.canceled) { // 万が一上映中止だった場合
        throw new Error(req.__('Message.OutOfTerm'));
    }

    // 券種取得
    reservationModel.ticketTypes = performance.ticket_type_group.ticket_types.map((t) => {
        return { ...t, ...{ count: 0, watcher_name: '' } };
    });

    reservationModel.seatCodes = [];

    // パフォーマンス情報を保管
    reservationModel.performance = {
        ...performance,
        ...{
            film: {
                ...performance.film,
                ...{
                    image: `${req.protocol}://${req.hostname}/images/film/${performance.film.id}.jpg`
                }
            }
        }
    };

    // 座席グレードリスト抽出
    reservationModel.seatGradeCodesInScreen = reservationModel.performance.screen.sections[0].seats
        .map((seat) => seat.grade.code)
        .filter((seatCode, index, seatCodes) => seatCodes.indexOf(seatCode) === index);

    // スクリーン座席表HTMLを保管(TTTS未使用)
    reservationModel.screenHtml = '';
}

/**
 * 予約完了メールを作成する
 * @memberof ReserveBaseController
 */
export async function createEmailAttributes(
    reservations: ttts.factory.reservation.event.IReservation[],
    totalCharge: number,
    res: Response
): Promise<ttts.factory.creativeWork.message.email.IAttributes> {
    // 特殊チケットは除外
    reservations = reservations.filter((reservation) => reservation.status === ttts.factory.reservationStatusType.ReservationConfirmed);

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
    const day: string = moment(reservations[0].performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
    // tslint:disable-next-line:no-magic-numbers
    const time: string = `${reservations[0].performance_start_time.substr(0, 2)}:${reservations[0].performance_start_time.substr(2, 2)}`;

    debug('rendering template...');

    return new Promise<ttts.factory.creativeWork.message.email.IAttributes>((resolve, reject) => {
        res.render(
            'email/reserve/complete',
            {
                layout: false,
                reservations: reservations,
                moment: moment,
                numeral: numeral,
                conf: conf,
                ticketInfoArray: ticketInfoArray,
                totalCharge: totalCharge,
                dayTime: `${day} ${time}`
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
                        // tslint:disable-next-line:max-line-length
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

/**
 * 予約情報取得(reservationModelから)
 * @param {ReserveSessionModel} reservationModel
 * @returns {any[]}
 */
export function getReservations(reservationModel: ReserveSessionModel): ttts.mongoose.Document[] {
    return reservationModel.seatCodes.map((seatCode) => reservationModel.seatCode2reservationDocument(seatCode));
}
