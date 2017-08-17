/**
 * 座席予約ベースコントローラー
 *
 * @namespace controller/reserveBase
 */

import * as GMO from '@motionpicture/gmo-service';
//import { EmailQueueUtil, Models, ReservationUtil, ScreenUtil, TicketTypeGroupUtil } from '@motionpicture/ttts-domain';
import { EmailQueueUtil, Models, ReservationUtil, ScreenUtil } from '@motionpicture/ttts-domain';
import * as conf from 'config';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
// import * as fs from 'fs-extra';
import * as moment from 'moment';
import * as numeral from 'numeral';
import * as _ from 'underscore';

import reserveProfileForm from '../forms/reserve/reserveProfileForm';
import reserveTicketForm from '../forms/reserve/reserveTicketForm';
import ReserveSessionModel from '../models/reserve/session';

const extraSeatNum: any = conf.get<any>('extra_seat_num');
const debug = createDebug('ttts-staff:controller:reserveBase');
const DEFAULT_RADIX = 10;

/**
 * 座席・券種FIXプロセス
 *
 * @param {ReserveSessionModel} reservationModel
 * @returns {Promise<void>}
 */
export async function processFixSeatsAndTickets(reservationModel: ReserveSessionModel,
                                                req: Request): Promise<void> {
    // 検証(券種が選択されていること)+チケット枚数合計計算
    const checkInfo = await checkFixSeatsAndTickets(req);
    if (checkInfo.status === false) {
        throw new Error(checkInfo.message);
    }

    // 予約可能件数チェック+予約情報取得
    const infos = await getInfoFixSeatsAndTickets(reservationModel, req, Number(checkInfo.selectedCount) + Number(checkInfo.extraCount));
    if (infos.status === false) {
        throw new Error(infos.message);
    }

    // チケット情報に枚数セット(画面で選択された枚数<画面再表示用)
    reservationModel.ticketTypes.forEach((ticketType) => {
        const choice = checkInfo.choices.find((c: any) => (ticketType._id === c.ticket_type));
        ticketType.count = (choice !== undefined) ? Number(choice.ticket_count) : 0;
    });

    // セッション中の予約リストを初期化
    reservationModel.seatCodes = [];
    reservationModel.seatCodesExtra = [];
    reservationModel.expiredAt = moment().add(conf.get<number>('temporary_reservation_valid_period_seconds'), 'seconds').valueOf();

    // 予約情報更新(「仮予約:TEMPORARY」にアップデートする処理を枚数分実行)
    const updateCount: number = await saveDbFixSeatsAndTickets(
        reservationModel,
        req,
        checkInfo.choicesAll,
        ReservationUtil.STATUS_TEMPORARY);

    // 予約情報更新(Extra分)
    let updateCountExtra: number = 0;
    if (updateCount >= checkInfo.selectedCount && checkInfo.extraCount > 0) {
        updateCountExtra = await saveDbFixSeatsAndTickets(
            reservationModel,
            req,
            checkInfo.choicesExtra,
            ReservationUtil.STATUS_TEMPORARY_FOR_SECURE_EXTRA);
    }

    // 予約枚数が指定枚数に達しなかった時,予約可能に戻す
    if (updateCount + updateCountExtra < Number(checkInfo.selectedCount) + Number(checkInfo.extraCount)) {
        await processCancelSeats(reservationModel);
        // "予約可能な席がございません"
        throw new Error(req.__('Message.NoAvailableSeats'));
    }
}
/**
 * 座席・券種FIXプロセス/検証処理
 *
 * @param {Request} req
 * @returns {Promise<void>}
 */
