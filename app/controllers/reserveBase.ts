/**
 * 座席予約ベースコントローラー
 *
 * @namespace controller/reserveBase
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
const DEFAULT_RADIX = 10;

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
    console.log(`reservationModel.performance=${reservationModel.performance._id}`);

    // チケット情報に枚数セット(画面で選択された枚数<画面再表示用)
    reservationModel.ticketTypes.forEach((ticketType) => {
        const choice = checkInfo.choices.find((c: any) => (ticketType._id === c.ticket_type));
        ticketType.count = (choice !== undefined) ? Number(choice.ticket_count) : 0;
    });

    // セッション中の予約リストを初期化
    reservationModel.seatCodes = [];
    reservationModel.seatCodesExtra = [];
    reservationModel.expiredAt = moment().add(conf.get<number>('temporary_reservation_valid_period_seconds'), 'seconds').valueOf();

    // 座席承認アクション
    const offers = checkInfo.choicesAll.map((choice) => {
        // チケット情報
        // tslint:disable-next-line:max-line-length
        const ticketType = reservationModel.ticketTypes.find((ticketTypeInArray) => (ticketTypeInArray._id === choice.ticket_type));
        if (ticketType === undefined) {
            throw new Error(req.__('Message.UnexpectedError'));
        }

        return {
            extra: choice.choicesExtra, // 車いすの場合
            ticket_type: ticketType._id,
            ticket_type_name: ticketType.name,
            ticket_type_charge: ticketType.charge,
            watcher_name: choice.watcher_name,
            ticket_cancel_charge: ticketType.cancel_charge,
            ticket_ttts_extension: ticketType.ttts_extension,
            performance_ttts_extension: reservationModel.performance.ttts_extension
        };
    });
    debug('creating seatReservation authorizeAction... offers:', offers);
    const action = await ttts.service.transaction.placeOrderInProgress.action.authorize.seatReservation.create(
        reservationModel.agentId,
        reservationModel.id,
        reservationModel.performance._id,
        offers
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
    reservationModel.seatCodes.sort(ttts.factory.place.screen.sortBySeatCode);
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
        checkInfo.message = req.__('Message.Invalid');

        return checkInfo;
    }
    // 画面から座席選択情報が生成できなければエラー
    const choices: IChoice[] = JSON.parse(req.body.choices);
    if (!Array.isArray(choices)) {
        checkInfo.message = req.__('Message.UnexpectedError');

        return checkInfo;
    }
    checkInfo.choices = choices;

    // 特殊チケット情報
    const extraSeatNum: {
        [key: string]: number
    } = {};
    reservationModel.ticketTypes.forEach((ticketTypeInArray) => {
        if (ticketTypeInArray.ttts_extension.category !== ttts.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
            extraSeatNum[ticketTypeInArray._id] = ticketTypeInArray.ttts_extension.required_seat_num;
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
        performance: reservationModel.performance._id,
        availability: ttts.factory.itemAvailability.InStock
    };
    const count = await stockRepo.stockModel.count(conditions).exec();
    // チケット枚数より少ない場合は、購入不可としてリターン
    if (count < selectedCount) {
        // "予約可能な席がございません"
        info.message = req.__('Message.NoAvailableSeats');

        return info;
    }
    // 予約情報取得
    const stocks = await stockRepo.stockModel.find(conditions).exec();
    info.results = stocks.map((stock) => {
        return {
            _id: stock._id,
            performance: (<any>stock).performance,
            seat_code: (<any>stock).seat_code,
            used: false
        };
    });
    // チケット枚数より少ない場合は、購入不可としてリターン
    if (info.results.length < selectedCount) {
        // "予約可能な席がございません"
        info.message = req.__('Message.NoAvailableSeats');

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
        throw new Error(req.__('Message.Invalid'));
    }

    // 購入情報を保存
    // tslint:disable-next-line:no-suspicious-comment
    // TODO factoryに決済方法を定義
    reservationModel.paymentMethod = req.body.paymentMethod;

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

    const transaction = await ttts.service.transaction.placeOrderInProgress.start({
        // tslint:disable-next-line:no-magic-numbers
        expires: moment().add(30, 'minutes').toDate(),
        agentId: (<Express.StaffUser>req.staffUser).get('_id'),
        sellerId: 'TokyoTower',
        purchaserGroup: purchaserGroup
    });
    debug('transaction started.', transaction);

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

    switch (reservationModel.purchaserGroup) {
        case ttts.ReservationUtil.PURCHASER_GROUP_STAFF:
            if (req.staffUser === undefined) {
                throw new Error(req.__('Message.UnexpectedError'));
            }

            reservationModel.purchaser = {
                lastName: 'ナイブ',
                firstName: 'カンケイシャ',
                tel: '0362263025',
                email: req.staffUser.get('email'),
                age: '00',
                address: '',
                gender: '1'
            };
            break;

        default:
            break;
    }
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

    // 内部と当日以外は、上映日当日まで購入可能
    if (reservationModel.purchaserGroup !== ttts.ReservationUtil.PURCHASER_GROUP_STAFF) {
        if (parseInt(performance.day, DEFAULT_RADIX) < parseInt(moment().format('YYYYMMDD'), DEFAULT_RADIX)) {
            throw new Error('You cannot reserve this performance.');
        }
    }

    // 券種取得
    const ticketTypeGroup = await ttts.Models.TicketTypeGroup.findById(performance.ticket_type_group).populate('ticket_types').exec();

    reservationModel.seatCodes = [];

    // 券種リストは、予約する主体によって異なる
    // 内部関係者の場合
    switch (reservationModel.purchaserGroup) {
        case ttts.ReservationUtil.PURCHASER_GROUP_STAFF:
            // 2017/07/06
            // //＠＠＠＠＠
            // //reservationModel.ticketTypes = TicketTypeGroupUtil.getOne4staff();
            // const staffTickets = TicketTypeGroupUtil.getOne4staff();
            // // tslint:disable-next-line:no-empty
            // if (staffTickets) {
            // }
            //---
            //const staffTickets = TicketTypeGroupUtil.getOne4staff();
            if (ticketTypeGroup !== null) {
                reservationModel.ticketTypes = ticketTypeGroup.get('ticket_types');
            }
            break;

        default:
            // 一般、当日窓口の場合
            // 2017/06/19 upsate node+typesctipt
            //reservationModel.ticketTypes = ticketTypeGroup.get('ticket_types');
            if (ticketTypeGroup !== null) {
                reservationModel.ticketTypes = ticketTypeGroup.get('ticket_types');
            }
            break;
    }

    // パフォーマンス情報を保管
    reservationModel.performance = {
        ...performance,
        ...{
            film: {
                ...performance.film,
                ...{
                    image: `${req.protocol}://${req.hostname}/images/film/${performance.film._id}.jpg`
                }
            }
        }
    };

    // 座席グレードリスト抽出
    reservationModel.seatGradeCodesInScreen = reservationModel.performance.screen.sections[0].seats
        .map((seat) => seat.grade.code)
        .filter((seatCode, index, seatCodes) => seatCodes.indexOf(seatCode) === index);

    // コンビニ決済はパフォーマンス上映の5日前まで
    // tslint:disable-next-line:no-magic-numbers
    // const day5DaysAgo = parseInt(moment().add(+5, 'days').format('YYYYMMDD'), DEFAULT_RADIX);
    // if (parseInt(reservationModel.performance.day, DEFAULT_RADIX) < day5DaysAgo) {
    //     if (reservationModel.paymentMethodChoices.indexOf(GMO.Util.PAY_TYPE_CVS) >= 0) {
    //         reservationModel.paymentMethodChoices.splice(reservationModel.paymentMethodChoices.indexOf(GMO.Util.PAY_TYPE_CVS), 1);
    //     }
    // }

    // スクリーン座席表HTMLを保管(TTTS未使用)
    reservationModel.screenHtml = '';
}

/**
 * 確定以外の全情報を確定するプロセス
 */
