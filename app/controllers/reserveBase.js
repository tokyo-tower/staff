"use strict";
/**
 * 座席予約ベースコントローラー
 *
 * @namespace controller/reserveBase
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const GMO = require("@motionpicture/gmo-service");
//import { EmailQueueUtil, Models, ReservationUtil, ScreenUtil, TicketTypeGroupUtil } from '@motionpicture/ttts-domain';
const ttts_domain_1 = require("@motionpicture/ttts-domain");
const conf = require("config");
const createDebug = require("debug");
// import * as fs from 'fs-extra';
const moment = require("moment");
const numeral = require("numeral");
const _ = require("underscore");
const reserveProfileForm_1 = require("../forms/reserve/reserveProfileForm");
const reserveTicketForm_1 = require("../forms/reserve/reserveTicketForm");
const session_1 = require("../models/reserve/session");
//const extraSeatNum: any = conf.get<any>('extra_seat_num');
const debug = createDebug('ttts-staff:controller:reserveBase');
const DEFAULT_RADIX = 10;
const LENGTH_HOUR = 2;
/**
 * 座席・券種FIXプロセス
 *
 * @param {ReserveSessionModel} reservationModel
 * @returns {Promise<void>}
 */
function processFixSeatsAndTickets(reservationModel, req) {
    return __awaiter(this, void 0, void 0, function* () {
        // 検証(券種が選択されていること)+チケット枚数合計計算
        const checkInfo = yield checkFixSeatsAndTickets(reservationModel, req);
        if (checkInfo.status === false) {
            throw new Error(checkInfo.message);
        }
        // 予約可能件数チェック+予約情報取得
        const infos = yield getInfoFixSeatsAndTickets(reservationModel, req, Number(checkInfo.selectedCount) + Number(checkInfo.extraCount));
        if (infos.status === false) {
            throw new Error(infos.message);
        }
        // tslint:disable-next-line:no-console
        console.log(`reservationModel.performance=${reservationModel.performance._id}`);
        // チケット情報に枚数セット(画面で選択された枚数<画面再表示用)
        reservationModel.ticketTypes.forEach((ticketType) => {
            const choice = checkInfo.choices.find((c) => (ticketType._id === c.ticket_type));
            ticketType.count = (choice !== undefined) ? Number(choice.ticket_count) : 0;
        });
        // セッション中の予約リストを初期化
        reservationModel.seatCodes = [];
        reservationModel.seatCodesExtra = [];
        reservationModel.expiredAt = moment().add(conf.get('temporary_reservation_valid_period_seconds'), 'seconds').valueOf();
        let updateCountTotal = 0;
        const promises = checkInfo.choicesAll.map((choiceInfo) => __awaiter(this, void 0, void 0, function* () {
            const updateCount = yield saveDbFixSeatsAndTickets(reservationModel, req, choiceInfo);
            updateCountTotal += updateCount;
        }));
        yield Promise.all(promises);
        // 予約枚数が指定枚数に達しなかった時,予約可能に戻す
        if (updateCountTotal < Number(checkInfo.selectedCount) + Number(checkInfo.extraCount)) {
            yield processCancelSeats(reservationModel);
            // "予約可能な席がございません"
            throw new Error(req.__('Message.NoAvailableSeats'));
        }
    });
}
exports.processFixSeatsAndTickets = processFixSeatsAndTickets;
/**
 * 座席・券種FIXプロセス/検証処理
 *
 * @param {ReservationModel} reservationModel
 * @param {Request} req
 * @returns {Promise<void>}
 */
