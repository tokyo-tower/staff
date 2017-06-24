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
const debug = createDebug('ttts-staff:controller:reserveBase');
const DEFAULT_RADIX = 10;
/**
 * 座席・券種FIXプロセス
 *
 * @param {ReserveSessionModel} reservationModel
 * @returns {Promise<void>}
 */
// tslint:disable-next-line:max-func-body-length
function processFixSeatsAndTickets(reservationModel, req) {
    return __awaiter(this, void 0, void 0, function* () {
        // 検証(券種が選択されていること)+チケット枚数合計計算
        const checkInfo = yield checkFixSeatsAndTickets(req);
        if (checkInfo.status === false) {
            throw new Error(checkInfo.message);
        }
        const selectedCount = checkInfo.selectedCount;
        const choices = checkInfo.choicesAll;
        // 予約可能件数チェック+予約情報取得
        const infos = yield getInfoFixSeatsAndTickets(reservationModel, req, selectedCount);
        if (infos.status === false) {
            throw new Error(infos.message);
        }
        // チケット情報に枚数セット
        reservationModel.ticketTypes.forEach((ticketType) => {
            const choice = checkInfo.choices.find((c) => (ticketType._id === c.ticket_type));
            ticketType.count = (choice !== undefined) ? Number(choice.ticket_count) : 0;
        });
        // セッション中の予約リストを初期化
        reservationModel.seatCodes = [];
        reservationModel.expiredAt = moment().add(conf.get('temporary_reservation_valid_period_seconds'), 'seconds').valueOf();
        // 予約情報更新(「仮予約:TEMPORARY」にアップデートする処理を枚数分実行)
        let updateCount = 0;
        const promises = choices.map((choice) => __awaiter(this, void 0, void 0, function* () {
            // 予約情報更新キーセット(パフォーマンス,'予約可能')
            const updateKey = {
                performance: reservationModel.performance._id,
                status: ttts_domain_1.ReservationUtil.STATUS_AVAILABLE
            };
            // '予約可能'を'仮予約'に変更
            const reservation = yield ttts_domain_1.Models.Reservation.findOneAndUpdate(updateKey, {
                status: ttts_domain_1.ReservationUtil.STATUS_TEMPORARY,
                // 2017/05/23 chevreの"TEMPORARY"データに項目を合わせるため削除
                //payment_no: reservationModel.paymentNo,
                //ticket_type: (<any>choice).ticket_type,
                //---
                expired_at: reservationModel.expiredAt
            }, {
                new: true
            }).exec();
            // 更新エラー(対象データなし):次のseatへ
            if (reservation === null) {
                debug('update error');
            }
            else {
                updateCount = updateCount + 1;
                // チケット情報+座席情報をセッションにsave
                saveSessionFixSeatsAndTickets(req, reservationModel, reservation, choice);
            }
        }));
        yield Promise.all(promises);
        // 予約枚数が指定枚数に達しなかった時,予約可能に戻す
        if (updateCount < selectedCount) {
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
 * @param {Request} req
 * @returns {Promise<void>}
 */
function checkFixSeatsAndTickets(req) {
    return __awaiter(this, void 0, void 0, function* () {
        const checkInfo = {
            status: false,
            choices: null,
            choicesAll: [],
            selectedCount: 0,
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
        // チケット枚数合計計算
        choices.forEach((choice) => {
            checkInfo.selectedCount += Number(choice.ticket_count);
            for (let index = 0; index < Number(choice.ticket_count); index = index + 1) {
                const choiceOne = {
                    ticket_type: choice.ticket_type,
                    ticketCount: 1,
                    updated: false
                };
                checkInfo.choicesAll.push(choiceOne);
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
 * 座席・券種FIXプロセス/予約情報をセッションにsave
 *
 * @param {ReservationModel} reservationModel
 * @param {Request} req
 * @param {any} result
 * @returns {Promise<void>}
 */
function saveSessionFixSeatsAndTickets(req, reservationModel, result, choice) {
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
    reservationModel.seatCodes.push(result.seat_code);
    reservationModel.setReservation(result.seat_code, {
        _id: result._id,
        status: result.status,
        seat_code: result.seat_code,
        seat_grade_name: seatInfo.grade.name,
        seat_grade_additional_charge: seatInfo.grade.additional_charge,
        ticket_type: ticketType._id,
        ticket_type_name: ticketType.name,
        ticket_type_charge: ticketType.charge,
        watcher_name: ''
    });
    // 座席コードのソート(文字列順に)
    reservationModel.seatCodes.sort(ttts_domain_1.ScreenUtil.sortBySeatCode);
    return;
}
/**
 * 券種FIXプロセス
 *
 * @param {ReservationModel} reservationModel
 * @returns {Promise<void>}
 */
function processFixTickets(reservationModel, req) {
    return __awaiter(this, void 0, void 0, function* () {
        reserveTicketForm_1.default(req);
        const validationResult = yield req.getValidationResult();
        if (!validationResult.isEmpty()) {
            throw new Error(req.__('Message.Invalid'));
        }
        // 座席選択情報を保存して座席選択へ
        const choices = JSON.parse(req.body.choices);
        if (!Array.isArray(choices)) {
            throw new Error(req.__('Message.UnexpectedError'));
        }
        choices.forEach((choice) => {
            const ticketType = reservationModel.ticketTypes.find((ticketTypeInArray) => (ticketTypeInArray._id === choice.ticket_type));
            if (ticketType === undefined) {
                throw new Error(req.__('Message.UnexpectedError'));
            }
            const reservation = reservationModel.getReservation(choice.seat_code);
            reservation.ticket_type = ticketType._id;
            reservation.ticket_type_name = ticketType.name;
            reservation.ticket_type_charge = ticketType.charge;
            reservation.watcher_name = choice.watcher_name;
            reservationModel.setReservation(reservation.seat_code, reservation);
        });
    });
}
exports.processFixTickets = processFixTickets;
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
        res.locals.lastName = req.body.lastName;
        res.locals.firstName = req.body.firstName;
        res.locals.email = req.body.email;
        res.locals.emailConfirm = req.body.emailConfirm;
        res.locals.emailConfirmDomain = req.body.emailConfirmDomain;
        res.locals.tel = req.body.tel;
        res.locals.age = req.body.age;
        res.locals.address = req.body.address;
        res.locals.gender = req.body.gender;
        //res.locals.paymentMethod = req.body.paymentMethod;
        if (!validationResult.isEmpty()) {
            throw new Error(req.__('Message.Invalid'));
        }
        // 購入者情報を保存して座席選択へ
        reservationModel.purchaser = {
            lastName: req.body.lastName,
            firstName: req.body.firstName,
            tel: req.body.tel,
            email: req.body.email,
            age: req.body.age,
            address: req.body.address,
            gender: req.body.gender
        };
        //reservationModel.paymentMethod = req.body.paymentMethod;
        // 主体によっては、決済方法を強制的に固定で
        switch (reservationModel.purchaserGroup) {
            case ttts_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
                reservationModel.paymentMethod = '';
                break;
            default:
                break;
        }
        // セッションに購入者情報格納
        req.session.purchaser = {
            lastName: req.body.lastName,
            firstName: req.body.firstName,
            tel: req.body.tel,
            email: req.body.email,
            age: req.body.age,
            address: req.body.address,
            gender: req.body.gender
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
            reservationModel.paymentMethodChoices = [GMO.Util.PAY_TYPE_CREDIT, GMO.Util.PAY_TYPE_CASH];
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
        if (ids.length > 0) {
            // セッション中の予約リストを初期化
            reservationModel.seatCodes = [];
            // // 仮予約を空席ステータスに戻す
            // try {
            //     await Models.Reservation.remove({ _id: { $in: ids } }).exec();
            // } catch (error) {
            //     // 失敗したとしても時間経過で消えるので放置
            // }
            // 仮予約を空席ステータスに戻す
            // 2017/05 予約レコード削除からSTATUS初期化へ変更
            const promises = ids.map((id) => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield ttts_domain_1.Models.Reservation.findByIdAndUpdate({ _id: id }, {
                        status: ttts_domain_1.ReservationUtil.STATUS_AVAILABLE,
                        payment_no: null,
                        ticket_type: null,
                        expired_at: null
                    }, {
                        new: true
                    }).exec();
                }
                catch (error) {
                    //失敗したとしても時間経過で消えるので放置
                }
            }));
            yield Promise.all(promises);
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
                //＠＠＠＠＠
                //reservationModel.ticketTypes = TicketTypeGroupUtil.getOne4staff();
                const staffTickets = ttts_domain_1.TicketTypeGroupUtil.getOne4staff();
                // tslint:disable-next-line:no-empty
                if (staffTickets) {
                }
                //const staffTickets = TicketTypeGroupUtil.getOne4staff();
                if (ticketTypeGroup) {
                    reservationModel.ticketTypes = ticketTypeGroup.get('ticket_types');
                }
                break;
            default:
                // 一般、当日窓口の場合
                // 2017/06/19 upsate node+typesctipt
                //reservationModel.ticketTypes = ticketTypeGroup.get('ticket_types');
                if (ticketTypeGroup) {
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
        const day5DaysAgo = parseInt(moment().add(+5, 'days').format('YYYYMMDD'), DEFAULT_RADIX);
        if (parseInt(reservationModel.performance.day, DEFAULT_RADIX) < day5DaysAgo) {
            if (reservationModel.paymentMethodChoices.indexOf(GMO.Util.PAY_TYPE_CVS) >= 0) {
                reservationModel.paymentMethodChoices.splice(reservationModel.paymentMethodChoices.indexOf(GMO.Util.PAY_TYPE_CVS), 1);
            }
        }
        // 2017/06/22
        // // スクリーン座席表HTMLを保管
        // reservationModel.screenHtml = fs.readFileSync(
        //     `${__dirname}/../views/_screens/${performance.get('screen').get('_id').toString()}.ejs`,
        //     'utf8'
        // );
        reservationModel.screenHtml = '';
        //---
        // この時点でトークンに対して購入番号発行(上映日が決まれば購入番号を発行できる)
        reservationModel.paymentNo = yield ttts_domain_1.ReservationUtil.publishPaymentNo(reservationModel.performance.day);
    });
}
exports.processFixPerformance = processFixPerformance;
/**
 * 座席をFIXするプロセス
 * 新規仮予約 ここが今回の肝です！！！
 *
 * @param {ReservationModel} reservationModel
 * @param {Array<string>} seatCodes
 */
function processFixSeats(reservationModel, seatCodes, req) {
    return __awaiter(this, void 0, void 0, function* () {
        // セッション中の予約リストを初期化
        reservationModel.seatCodes = [];
        reservationModel.expiredAt = moment().add(conf.get('temporary_reservation_valid_period_seconds'), 'seconds').valueOf();
        // 新たな座席指定と、既に仮予約済みの座席コードについて
        const promises = seatCodes.map((seatCode) => __awaiter(this, void 0, void 0, function* () {
            const seatInfo = reservationModel.performance.screen.sections[0].seats.find((seat) => (seat.code === seatCode));
            // 万が一、座席が存在しなかったら
            if (seatInfo === undefined) {
                throw new Error(req.__('Message.InvalidSeatCode'));
            }
            const newReservation = {
                performance: reservationModel.performance._id,
                seat_code: seatCode,
                status: ttts_domain_1.ReservationUtil.STATUS_TEMPORARY,
                expired_at: reservationModel.expiredAt,
                owner: undefined
            };
            switch (reservationModel.purchaserGroup) {
                case ttts_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
                    newReservation.owner = req.staffUser.get('_id');
                    break;
                case ttts_domain_1.ReservationUtil.PURCHASER_GROUP_WINDOW:
                    newReservation.owner = req.windowUser.get('_id');
                    break;
                default:
                    break;
            }
            // 予約データを作成(同時作成しようとしたり、既に予約があったとしても、unique indexではじかれる)
            const reservation = yield ttts_domain_1.Models.Reservation.create(newReservation);
            // ステータス更新に成功したらセッションに保管
            reservationModel.seatCodes.push(seatCode);
            reservationModel.setReservation(seatCode, {
                _id: reservation.get('_id'),
                status: reservation.get('status'),
                seat_code: reservation.get('seat_code'),
                seat_grade_name: seatInfo.grade.name,
                seat_grade_additional_charge: seatInfo.grade.additional_charge,
                ticket_type: '',
                ticket_type_name: {
                    ja: '',
                    en: ''
                },
                ticket_type_charge: 0,
                watcher_name: ''
            });
        }));
        yield Promise.all(promises);
        // 座席コードのソート(文字列順に)
        reservationModel.seatCodes.sort(ttts_domain_1.ScreenUtil.sortBySeatCode);
    });
}
exports.processFixSeats = processFixSeats;
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
        // いったん全情報をDBに保存
        yield Promise.all(reservationModel.seatCodes.map((seatCode, index) => __awaiter(this, void 0, void 0, function* () {
            let update = reservationModel.seatCode2reservationDocument(seatCode);
            update = Object.assign(update, commonUpdate);
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
function processFixReservations(performanceDay, paymentNo, update, res) {
    return __awaiter(this, void 0, void 0, function* () {
        update.purchased_at = moment().valueOf();
        update.status = ttts_domain_1.ReservationUtil.STATUS_RESERVED;
        // 予約完了ステータスへ変更
        yield ttts_domain_1.Models.Reservation.update({
            performance_day: performanceDay,
            payment_no: paymentNo
        }, update, { multi: true } // 必須！複数予約ドキュメントを一度に更新するため
        ).exec();
        try {
            // 完了メールキュー追加(あれば更新日時を更新するだけ)
            const emailQueue = yield createEmailQueue(res, performanceDay, paymentNo);
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
function createEmailQueue(res, performanceDay, paymentNo) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservations = yield ttts_domain_1.Models.Reservation.find({
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
        const titleJa = 'TTTS_EVENT_NAMEチケット 購入完了のお知らせ';
        const titleEn = 'Notice of Completion of TTTS Ticket Purchase';
        debug('rendering template...');
        return new Promise((resolve, reject) => {
            res.render('email/reserve/complete', {
                layout: false,
                titleJa: titleJa,
                titleEn: titleEn,
                reservations: reservations,
                moment: moment,
                numeral: numeral,
                conf: conf,
                GMOUtil: GMO.Util,
                ReservationUtil: ttts_domain_1.ReservationUtil
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
                    subject: `${titleJa} ${titleEn}`,
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