export async function processAllExceptConfirm(__: ReserveSessionModel, __2: Request): Promise<void> {
    /*
    const commonUpdate: any = {
    };

    switch (reservationModel.purchaserGroup) {
        case ttts.ReservationUtil.PURCHASER_GROUP_STAFF:
            commonUpdate.owner = (<Express.StaffUser>req.staffUser).get('_id');
            commonUpdate.owner_username = (<Express.StaffUser>req.staffUser).get('username');
            commonUpdate.owner_name = (<Express.StaffUser>req.staffUser).get('name');
            commonUpdate.owner_email = (<Express.StaffUser>req.staffUser).get('email');
            commonUpdate.owner_signature = (<Express.StaffUser>req.staffUser).get('signature');
            commonUpdate.owner_group = (<Express.StaffUser>req.staffUser).get('group');

            commonUpdate.purchaser_last_name = '';
            commonUpdate.purchaser_first_name = '';
            commonUpdate.purchaser_email = '';
            commonUpdate.purchaser_tel = '';
            commonUpdate.purchaser_age = '';
            commonUpdate.purchaser_address = '';
            commonUpdate.purchaser_gender = '';
            break;

        case ttts.ReservationUtil.PURCHASER_GROUP_WINDOW:
            commonUpdate.owner = (<Express.WindowUser>req.windowUser).get('_id');
            commonUpdate.owner_username = (<Express.WindowUser>req.windowUser).get('username');
            commonUpdate.owner_name = (<Express.WindowUser>req.windowUser).get('name');
            commonUpdate.owner_email = (<Express.WindowUser>req.windowUser).get('email');
            commonUpdate.owner_signature = (<Express.WindowUser>req.windowUser).get('signature');
            commonUpdate.owner_group = (<Express.WindowUser>req.windowUser).get('group');

            commonUpdate.purchaser_last_name = '';
            commonUpdate.purchaser_first_name = '';
            commonUpdate.purchaser_email = '';
            commonUpdate.purchaser_tel = '';
            commonUpdate.purchaser_age = '';
            commonUpdate.purchaser_address = '';
            commonUpdate.purchaser_gender = '';
            break;

        default:
            throw new Error(req.__('Message.UnexpectedError'));
    }

    // 2017/07/08 特殊チケット対応
    const seatCodesAll: string[] = Array.prototype.concat(reservationModel.seatCodes, reservationModel.seatCodesExtra);
    // いったん全情報をDBに保存
    await Promise.all(seatCodesAll.map(async (seatCode, index) => {
        let update = reservationModel.seatCode2reservationDocument(seatCode);
        // update = Object.assign(update, commonUpdate);
        update = { ...update, ...commonUpdate };
        (<any>update).payment_seat_index = index;
        const reservation = await ttts.Models.Reservation.findByIdAndUpdate(
            update._id,
            update,
            { new: true }
        ).exec();

        // IDの予約ドキュメントが万が一なければ予期せぬエラー(基本的にありえないフローのはず)
        if (reservation === null) {
            throw new Error(req.__('Message.UnexpectedError'));
        }
    }));
    */
}