async function checkFixSeatsAndTickets(req: Request) : Promise<any> {
    const checkInfo : any = {
        status: false,
        choices: null,
        choicesAll: [],
        choicesExtra: [],
        selectedCount: 0,
        extraCount: 0,
        message: ''
    };
    // 検証(券種が選択されていること)
    reserveTicketForm(req);
    const validationResult = await req.getValidationResult();
    if (!validationResult.isEmpty()) {
        checkInfo.message =  req.__('Message.Invalid');

        return checkInfo;
    }
    // 画面から座席選択情報が生成できなければエラー
    const choices = JSON.parse(req.body.choices);
    if (!Array.isArray(choices)) {
        checkInfo.message =  req.__('Message.UnexpectedError');

        return checkInfo;
    }
    checkInfo.choices = choices;
    // チケット枚数合計計算
    choices.forEach((choice: any) => {
        // チケットセット(選択枚数分)
        checkInfo.selectedCount += Number(choice.ticket_count);
        for (let index = 0; index < Number(choice.ticket_count); index += 1) {
            // 選択チケット本体分セット(選択枚数分)
            checkInfo.choicesAll.push({
                ticket_type : (<any>choice).ticket_type,
                watcher_name: (<any>choice).watcher_name,
                ticketCount: 1,
                updated: false
            });
            // 2017/07/07 特殊チケット対応(追加分セット)
            // 特殊チケットの枚数はconfigから取得
            if (extraSeatNum.hasOwnProperty((<any>choice).ticket_type) === true) {
                const extraCount: number = Number(extraSeatNum[(<any>choice).ticket_type]) - 1;
                for (let indexExtra = 0; indexExtra < extraCount; indexExtra += 1) {
                    checkInfo.choicesExtra.push({
                        ticket_type : (<any>choice).ticket_type,
                        watcher_name: (<any>choice).watcher_name,
                        ticketCount: 1,
                        updated: false
                    });
                    checkInfo.extraCount += 1;
                }
            }
            //---
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
async function getInfoFixSeatsAndTickets(reservationModel: ReserveSessionModel,
                                         req: Request,
                                         selectedCount: number) : Promise<any> {
    const info : any = {
        status: false,
        results: null,
        message: ''
    };
    // 予約可能件数取得
    const conditions: any = {
        performance: reservationModel.performance._id,
        status : ReservationUtil.STATUS_AVAILABLE
    };
    const count = await Models.Reservation.count(conditions).exec();
    // チケット枚数より少ない場合は、購入不可としてリターン
    if (count < selectedCount) {
        // "予約可能な席がございません"
        info.message = req.__('Message.NoAvailableSeats');

        return info;
    }
    // 予約情報取得
    const reservations = await Models.Reservation.find(conditions).exec();
    info.results = reservations.map((reservation) => {
        return {
            _id: reservation._id,
            performance: (<any>reservation).performance,
            seat_code: (<any>reservation).seat_code,
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
 * 座席・券種FIXプロセス/予約情報をDBにsave(仮予約)
 *
 * @param {ReservationModel} reservationModel
 * @param {Request} req
 * @param {any[]} choices
 * @param {string} status
 * @returns {Promise<number>}
 */
async function saveDbFixSeatsAndTickets(reservationModel: ReserveSessionModel,
                                        req: Request,
                                        choices: any[],
                                        status: string): Promise<number> {
    // 予約情報更新(「仮予約:TEMPORARY」にアップデートする処理を枚数分実行)
    let updateCount: number = 0;
    const promises = choices.map(async(choice: any) => {
        // 予約情報更新キーセット(パフォーマンス,'予約可能')
        const updateKey = {
            performance: reservationModel.performance._id,
            status: ReservationUtil.STATUS_AVAILABLE
        };
        // '予約可能'を'仮予約'に変更
        const reservation = await Models.Reservation.findOneAndUpdate(
            updateKey,
            {
                status: status,
                expired_at: reservationModel.expiredAt
            },
            {
                new: true
            }
        ).exec();
        // 更新エラー(対象データなし):次のseatへ
        if (reservation === null) {
            debug('update error');
            // tslint:disable-next-line:no-console
            console.debug('update error');
        } else {
            // tslint:disable-next-line:no-console
            console.debug((<any>reservation).seat_code);
            updateCount = updateCount + 1;
            // チケット情報+座席情報をセッションにsave
            saveSessionFixSeatsAndTickets(req, reservationModel, reservation, choice, status);
        }
    });
    await Promise.all(promises);

    return updateCount;
}
/**
 * 座席・券種FIXプロセス/予約情報をセッションにsave
 *
 * @param {ReservationModel} reservationModel
 * @param {Request} req
 * @param {any} result
 * @param {any} choice
 * @param {string} status
 * @returns {Promise<void>}
 */
function saveSessionFixSeatsAndTickets(req: Request,
                                       reservationModel: ReserveSessionModel,
                                       result: any,
                                       choice: any,
                                       status: string) : void {
    // チケット情報
    const ticketType = reservationModel.ticketTypes.find((ticketTypeInArray) => (ticketTypeInArray._id === choice.ticket_type));
    if (ticketType === undefined) {
        throw new Error(req.__('Message.UnexpectedError'));
    }
    // 座席情報
    const seatInfo = reservationModel.performance.screen.sections[0].seats.find((seat) => (seat.code === result.seat_code));
    if (seatInfo === undefined) {
        throw new Error(req.__('Message.InvalidSeatCode'));
    }
    // セッションに保管
    // 2017/07/08 特殊チケット対応
    status === ReservationUtil.STATUS_TEMPORARY ?
        reservationModel.seatCodes.push(result.seat_code) :
        reservationModel.seatCodesExtra.push(result.seat_code);

    reservationModel.setReservation(result.seat_code, {
        _id : result._id,
        status : result.status,
        seat_code : result.seat_code,
        seat_grade_name : seatInfo.grade.name,
        seat_grade_additional_charge : seatInfo.grade.additional_charge,
        ticket_type : ticketType._id,
        ticket_type_name : ticketType.name,
        ticket_type_charge : ticketType.charge,
        watcher_name : choice.watcher_name
        //watcher_name: ''
    });
    // 座席コードのソート(文字列順に)
    reservationModel.seatCodes.sort(ScreenUtil.sortBySeatCode);

    return;
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
    if (!_.isEmpty(req.query.locale)) {
        (<any>req.session).locale = req.query.locale;
    } else {
        (<any>req.session).locale = 'ja';
    }

    // 予約トークンを発行
    const reservationModel = new ReserveSessionModel();
    reservationModel.purchaserGroup = purchaserGroup;
    initializePayment(reservationModel, req);

    if (!_.isEmpty(req.query.performance)) {
        // パフォーマンス指定遷移の場合 パフォーマンスFIX
        await processFixPerformance(reservationModel, req.query.performance, req);
    }

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
        case ReservationUtil.PURCHASER_GROUP_STAFF:
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

        case ReservationUtil.PURCHASER_GROUP_WINDOW:
            reservationModel.purchaser = {
                lastName: 'マドグチ',
                firstName: 'タントウシャ',
                tel: '0362263025',
                email: 'ttts@localhost.net',
                age: '00',
                address: '',
                gender: '1'
            };

            //reservationModel.paymentMethodChoices = [GMO.Util.PAY_TYPE_CREDIT, GMO.Util.PAY_TYPE_CASH];
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
    const ids = reservationModel.getReservationIds();
    if (ids.length > 0) {
        // セッション中の予約リストを初期化
        reservationModel.seatCodes = [];

        // 仮予約を空席ステータスに戻す
        // 2017/05 予約レコード削除からSTATUS初期化へ変更
        const promises = ids.map(async (id: any) => {
            try {
                await Models.Reservation.findByIdAndUpdate(
                    { _id: id },
                    {
                         $set: { status: ReservationUtil.STATUS_AVAILABLE },
                         $unset: {payment_no: 1, ticket_type: 1, expired_at: 1}
                    },
                    {
                        new: true
                    }
                ).exec();
            } catch (error) {
                //失敗したとしても時間経過で消るので放置
            }
        });
        await Promise.all(promises);
    }
}

/**
 * パフォーマンスをFIXするプロセス
 * パフォーマンスIDから、パフォーマンスを検索し、その後プロセスに必要な情報をreservationModelに追加する
 */
// tslint:disable-next-line:max-func-body-length
export async function processFixPerformance(reservationModel: ReserveSessionModel, perfomanceId: string, req: Request): Promise<void> {
    // パフォーマンス取得
    const performance = await Models.Performance.findById(
        perfomanceId,
        'day open_time start_time end_time canceled film screen screen_name theater theater_name ticket_type_group' // 必要な項目だけ指定すること
    )
        .populate('film', 'name is_mx4d copyright') // 必要な項目だけ指定すること
        .populate('screen', 'name sections') // 必要な項目だけ指定すること
        .populate('theater', 'name address') // 必要な項目だけ指定すること
        .exec();

    if (performance === null) {
        throw new Error(req.__('Message.NotFound'));
    }

    if (performance.get('canceled') === true) { // 万が一上映中止だった場合
        throw new Error(req.__('Message.OutOfTerm'));
    }

    // 内部と当日以外は、上映日当日まで購入可能
    if (reservationModel.purchaserGroup !== ReservationUtil.PURCHASER_GROUP_WINDOW &&
        reservationModel.purchaserGroup !== ReservationUtil.PURCHASER_GROUP_STAFF) {
        if (parseInt(performance.get('day'), DEFAULT_RADIX) < parseInt(moment().format('YYYYMMDD'), DEFAULT_RADIX)) {
            throw new Error('You cannot reserve this performance.');
        }
    }

    // 券種取得
    const ticketTypeGroup = await Models.TicketTypeGroup.findOne(
        { _id: performance.get('ticket_type_group') }
    ).populate('ticket_types').exec();

    reservationModel.seatCodes = [];

    // 券種リストは、予約する主体によって異なる
    // 内部関係者の場合
    switch (reservationModel.purchaserGroup) {
        case ReservationUtil.PURCHASER_GROUP_STAFF:
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
        _id: performance.get('_id'),
        day: performance.get('day'),
        open_time: performance.get('open_time'),
        start_time: performance.get('start_time'),
        end_time: performance.get('end_time'),
        start_str: performance.get('start_str'),
        location_str: performance.get('location_str'),
        theater: {
            _id: performance.get('theater').get('_id'),
            name: performance.get('theater').get('name'),
            address: performance.get('theater').get('address')
        },
        screen: {
            _id: performance.get('screen').get('_id'),
            name: performance.get('screen').get('name'),
            sections: performance.get('screen').get('sections')
        },
        film: {
            _id: performance.get('film').get('_id'),
            name: performance.get('film').get('name'),
            image: `${req.protocol}://${req.hostname}/images/film/${performance.get('film').get('_id')}.jpg`,
            is_mx4d: performance.get('film').get('is_mx4d'),
            copyright: performance.get('film').get('copyright')
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

    // この時点でトークンに対して購入番号発行(上映日が決まれば購入番号を発行できる)
    reservationModel.paymentNo = await ReservationUtil.publishPaymentNo(reservationModel.performance.day);
}

/**
 * 確定以外の全情報を確定するプロセス
 */
export async function processAllExceptConfirm(reservationModel: ReserveSessionModel, req: Request): Promise<void> {
    const commonUpdate: any = {
    };

    switch (reservationModel.purchaserGroup) {
        case ReservationUtil.PURCHASER_GROUP_STAFF:
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

        case ReservationUtil.PURCHASER_GROUP_WINDOW:
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
        update = {...update, ...commonUpdate};
        (<any>update).payment_seat_index = index;

        const reservation = await Models.Reservation.findByIdAndUpdate(
            update._id,
            update,
            { new: true }
        ).exec();

        // IDの予約ドキュメントが万が一なければ予期せぬエラー(基本的にありえないフローのはず)
        if (reservation === null) {
            throw new Error(req.__('Message.UnexpectedError'));
        }
    }));
}

/**
 * 購入番号から全ての予約を完了にする
 *
 * @param {string} paymentNo 購入番号
 * @param {Object} update 追加更新パラメータ
 */
export async function processFixReservations(reservationModel: ReserveSessionModel,
                                             performanceDay: string,
                                             paymentNo: string,
                                             update: any,
                                             res: Response): Promise<void> {
    (<any>update).purchased_at = moment().valueOf();
    (<any>update).status = ReservationUtil.STATUS_RESERVED;

    const conditions: any = {
        performance_day: performanceDay,
        payment_no: paymentNo,
        status: ReservationUtil.STATUS_TEMPORARY
    };
    // 予約完了ステータスへ変更
    await Models.Reservation.update(
        conditions,
        update,
        { multi: true } // 必須！複数予約ドキュメントを一度に更新するため
    ).exec();
    // 2017/07/08 特殊チケット対応
    // 特殊チケット一時予約を特殊チケット予約完了ステータスへ変更
    conditions.status = ReservationUtil.STATUS_TEMPORARY_FOR_SECURE_EXTRA;
    (<any>update).status = ReservationUtil.STATUS_ON_KEPT_FOR_SECURE_EXTRA;
    await Models.Reservation.update(
        conditions,
        update,
        { multi: true }
    ).exec();

    try {
        // 完了メールキュー追加(あれば更新日時を更新するだけ)
        const emailQueue = await createEmailQueue(reservationModel, res, performanceDay, paymentNo);
        await Models.EmailQueue.create(emailQueue);
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
 *
 * @memberOf ReserveBaseController
 */
// tslint:disable-next-line:max-func-body-length
async function createEmailQueue(reservationModel: ReserveSessionModel,
                                res: Response,
                                performanceDay: string,
                                paymentNo: string): Promise<IEmailQueue> {
    // 2017/07/10 特殊チケット対応(status: ReservationUtil.STATUS_RESERVED追加)
    const reservations: any[] = await Models.Reservation.find({
        status: ReservationUtil.STATUS_RESERVED,
        performance_day: performanceDay,
        payment_no: paymentNo
    }).exec();
    debug('reservations for email found.', reservations.length);
    if (reservations.length === 0) {
        throw new Error(`reservations of payment_no ${paymentNo} not found`);
    }

    let to = '';
    switch (reservations[0].get('purchaser_group')) {
        case ReservationUtil.PURCHASER_GROUP_STAFF:
            to = reservations[0].get('owner_email');
            break;

        default:
            to = reservations[0].get('purchaser_email');
            break;
    }

    debug('to is', to);
    if (to.length === 0) {
        throw new Error('email to unknown');
    }

    const title = res.__('Title');
    const titleEmail = res.__('Email.Title');

    // 券種ごとに合計枚数算出
    const keyName: string = 'ticket_type';
    const ticketInfos: {} = {};
    for ( const reservation of reservations) {
        // チケットタイプセット
        const dataValue = reservation[keyName];
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
                reservations: reservations,
                moment: moment,
                numeral: numeral,
                conf: conf,
                GMOUtil: GMO.Util,
                ReservationUtil: ReservationUtil,
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
                    status: EmailQueueUtil.STATUS_UNSENT
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
    for ( const reservation of reservations) {
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
 *
 * @param {ReserveSessionModel} reservationModel
 * @returns {any[]}
 */
export  function getReservations(reservationModel: ReserveSessionModel): any[] {
    const reservations: any[] = [];
    reservationModel.seatCodes.forEach((seatCode) => {
        reservations.push(new Models.Reservation(reservationModel.seatCode2reservationDocument(seatCode)));
    });

    return reservations;
}