function checkFixSeatsAndTickets(reservationModel, req) {
    return __awaiter(this, void 0, void 0, function* () {
        const checkInfo = {
            status: false,
            choices: null,
            choicesAll: [],
            selectedCount: 0,
            extraCount: 0,
            message: ''
        };
        // 検証(券種が選択されていること)
        reserveTicketForm_1.default(req);
        const validationResult = yield req.getValidationResult();
        if (!validationResult.isEmpty()) {
            checkInfo.message = req.__('Message.Invalid');
            return checkInfo;
        }
        // 画面から座席選択情報が生成できなければエラー
        const choices = JSON.parse(req.body.choices);
        if (!Array.isArray(choices)) {
            checkInfo.message = req.__('Message.UnexpectedError');
            return checkInfo;
        }
        checkInfo.choices = choices;
        // 特殊チケット情報
        const extraSeatNum = {};
        reservationModel.ticketTypes.forEach((ticketTypeInArray) => {
            if (ticketTypeInArray.ttts_extension.category !== ttts_domain_1.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
                extraSeatNum[ticketTypeInArray._id] = ticketTypeInArray.ttts_extension.required_seat_num;
            }
        });
        // チケット枚数合計計算
        choices.forEach((choice) => {
            // チケットセット(選択枚数分)
            checkInfo.selectedCount += Number(choice.ticket_count);
            for (let index = 0; index < Number(choice.ticket_count); index += 1) {
                const choiceInfo = {
                    ticket_type: choice.ticket_type,
                    ticketCount: 1,
                    choicesExtra: [],
                    updated: false
                };
                // 特殊の時、必要枚数分セット
                if (extraSeatNum.hasOwnProperty(choice.ticket_type) === true) {
                    const extraCount = Number(extraSeatNum[choice.ticket_type]) - 1;
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
    });
}
/**
 * 座席・券種FIXプロセス/予約情報取得処理
 *
 * @param {ReservationModel} reservationModel
 * @param {Request} req
 * @param {number} selectedCount
 * @returns {Promise<void>}
 */
function getInfoFixSeatsAndTickets(reservationModel, req, selectedCount) {
    return __awaiter(this, void 0, void 0, function* () {
        const info = {
            status: false,
            results: null,
            message: ''
        };
        // 予約可能件数取得
        const conditions = {
            performance: reservationModel.performance._id,
            status: ttts_domain_1.ReservationUtil.STATUS_AVAILABLE
        };
        const count = yield ttts_domain_1.Models.Reservation.count(conditions).exec();
        // チケット枚数より少ない場合は、購入不可としてリターン
        if (count < selectedCount) {
            // "予約可能な席がございません"
            info.message = req.__('Message.NoAvailableSeats');
            return info;
        }
        // 予約情報取得
        const reservations = yield ttts_domain_1.Models.Reservation.find(conditions).exec();
        info.results = reservations.map((reservation) => {
            return {
                _id: reservation._id,
                performance: reservation.performance,
                seat_code: reservation.seat_code,
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
    });
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
function saveDbFixSeatsAndTickets(reservationModel, req, choiceInfo) {
    return __awaiter(this, void 0, void 0, function* () {
        // チケット情報
        const ticketType = reservationModel.ticketTypes.find((ticketTypeInArray) => (ticketTypeInArray._id === choiceInfo.ticket_type));
        if (ticketType === undefined) {
            throw new Error(req.__('Message.UnexpectedError'));
        }
        // 予約情報更新キーセット(パフォーマンス,'予約可能')
        const updateKey = {
            performance: reservationModel.performance._id,
            status: ttts_domain_1.ReservationUtil.STATUS_AVAILABLE
        };
        let updateCount = 0;
        // 本体分の予約更新('予約可能'を'仮予約'に変更)
        let reservation = yield updateReservation(updateKey, ttts_domain_1.ReservationUtil.STATUS_TEMPORARY, reservationModel.expiredAt, '', ticketType);
        if (reservation === null) {
            return 0;
        }
        // 座席番号取得＆Save
        const seatCodeBase = reservation.seat_code;
        reservation = yield ttts_domain_1.Models.Reservation.findByIdAndUpdate({ _id: reservation._id }, { $set: { reservation_ttts_extension: { seat_code_base: seatCodeBase } } }, { new: true }).exec();
        if (reservation === null) {
            return 0;
        }
        // 2017/11 時間ごとの予約情報更新
        if (ticketType.ttts_extension.category !== ttts_domain_1.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
            if (!(yield updateReservationPerHour(reservation._id.toString(), reservationModel.expiredAt, ticketType, reservationModel.performance))) {
                // 更新済の予約データクリア
                yield ttts_domain_1.Models.Reservation.findByIdAndUpdate({ _id: reservation._id }, { $set: { status: ttts_domain_1.ReservationUtil.STATUS_AVAILABLE },
                    $unset: { payment_no: 1, ticket_type: 1, expired_at: 1, ticket_ttts_extension: 1, reservation_ttts_extension: 1 } }, { new: true }).exec();
                return 0;
            }
        }
        // チケット情報+座席情報をセッションにsave
        saveSessionFixSeatsAndTickets(req, reservationModel, reservation, ticketType, ttts_domain_1.ReservationUtil.STATUS_TEMPORARY);
        updateCount += 1;
        // 余分確保分の予約更新
        const promises = choiceInfo.choicesExtra.map(() => __awaiter(this, void 0, void 0, function* () {
            // '予約可能'を'仮予約'に変更('予約可能'を'仮予約'に変更)
            const reservationExtra = yield updateReservation(updateKey, ttts_domain_1.ReservationUtil.STATUS_TEMPORARY_FOR_SECURE_EXTRA, reservationModel.expiredAt, seatCodeBase, ticketType);
            // 更新エラー(対象データなし):次のseatへ
            if (reservationExtra !== null) {
                updateCount = updateCount + 1;
                // チケット情報+座席情報をセッションにsave
                saveSessionFixSeatsAndTickets(req, reservationModel, reservationExtra, ticketType, ttts_domain_1.ReservationUtil.STATUS_TEMPORARY_FOR_SECURE_EXTRA);
            }
        }));
        yield Promise.all(promises);
        return updateCount;
    });
}
/**
 * 座席・券種FIXプロセス/予約情報をDBにsave(仮予約)
 *
 * @param {string} reservationId
 * @param {any} expiredAt
 * @param {string} ticketType
 * @param {string} performance
 * @returns {Promise<boolean>}
 */
function updateReservationPerHour(reservationId, expiredAt, ticketType, performance) {
    return __awaiter(this, void 0, void 0, function* () {
        // 更新キー(入塔日＋時間帯)
        const updateKey = {
            performance_day: performance.day,
            performance_hour: performance.start_time.slice(0, LENGTH_HOUR),
            ticket_category: ticketType.ttts_extension.category,
            status: ttts_domain_1.ReservationUtil.STATUS_AVAILABLE
        };
        // 更新内容セット
        const updateData = {
            status: ttts_domain_1.ReservationUtil.STATUS_TEMPORARY,
            expired_at: expiredAt,
            reservation_id: reservationId
        };
        // '予約可能'を'仮予約'に変更
        const reservation = yield ttts_domain_1.Models.ReservationPerHour.findOneAndUpdate(updateKey, updateData, {
            new: true
        }).exec();
        // 更新エラー(対象データなし):既に予約済
        if (reservation === null) {
            debug('update hour error');
            // tslint:disable-next-line:no-console
            console.log('update hour error');
        }
        else {
            // tslint:disable-next-line:no-console
            console.log(reservation._id);
        }
        return reservation !== null;
    });
}
/**
 * 座席・券種FIXプロセス/予約情報をDBにsave(仮予約)
 *
 * @param {any} updateKey
 * @param {string} status
 * @param {any} expiredAt
 * @returns {Promise<void>}
 */
function updateReservation(updateKey, status, expiredAt, seatCodeBase, ticketType) {
    return __awaiter(this, void 0, void 0, function* () {
        // 更新内容セット
        const updateData = {
            status: status,
            expired_at: expiredAt,
            ticket_ttts_extension: ticketType.ttts_extension,
            reservation_ttts_extension: {
                seat_code_base: seatCodeBase
            }
        };
        // '予約可能'を'仮予約'に変更
        const reservation = yield ttts_domain_1.Models.Reservation.findOneAndUpdate(updateKey, updateData, {
            new: true
        }).exec();
        // 更新エラー(対象データなし):次のseatへ
        if (reservation === null) {
            debug('update error');
            // tslint:disable-next-line:no-console
            console.log('update error');
        }
        else {
            // tslint:disable-next-line:no-console
            console.log(reservation.seat_code);
        }
        return reservation;
    });
}
/**
 * 座席・券種FIXプロセス/予約情報をセッションにsave
 *
 * @param {ReservationModel} reservationModel
 * @param {Request} req
 * @param {any} result
 * @param {any} ticketType
 * @param {string} status
 * @returns {Promise<void>}
 */
function saveSessionFixSeatsAndTickets(req, reservationModel, result, ticketType, status) {
    // 座席情報
    const seatInfo = reservationModel.performance.screen.sections[0].seats.find((seat) => (seat.code === result.seat_code));
    if (seatInfo === undefined) {
        throw new Error(req.__('Message.InvalidSeatCode'));
    }
    // セッションに保管
    // 2017/07/08 特殊チケット対応
    status === ttts_domain_1.ReservationUtil.STATUS_TEMPORARY ?
        reservationModel.seatCodes.push(result.seat_code) :
        reservationModel.seatCodesExtra.push(result.seat_code);
    reservationModel.setReservation(result.seat_code, {
        _id: result._id,
        status: result.status,
        seat_code: result.seat_code,
        seat_grade_name: seatInfo.grade.name,
        seat_grade_additional_charge: seatInfo.grade.additional_charge,
        ticket_type: ticketType._id,
        ticket_type_name: ticketType.name,
        ticket_type_charge: ticketType.charge,
        watcher_name: '',
        ticket_cancel_charge: ticketType.cancel_charge,
        ticket_ttts_extension: ticketType.ttts_extension
    });
    // 座席コードのソート(文字列順に)
    reservationModel.seatCodes.sort(ttts_domain_1.ScreenUtil.sortBySeatCode);
    return;
}
/**
 * 購入者情報FIXプロセス
 *
 * @param {ReservationModel} reservationModel
 * @returns {Promise<void>}
 */
function processFixProfile(reservationModel, req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        reserveProfileForm_1.default(req);
        const validationResult = yield req.getValidationResult();
        res.locals.validation = validationResult.mapped();
        res.locals.paymentMethod = req.body.paymentMethod;
        if (!validationResult.isEmpty()) {
            throw new Error(req.__('Message.Invalid'));
        }
        // 購入情報を保存
        reservationModel.paymentMethod = req.body.paymentMethod;
        // セッションに購入者情報格納
        req.session.purchaser = {
            lastName: reservationModel.purchaser.lastName,
            firstName: reservationModel.purchaser.firstName,
            tel: reservationModel.purchaser.tel,
            email: reservationModel.purchaser.email,
            age: reservationModel.purchaser.age,
            address: reservationModel.purchaser.address,
            gender: reservationModel.purchaser.gender
        };
    });
}
exports.processFixProfile = processFixProfile;
/**
 * 購入開始プロセス
 *
 * @param {string} purchaserGroup 購入者区分
 */
function processStart(purchaserGroup, req) {
    return __awaiter(this, void 0, void 0, function* () {
        // 言語も指定
        if (!_.isEmpty(req.query.locale)) {
            req.session.locale = req.query.locale;
        }
        else {
            req.session.locale = 'ja';
        }
        // 予約トークンを発行
        const reservationModel = new session_1.default();
        reservationModel.purchaserGroup = purchaserGroup;
        initializePayment(reservationModel, req);
        if (!_.isEmpty(req.query.performance)) {
            // パフォーマンス指定遷移の場合 パフォーマンスFIX
            yield processFixPerformance(reservationModel, req.query.performance, req);
        }
        return reservationModel;
    });
}
exports.processStart = processStart;
/**
 * 購入情報を初期化する
 */
function initializePayment(reservationModel, req) {
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
        case ttts_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
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
        case ttts_domain_1.ReservationUtil.PURCHASER_GROUP_WINDOW:
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
function processCancelSeats(reservationModel) {
    return __awaiter(this, void 0, void 0, function* () {
        const ids = reservationModel.getReservationIds();
        const idsExtra = reservationModel.getReservationIdsExtra();
        Array.prototype.push.apply(ids, idsExtra);
        if (ids.length > 0) {
            // セッション中の予約リストを初期化
            reservationModel.seatCodes = [];
            // 仮予約を空席ステータスに戻す
            // 2017/05 予約レコード削除からSTATUS初期化へ変更
            const promises = ids.map((id) => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield ttts_domain_1.Models.Reservation.findByIdAndUpdate({ _id: id }, {
                        $set: { status: ttts_domain_1.ReservationUtil.STATUS_AVAILABLE },
                        $unset: { payment_no: 1, ticket_type: 1, expired_at: 1, ticket_ttts_extension: 1, reservation_ttts_extension: 1 }
                    }, {
                        new: true
                    }).exec();
                }
                catch (error) {
                    //失敗したとしても時間経過で消るので放置
                    // tslint:disable-next-line:no-console
                    console.log(`clear error id=${id}`);
                }
            }));
            yield Promise.all(promises);
            // 2017/11 時間ごとの予約レコードのSTATUS初期化
            const promisesHour = ids.map((id) => __awaiter(this, void 0, void 0, function* () {
                if (idsExtra.indexOf(id) < 0) {
                    try {
                        yield ttts_domain_1.Models.ReservationPerHour.findOneAndUpdate({ reservation_id: id }, {
                            $set: { status: ttts_domain_1.ReservationUtil.STATUS_AVAILABLE },
                            $unset: { expired_at: 1, reservation_id: 1 }
                        }, {
                            new: true
                        }).exec();
                    }
                    catch (error) {
                        //失敗したとしても時間経過で消るので放置
                    }
                }
            }));
            yield Promise.all(promisesHour);
        }
    });
}
exports.processCancelSeats = processCancelSeats;
/**
 * パフォーマンスをFIXするプロセス
 * パフォーマンスIDから、パフォーマンスを検索し、その後プロセスに必要な情報をreservationModelに追加する
 */
// tslint:disable-next-line:max-func-body-length
function processFixPerformance(reservationModel, perfomanceId, req) {
    return __awaiter(this, void 0, void 0, function* () {
        // パフォーマンス取得
        const performance = yield ttts_domain_1.Models.Performance.findById(perfomanceId, 'day open_time start_time end_time canceled film screen screen_name theater theater_name ticket_type_group' // 必要な項目だけ指定すること
        )
            .populate('film', 'name is_mx4d copyright') // 必要な項目だけ指定すること
            .populate('screen', 'name sections') // 必要な項目だけ指定すること
            .populate('theater', 'name address') // 必要な項目だけ指定すること
            .exec();
        if (performance === null) {
            throw new Error(req.__('Message.NotFound'));
        }
        if (performance.get('canceled') === true) {
            throw new Error(req.__('Message.OutOfTerm'));
        }
        // 内部と当日以外は、上映日当日まで購入可能
        if (reservationModel.purchaserGroup !== ttts_domain_1.ReservationUtil.PURCHASER_GROUP_WINDOW &&
            reservationModel.purchaserGroup !== ttts_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF) {
            if (parseInt(performance.get('day'), DEFAULT_RADIX) < parseInt(moment().format('YYYYMMDD'), DEFAULT_RADIX)) {
                throw new Error('You cannot reserve this performance.');
            }
        }
        // 券種取得
        const ticketTypeGroup = yield ttts_domain_1.Models.TicketTypeGroup.findOne({ _id: performance.get('ticket_type_group') }).populate('ticket_types').exec();
        reservationModel.seatCodes = [];
        // 券種リストは、予約する主体によって異なる
        // 内部関係者の場合
        switch (reservationModel.purchaserGroup) {
            case ttts_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
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
        reservationModel.paymentNo = yield ttts_domain_1.ReservationUtil.publishPaymentNo(reservationModel.performance.day);
    });
}
exports.processFixPerformance = processFixPerformance;
/**
 * 確定以外の全情報を確定するプロセス
 */
function processAllExceptConfirm(reservationModel, req) {
    return __awaiter(this, void 0, void 0, function* () {
        const commonUpdate = {};
        switch (reservationModel.purchaserGroup) {
            case ttts_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
                commonUpdate.owner = req.staffUser.get('_id');
                commonUpdate.owner_username = req.staffUser.get('username');
                commonUpdate.owner_name = req.staffUser.get('name');
                commonUpdate.owner_email = req.staffUser.get('email');
                commonUpdate.owner_signature = req.staffUser.get('signature');
                commonUpdate.owner_group = req.staffUser.get('group');
                commonUpdate.purchaser_last_name = '';
                commonUpdate.purchaser_first_name = '';
                commonUpdate.purchaser_email = '';
                commonUpdate.purchaser_tel = '';
                commonUpdate.purchaser_age = '';
                commonUpdate.purchaser_address = '';
                commonUpdate.purchaser_gender = '';
                break;
            case ttts_domain_1.ReservationUtil.PURCHASER_GROUP_WINDOW:
                commonUpdate.owner = req.windowUser.get('_id');
                commonUpdate.owner_username = req.windowUser.get('username');
                commonUpdate.owner_name = req.windowUser.get('name');
                commonUpdate.owner_email = req.windowUser.get('email');
                commonUpdate.owner_signature = req.windowUser.get('signature');
                commonUpdate.owner_group = req.windowUser.get('group');
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
        const seatCodesAll = Array.prototype.concat(reservationModel.seatCodes, reservationModel.seatCodesExtra);
        // いったん全情報をDBに保存
        yield Promise.all(seatCodesAll.map((seatCode, index) => __awaiter(this, void 0, void 0, function* () {
            let update = reservationModel.seatCode2reservationDocument(seatCode);
            // update = Object.assign(update, commonUpdate);
            update = Object.assign({}, update, commonUpdate);
            update.payment_seat_index = index;
            const reservation = yield ttts_domain_1.Models.Reservation.findByIdAndUpdate(update._id, update, { new: true }).exec();
            // IDの予約ドキュメントが万が一なければ予期せぬエラー(基本的にありえないフローのはず)
            if (reservation === null) {
                throw new Error(req.__('Message.UnexpectedError'));
            }
        })));
    });
}
exports.processAllExceptConfirm = processAllExceptConfirm;
/**
 * 購入番号から全ての予約を完了にする
 *
 * @param {string} paymentNo 購入番号
 * @param {Object} update 追加更新パラメータ
 */
function processFixReservations(reservationModel, performanceDay, paymentNo, update, res) {
    return __awaiter(this, void 0, void 0, function* () {
        update.purchased_at = moment().valueOf();
        update.status = ttts_domain_1.ReservationUtil.STATUS_RESERVED;
        const conditions = {
            performance_day: performanceDay,
            payment_no: paymentNo,
            status: ttts_domain_1.ReservationUtil.STATUS_TEMPORARY
        };
        // 予約完了ステータスへ変更
        yield ttts_domain_1.Models.Reservation.update(conditions, update, { multi: true } // 必須！複数予約ドキュメントを一度に更新するため
        ).exec();
        // 2017/07/08 特殊チケット対応
        // 特殊チケット一時予約を特殊チケット予約完了ステータスへ変更
        conditions.status = ttts_domain_1.ReservationUtil.STATUS_TEMPORARY_FOR_SECURE_EXTRA;
        update.status = ttts_domain_1.ReservationUtil.STATUS_ON_KEPT_FOR_SECURE_EXTRA;
        yield ttts_domain_1.Models.Reservation.update(conditions, update, { multi: true }).exec();
        // 2017/11 本体チケット予約情報取得
        const reservations = getReservations(reservationModel);
        yield Promise.all(reservations.map((reservation) => __awaiter(this, void 0, void 0, function* () {
            // 2017/11 本体チケットかつ特殊(車椅子)チケットの時
            if (reservation.ticket_ttts_extension.category !== ttts_domain_1.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
                // 時間ごとの予約情報更新('仮予約'を'予約'に変更)
                yield ttts_domain_1.Models.ReservationPerHour.findOneAndUpdate({ reservation_id: reservation._id.toString() }, { status: ttts_domain_1.ReservationUtil.STATUS_RESERVED }, { new: true }).exec();
            }
        })));
        try {
            // 完了メールキュー追加(あれば更新日時を更新するだけ)
            const emailQueue = yield createEmailQueue(reservationModel, res, performanceDay, paymentNo);
            yield ttts_domain_1.Models.EmailQueue.create(emailQueue);
        }
        catch (error) {
            console.error(error);
            // 失敗してもスルー(ログと運用でなんとかする)
        }
    });
}
exports.processFixReservations = processFixReservations;
/**
 * 予約完了メールを作成する
 *
 * @memberOf ReserveBaseController
 */
// tslint:disable-next-line:max-func-body-length
function createEmailQueue(reservationModel, res, performanceDay, paymentNo) {
    return __awaiter(this, void 0, void 0, function* () {
        // 2017/07/10 特殊チケット対応(status: ReservationUtil.STATUS_RESERVED追加)
        const reservations = yield ttts_domain_1.Models.Reservation.find({
            status: ttts_domain_1.ReservationUtil.STATUS_RESERVED,
            performance_day: performanceDay,
            payment_no: paymentNo
        }).exec();
        debug('reservations for email found.', reservations.length);
        if (reservations.length === 0) {
            throw new Error(`reservations of payment_no ${paymentNo} not found`);
        }
        let to = '';
        switch (reservations[0].get('purchaser_group')) {
            case ttts_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
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
        const keyName = 'ticket_type';
        const ticketInfos = {};
        for (const reservation of reservations) {
            // チケットタイプセット
            const dataValue = reservation[keyName];
            // チケットタイプごとにチケット情報セット
            if (!ticketInfos.hasOwnProperty(dataValue)) {
                ticketInfos[dataValue] = {
                    ticket_type_name: reservation.ticket_type_name,
                    charge: `\\${numeral(reservation.charge).format('0,0')}`,
                    count: 1
                };
            }
            else {
                ticketInfos[dataValue].count += 1;
            }
        }
        // 券種ごとの表示情報編集
        const leaf = res.__('Email.Leaf');
        const ticketInfoArray = [];
        Object.keys(ticketInfos).forEach((key) => {
            const ticketInfo = ticketInfos[key];
            ticketInfoArray.push(`${ticketInfo.ticket_type_name[res.locale]} ${ticketInfo.count}${leaf}`);
        });
        const day = moment(reservations[0].performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
        // tslint:disable-next-line:no-magic-numbers
        const time = `${reservations[0].performance_start_time.substr(0, 2)}:${reservations[0].performance_start_time.substr(2, 2)}`;
        debug('rendering template...');
        return new Promise((resolve, reject) => {
            res.render('email/reserve/complete', {
                layout: false,
                reservations: reservations,
                moment: moment,
                numeral: numeral,
                conf: conf,
                GMOUtil: GMO.Util,
                ReservationUtil: ttts_domain_1.ReservationUtil,
                ticketInfoArray: ticketInfoArray,
                totalCharge: reservationModel.getTotalCharge(),
                dayTime: `${day} ${time}`
            }, (renderErr, text) => __awaiter(this, void 0, void 0, function* () {
                debug('email template rendered.', renderErr);
                if (renderErr instanceof Error) {
                    reject(new Error('failed in rendering an email.'));
                    return;
                }
                const emailQueue = {
                    from: {
                        address: conf.get('email.from'),
                        name: conf.get('email.fromname')
                    },
                    to: {
                        address: to
                        // name: 'testto'
                    },
                    subject: `${title} ${titleEmail}`,
                    content: {
                        mimetype: 'text/plain',
                        text: text
                    },
                    status: ttts_domain_1.EmailQueueUtil.STATUS_UNSENT
                };
                resolve(emailQueue);
            }));
        });
    });
}
/**
 * チケット情報(券種ごとの枚数)取得
 *
 * @param {any[]} reservations
 * @returns {any}
 */
function getTicketInfos(reservations) {
    // 券種ごとに合計枚数算出
    const keyName = 'ticket_type';
    const ticketInfos = {};
    for (const reservation of reservations) {
        // チケットタイプセット
        const dataValue = reservation[keyName];
        // チケットタイプごとにチケット情報セット
        if (!ticketInfos.hasOwnProperty(dataValue)) {
            ticketInfos[dataValue] = {
                ticket_type_name: reservation.ticket_type_name,
                charge: `\\${numeral(reservation.charge).format('0,0')}`,
                watcher_name: reservation.watcher_name,
                count: 1
            };
        }
        else {
            ticketInfos[dataValue].count += 1;
        }
    }
    return ticketInfos;
}
exports.getTicketInfos = getTicketInfos;
/**
 * 予約情報取得(reservationModelから)
 *
 * @param {ReserveSessionModel} reservationModel
 * @returns {any[]}
 */
function getReservations(reservationModel) {
    const reservations = [];
    reservationModel.seatCodes.forEach((seatCode) => {
        reservations.push(new ttts_domain_1.Models.Reservation(reservationModel.seatCode2reservationDocument(seatCode)));
    });
    return reservations;
}
exports.getReservations = getReservations;