/**
 * 購入番号から全ての予約を完了にする
 *
 * @param {string} paymentNo 購入番号
 * @param {Object} update 追加更新パラメータ
 */
export async function processFixReservations(reservationModel: ReserveSessionModel, res: Response): Promise<void> {
    const transaction = await ttts.service.transaction.placeOrderInProgress.confirm({
        agentId: reservationModel.agentId,
        transactionId: reservationModel.id,
        paymentMethod: reservationModel.paymentMethod
    });
    debug('transaction confirmed.', transaction);

    // reservationsは非同期で作成される
    /*
    (<any>update).purchased_at = moment().valueOf();
    (<any>update).status = ttts.ReservationUtil.STATUS_RESERVED;

    const conditions: any = {
        performance_day: performanceDay,
        payment_no: paymentNo,
        status: ttts.ReservationUtil.STATUS_TEMPORARY
    };
    // 予約完了ステータスへ変更
    await ttts.Models.Reservation.update(
        conditions,
        update,
        { multi: true } // 必須！複数予約ドキュメントを一度に更新するため
    ).exec();
    // 2017/07/08 特殊チケット対応
    // 特殊チケット一時予約を特殊チケット予約完了ステータスへ変更
    conditions.status = ttts.ReservationUtil.STATUS_TEMPORARY_FOR_SECURE_EXTRA;
    (<any>update).status = ttts.ReservationUtil.STATUS_ON_KEPT_FOR_SECURE_EXTRA;
    await ttts.Models.Reservation.update(
        conditions,
        update,
        { multi: true }
    ).exec();

    // 2017/11 本体チケット予約情報取得
    const reservations = getReservations(reservationModel);
    await Promise.all(reservations.map(async (reservation) => {
        // 2017/11 本体チケットかつ特殊(車椅子)チケットの時
        if (reservation.ticket_ttts_extension.category !== ttts.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
            // 時間ごとの予約情報更新('仮予約'を'予約'に変更)
            await ttts.Models.ReservationPerHour.findOneAndUpdate(
                { reservation_id: reservation._id.toString() },
                { status: ttts.ReservationUtil.STATUS_RESERVED },
                { new: true }
            ).exec();
        }
    }));
    */

    try {
        const result = <ttts.factory.transaction.placeOrder.IResult>transaction.result;
        // 完了メールキュー追加(あれば更新日時を更新するだけ)
        const emailQueue = await createEmailQueue(result.eventReservations, reservationModel, res);
        await ttts.Models.EmailQueue.create(emailQueue);
    } catch (error) {
        console.error(error);
        // 失敗してもスルー(ログと運用でなんとかする)
    }
}

