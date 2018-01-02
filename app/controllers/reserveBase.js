"use strict";
/**
 * 座席予約ベースコントローラー
 *
 * @namepace controller/reserveBase
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
// 車椅子レート制限のためのRedis接続クライアント
const redisClient = ttts.redis.createClient({
    host: process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_KEY,
    tls: { servername: process.env.REDIS_HOST }
});
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
            const choice = checkInfo.choices.find((c) => (ticketType.id === c.ticket_type));
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
        const action = yield ttts.service.transaction.placeOrderInProgress.action.authorize.seatReservation.create(reservationModel.agentId, reservationModel.id, reservationModel.performance.id, offers)(new ttts.repository.Transaction(ttts.mongoose.connection), new ttts.repository.Performance(ttts.mongoose.connection), new ttts.repository.action.authorize.SeatReservation(ttts.mongoose.connection), new ttts.repository.PaymentNo(redisClient), new ttts.repository.rateLimit.TicketTypeCategory(redisClient));
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
        // reservationModel.seatCodes.sort(ttts.factory.place.screen.sortBySeatCode);
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
            checkInfo.message = req.__('Invalid"');
            return checkInfo;
        }
        // 画面から座席選択情報が生成できなければエラー
        const choices = JSON.parse(req.body.choices);
        if (!Array.isArray(choices)) {
            checkInfo.message = req.__('UnexpectedError');
            return checkInfo;
        }
        checkInfo.choices = choices;
        // 特殊チケット情報
        const extraSeatNum = {};
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
            info.message = req.__('NoAvailableSeats');
            return info;
        }
        // 予約情報取得
        const stocks = yield stockRepo.stockModel.find(conditions).exec();
        info.results = stocks.map((stock) => {
            return {
                id: stock.id,
                performance: stock.performance,
                seat_code: stock.seat_code,
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
            throw new Error(req.__('Invalid"'));
        }
        // 購入情報を保存
        reservationModel.paymentMethod = req.body.paymentMethod;
        yield ttts.service.transaction.placeOrderInProgress.setCustomerContact(reservationModel.agentId, reservationModel.id, {
            last_name: reservationModel.purchaser.lastName,
            first_name: reservationModel.purchaser.firstName,
            tel: reservationModel.purchaser.tel,
            email: reservationModel.purchaser.email,
            age: reservationModel.purchaser.age,
            address: reservationModel.purchaser.address,
            gender: reservationModel.purchaser.gender
        })(new ttts.repository.Transaction(ttts.mongoose.connection));
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
        reservationModel.expires = moment().add(conf.get('temporary_reservation_valid_period_seconds'), 'seconds').toDate();
        const transaction = yield ttts.service.transaction.placeOrderInProgress.start({
            expires: reservationModel.expires,
            agentId: req.staffUser.get('_id'),
            sellerIdentifier: 'TokyoTower',
            purchaserGroup: purchaserGroup
        })(new ttts.repository.Transaction(ttts.mongoose.connection), new ttts.repository.Organization(ttts.mongoose.connection), new ttts.repository.Owner(ttts.mongoose.connection));
        debug('transaction started.', transaction.id);
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
    reservationModel.purchaser = {
        lastName: 'ナイブ',
        firstName: 'カンケイシャ',
        tel: '0334335111',
        email: req.staffUser.get('email'),
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
function processCancelSeats(reservationModel) {
    return __awaiter(this, void 0, void 0, function* () {
        // セッション中の予約リストを初期化
        reservationModel.seatCodes = [];
        // 座席仮予約があればキャンセル
        if (reservationModel.seatReservationAuthorizeActionId !== undefined) {
            yield ttts.service.transaction.placeOrderInProgress.action.authorize.seatReservation.cancel(reservationModel.agentId, reservationModel.id, reservationModel.seatReservationAuthorizeActionId)(new ttts.repository.Transaction(ttts.mongoose.connection), new ttts.repository.action.authorize.SeatReservation(ttts.mongoose.connection), new ttts.repository.rateLimit.TicketTypeCategory(redisClient));
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
        // 券種取得
        reservationModel.ticketTypes = performance.ticket_type_group.ticket_types.map((t) => {
            return Object.assign({}, t, { count: 0, watcher_name: '' });
        });
        reservationModel.seatCodes = [];
        // パフォーマンス情報を保管
        reservationModel.performance = Object.assign({}, performance, {
            film: Object.assign({}, performance.film, {
                image: `${req.protocol}://${req.hostname}/images/film/${performance.film.id}.jpg`
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
 * 予約完了メールを作成する
 * @memberof ReserveBaseController
 */
function createEmailAttributes(reservations, totalCharge, res) {
    return __awaiter(this, void 0, void 0, function* () {
        // 特殊チケットは除外
        reservations = reservations.filter((reservation) => reservation.status === ttts.factory.reservationStatusType.ReservationConfirmed);
        const to = reservations[0].owner_email;
        debug('to is', to);
        if (to.length === 0) {
            throw new Error('email to unknown');
        }
        const title = res.__('Title');
        const titleEmail = res.__('EmailTitle');
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
        const ticketInfoArray = [];
        Object.keys(ticketInfos).forEach((key) => {
            const ticketInfo = ticketInfos[key];
            ticketInfoArray.push(`${ticketInfo.ticket_type_name[res.locale]} ${res.__('{{n}}Leaf', { n: ticketInfo.count })}`);
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
                ticketInfoArray: ticketInfoArray,
                totalCharge: totalCharge,
                dayTime: `${day} ${time}`
            }, (renderErr, text) => __awaiter(this, void 0, void 0, function* () {
                debug('email template rendered.', renderErr);
                if (renderErr instanceof Error) {
                    reject(new Error('failed in rendering an email.'));
                    return;
                }
                resolve({
                    sender: {
                        name: conf.get('email.fromname'),
                        email: conf.get('email.from')
                    },
                    toRecipient: {
                        // tslint:disable-next-line:max-line-length
                        name: reservations[0].purchaser_name,
                        email: to
                    },
                    about: `${title} ${titleEmail}`,
                    text: text
                });
            }));
        });
    });
}
exports.createEmailAttributes = createEmailAttributes;
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
