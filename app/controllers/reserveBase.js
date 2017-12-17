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
const ttts = require("@motionpicture/ttts-domain");
const conf = require("config");
const createDebug = require("debug");
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
        console.log(`reservationModel.performance=${reservationModel.performance.id}`);
        // チケット情報に枚数セット(画面で選択された枚数<画面再表示用)
        reservationModel.ticketTypes.forEach((ticketType) => {
            const choice = checkInfo.choices.find((c) => (ticketType._id === c.ticket_type));
            ticketType.count = (choice !== undefined) ? Number(choice.ticket_count) : 0;
        });
        // セッション中の予約リストを初期化
        reservationModel.seatCodes = [];
        reservationModel.seatCodesExtra = [];
        reservationModel.expiredAt = moment().add(conf.get('temporary_reservation_valid_period_seconds'), 'seconds').valueOf();
        // 座席承認アクション
        const offers = checkInfo.choicesAll.map((choice) => {
            // チケット情報
            // tslint:disable-next-line:max-line-length
            const ticketType = reservationModel.ticketTypes.find((ticketTypeInArray) => (ticketTypeInArray._id === choice.ticket_type));
            if (ticketType === undefined) {
                throw new Error(req.__('Message.UnexpectedError'));
            }
            return {
                extra: choice.choicesExtra,
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
        const action = yield ttts.service.transaction.placeOrderInProgress.action.authorize.seatReservation.create(reservationModel.agentId, reservationModel.id, reservationModel.performance.id, offers);
        reservationModel.seatReservationAuthorizeActionId = action.id;
        // この時点で購入番号が発行される
        reservationModel.paymentNo = action.result.tmpReservations[0].payment_no;
        const tmpReservations = action.result.tmpReservations;
        // セッションに保管
        reservationModel.seatCodes = tmpReservations.filter((r) => r.status_after === ttts.factory.reservationStatusType.ReservationConfirmed)
            .map((r) => r.seat_code);
        reservationModel.seatCodesExtra = tmpReservations.filter((r) => r.status_after !== ttts.factory.reservationStatusType.ReservationConfirmed).map((r) => r.seat_code);
        tmpReservations.forEach((tmpReservation) => {
            reservationModel.setReservation(tmpReservation.seat_code, tmpReservation);
        });
        // 座席コードのソート(文字列順に)
        reservationModel.seatCodes.sort(ttts.factory.place.screen.sortBySeatCode);
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
            choices: [],
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
            if (ticketTypeInArray.ttts_extension.category !== ttts.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL) {
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
                    watcher_name: (typeof choice.watcher_name === 'string') ? choice.watcher_name : '',
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
        const stockRepo = new ttts.repository.Stock(ttts.mongoose.connection);
        const info = {
            status: false,
            results: null,
            message: ''
        };
        // 予約可能件数取得
        const conditions = {
            performance: reservationModel.performance.id,
            availability: ttts.factory.itemAvailability.InStock
        };
        const count = yield stockRepo.stockModel.count(conditions).exec();
        // チケット枚数より少ない場合は、購入不可としてリターン
        if (count < selectedCount) {
            // "予約可能な席がございません"
            info.message = req.__('Message.NoAvailableSeats');
            return info;
        }
        // 予約情報取得
        const stocks = yield stockRepo.stockModel.find(conditions).exec();
        info.results = stocks.map((stock) => {
            return {
                _id: stock._id,
                performance: stock.performance,
                seat_code: stock.seat_code,
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
        // tslint:disable-next-line:no-suspicious-comment
        // TODO factoryに決済方法を定義
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
        req.session.locale = (!_.isEmpty(req.query.locale)) ? req.query.locale : 'ja';
        // 予約トークンを発行
        const reservationModel = new session_1.default();
        reservationModel.purchaserGroup = purchaserGroup;
        initializePayment(reservationModel, req);
        if (!_.isEmpty(req.query.performance)) {
            // パフォーマンス指定遷移の場合 パフォーマンスFIX
            yield processFixPerformance(reservationModel, req.query.performance, req);
        }
        const transaction = yield ttts.service.transaction.placeOrderInProgress.start({
            // tslint:disable-next-line:no-magic-numbers
            expires: moment().add(30, 'minutes').toDate(),
            agentId: req.staffUser.get('_id'),
            sellerId: 'TokyoTower',
            purchaserGroup: purchaserGroup
        });
        debug('transaction started.', transaction);
        reservationModel.id = transaction.id;
        reservationModel.agentId = transaction.agent.id;
        reservationModel.sellerId = transaction.seller.id;
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
function processCancelSeats(reservationModel) {
    return __awaiter(this, void 0, void 0, function* () {
        // セッション中の予約リストを初期化
        reservationModel.seatCodes = [];
        // 座席仮予約があればキャンセル
        if (reservationModel.seatReservationAuthorizeActionId !== undefined) {
            yield ttts.service.transaction.placeOrderInProgress.action.authorize.seatReservation.cancel(reservationModel.agentId, reservationModel.id, reservationModel.seatReservationAuthorizeActionId);
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
        debug('fixing performance...', perfomanceId);
        // パフォーマンス取得
        const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
        const performance = yield performanceRepo.findById(perfomanceId);
        if (performance.canceled) {
            throw new Error(req.__('Message.OutOfTerm'));
        }
        // 内部と当日以外は、上映日当日まで購入可能
        if (reservationModel.purchaserGroup !== ttts.ReservationUtil.PURCHASER_GROUP_STAFF) {
            if (parseInt(performance.day, DEFAULT_RADIX) < parseInt(moment().format('YYYYMMDD'), DEFAULT_RADIX)) {
                throw new Error('You cannot reserve this performance.');
            }
        }
        // 券種取得
        const ticketTypeGroup = yield ttts.Models.TicketTypeGroup.findById(performance.ticket_type_group).populate('ticket_types').exec();
        reservationModel.seatCodes = [];
        // 券種リストは、予約する主体によって異なる
        // 内部関係者の場合
        switch (reservationModel.purchaserGroup) {
            case ttts.ReservationUtil.PURCHASER_GROUP_STAFF:
                if (ticketTypeGroup !== null) {
                    reservationModel.ticketTypes = ticketTypeGroup.get('ticket_types');
                }
                break;
            default:
                // 一般、当日窓口の場合
                if (ticketTypeGroup !== null) {
                    reservationModel.ticketTypes = ticketTypeGroup.get('ticket_types');
                }
                break;
        }
        // パフォーマンス情報を保管
        reservationModel.performance = Object.assign({}, performance, {
            film: Object.assign({}, performance.film, {
                image: `${req.protocol}://${req.hostname}/images/film/${performance.film._id}.jpg`
            })
        });
        // 座席グレードリスト抽出
        reservationModel.seatGradeCodesInScreen = reservationModel.performance.screen.sections[0].seats
            .map((seat) => seat.grade.code)
            .filter((seatCode, index, seatCodes) => seatCodes.indexOf(seatCode) === index);
        // スクリーン座席表HTMLを保管(TTTS未使用)
        reservationModel.screenHtml = '';
    });
}
exports.processFixPerformance = processFixPerformance;
/**
 * 購入番号から全ての予約を完了にする
 *
 * @param {string} paymentNo 購入番号
 * @param {Object} update 追加更新パラメータ
 */
function processFixReservations(reservationModel, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const transaction = yield ttts.service.transaction.placeOrderInProgress.confirm({
            agentId: reservationModel.agentId,
            transactionId: reservationModel.id,
            paymentMethod: reservationModel.paymentMethod
        });
        debug('transaction confirmed.', transaction);
        try {
            const result = transaction.result;
            // 完了メールキュー追加(あれば更新日時を更新するだけ)
            const emailQueue = yield createEmailQueue(result.eventReservations, reservationModel, res);
            yield ttts.Models.EmailQueue.create(emailQueue);
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
 * @memberof ReserveBaseController
 */
// tslint:disable-next-line:max-func-body-length
function createEmailQueue(reservations, reservationModel, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        // 特殊チケットは除外
        reservations = reservations.filter((reservation) => reservation.status === ttts.factory.reservationStatusType.ReservationConfirmed);
        const reservationDocs = reservations.map((reservation) => new reservationRepo.reservationModel(reservation));
        let to = '';
        switch (reservations[0].purchaser_group) {
            case ttts.ReservationUtil.PURCHASER_GROUP_STAFF:
                to = reservations[0].owner_email;
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
        const ticketInfos = {};
        for (const reservation of reservations) {
            // チケットタイプセット
            const dataValue = reservation.ticket_type;
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
                reservations: reservationDocs,
                moment: moment,
                numeral: numeral,
                conf: conf,
                GMOUtil: ttts.GMO.utils.util,
                ReservationUtil: ttts.ReservationUtil,
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
                    status: ttts.EmailQueueUtil.STATUS_UNSENT
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
 * @param {ReserveSessionModel} reservationModel
 * @returns {any[]}
 */
function getReservations(reservationModel) {
    return reservationModel.seatCodes.map((seatCode) => reservationModel.seatCode2reservationDocument(seatCode));
}
exports.getReservations = getReservations;