/**
 * 完了メールキューインタフェース
 *
 * @interface IEmailQueue
 */
interface IEmailQueue {
    // tslint:disable-next-line:no-reserved-keywords
    from: { // 送信者
        address: string;
        name: string;
    };
    to: { // 送信先
        address: string;
        name?: string;
    };
    subject: string;
    content: { // 本文
        mimetype: string;
        text: string;
    };
    status: string;
}

/**
 * 予約完了メールを作成する
 * @memberof ReserveBaseController
 */
// tslint:disable-next-line:max-func-body-length
async function createEmailQueue(
    reservations: ttts.factory.reservation.event.IReservation[],
    reservationModel: ReserveSessionModel,
    res: Response
): Promise<IEmailQueue> {
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);

    // 特殊チケットは除外
    reservations = reservations.filter((reservation) => reservation.status === ttts.factory.reservationStatusType.ReservationConfirmed);

    const reservationDocs = reservations.map((reservation) => new reservationRepo.reservationModel(reservation));

    let to = '';
    switch (reservations[0].purchaser_group) {
        case ttts.ReservationUtil.PURCHASER_GROUP_STAFF:
            to = <string>reservations[0].owner_email;
            break;

        default:
            to = reservations[0].purchaser_email;
            break;
    }

    debug('to is', to);
    if (to.length === 0) {
        throw new Error('email to unknown');
    }

    const title = res.__('Title');
    const titleEmail = res.__('Email.Title');

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
    const leaf: string = res.__('Email.Leaf');
    const ticketInfoArray: string[] = [];
    Object.keys(ticketInfos).forEach((key) => {
        const ticketInfo = (<any>ticketInfos)[key];
        ticketInfoArray.push(`${ticketInfo.ticket_type_name[res.locale]} ${ticketInfo.count}${leaf}`);
    });
    const day: string = moment(reservations[0].performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
    // tslint:disable-next-line:no-magic-numbers
    const time: string = `${reservations[0].performance_start_time.substr(0, 2)}:${reservations[0].performance_start_time.substr(2, 2)}`;

    debug('rendering template...');

    return new Promise<IEmailQueue>((resolve, reject) => {
        res.render(
            'email/reserve/complete',
            {
                layout: false,
                reservations: reservationDocs,
                moment: moment,
                numeral: numeral,
                conf: conf,
                GMOUtil: ttts.GMO.utils.util,
                ReservationUtil: ttts.ReservationUtil,
                ticketInfoArray: ticketInfoArray,
                totalCharge: reservationModel.getTotalCharge(),
                dayTime: `${day} ${time}`
            },
            async (renderErr, text) => {
                debug('email template rendered.', renderErr);
                if (renderErr instanceof Error) {
                    reject(new Error('failed in rendering an email.'));

                    return;
                }

                const emailQueue = {
                    from: { // 送信者
                        address: conf.get<string>('email.from'),
                        name: conf.get<string>('email.fromname')
                    },
                    to: { // 送信先
                        address: to
                        // name: 'testto'
                    },
                    subject: `${title} ${titleEmail}`,
                    content: { // 本文
                        mimetype: 'text/plain',
                        text: text
                    },
                    status: ttts.EmailQueueUtil.STATUS_UNSENT
                };
                resolve(emailQueue);
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
