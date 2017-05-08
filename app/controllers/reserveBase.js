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
const chevre_domain_1 = require("@motionpicture/chevre-domain");
const GMO = require("@motionpicture/gmo-service");
const conf = require("config");
const createDebug = require("debug");
const fs = require("fs-extra");
const moment = require("moment");
const numeral = require("numeral");
const _ = require("underscore");
const reserveProfileForm_1 = require("../forms/reserve/reserveProfileForm");
const reserveTicketForm_1 = require("../forms/reserve/reserveTicketForm");
const session_1 = require("../models/reserve/session");
const debug = createDebug('chevre-frontend:controller:reserveBase');
const DEFAULT_RADIX = 10;
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
        res.locals.paymentMethod = req.body.paymentMethod;
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
        reservationModel.paymentMethod = req.body.paymentMethod;
        // 主体によっては、決済方法を強制的に固定で
        switch (reservationModel.purchaserGroup) {
            case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
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
    const purchaserFromSession = req.session.purchaser;
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
        case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_CUSTOMER:
            if (purchaserFromSession !== undefined) {
                reservationModel.purchaser = purchaserFromSession;
            }
            reservationModel.paymentMethodChoices = [GMO.Util.PAY_TYPE_CREDIT, GMO.Util.PAY_TYPE_CVS];
            break;
        case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
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
        case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_WINDOW:
            reservationModel.purchaser = {
                lastName: 'マドグチ',
                firstName: 'タントウシャ',
                tel: '0362263025',
                email: 'chevre@localhost.net',
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
            // 仮予約を空席ステータスに戻す
            try {
                yield chevre_domain_1.Models.Reservation.remove({ _id: { $in: ids } }).exec();
            }
            catch (error) {
                // 失敗したとしても時間経過で消えるので放置
            }
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
        const performance = yield chevre_domain_1.Models.Performance.findById(perfomanceId, 'day open_time start_time end_time canceled film screen screen_name theater theater_name ticket_type_group' // 必要な項目だけ指定すること
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
        if (reservationModel.purchaserGroup !== chevre_domain_1.ReservationUtil.PURCHASER_GROUP_WINDOW &&
            reservationModel.purchaserGroup !== chevre_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF) {
            if (parseInt(performance.get('day'), DEFAULT_RADIX) < parseInt(moment().format('YYYYMMDD'), DEFAULT_RADIX)) {
                throw new Error('You cannot reserve this performance.');
            }
        }
        // 券種取得
        const ticketTypeGroup = yield chevre_domain_1.Models.TicketTypeGroup.findOne({ _id: performance.get('ticket_type_group') }).populate('ticket_types').exec();
        reservationModel.seatCodes = [];
        // 券種リストは、予約する主体によって異なる
        // 内部関係者の場合
        switch (reservationModel.purchaserGroup) {
            case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
                reservationModel.ticketTypes = chevre_domain_1.TicketTypeGroupUtil.getOne4staff();
                break;
            default:
                // 一般、当日窓口の場合
                reservationModel.ticketTypes = ticketTypeGroup.get('ticket_types');
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
        // スクリーン座席表HTMLを保管
        reservationModel.screenHtml = fs.readFileSync(`${__dirname}/../views/_screens/${performance.get('screen').get('_id').toString()}.ejs`, 'utf8');
        // この時点でトークンに対して購入番号発行(上映日が決まれば購入番号を発行できる)
        reservationModel.paymentNo = yield chevre_domain_1.ReservationUtil.publishPaymentNo(reservationModel.performance.day);
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
                status: chevre_domain_1.ReservationUtil.STATUS_TEMPORARY,
                expired_at: reservationModel.expiredAt,
                staff: undefined,
                window: undefined
            };
            switch (reservationModel.purchaserGroup) {
                case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
                    newReservation.staff = req.staffUser.get('_id');
                    break;
                case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_WINDOW:
                    newReservation.window = req.windowUser.get('_id');
                    break;
                default:
                    break;
            }
            // 予約データを作成(同時作成しようとしたり、既に予約があったとしても、unique indexではじかれる)
            const reservation = yield chevre_domain_1.Models.Reservation.create(newReservation);
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
        reservationModel.seatCodes.sort(chevre_domain_1.ScreenUtil.sortBySeatCode);
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
            case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_CUSTOMER:
                // クレジット決済
                if (reservationModel.paymentMethod === GMO.Util.PAY_TYPE_CREDIT) {
                    commonUpdate.gmo_shop_id = process.env.GMO_SHOP_ID;
                    commonUpdate.gmo_shop_pass = process.env.GMO_SHOP_PASS;
                    commonUpdate.gmo_order_id = reservationModel.transactionGMO.orderId;
                    commonUpdate.gmo_amount = reservationModel.transactionGMO.amount;
                    commonUpdate.gmo_access_id = reservationModel.transactionGMO.accessId;
                    commonUpdate.gmo_access_pass = reservationModel.transactionGMO.accessPass;
                    commonUpdate.gmo_status = GMO.Util.STATUS_CREDIT_AUTH;
                }
                else if (reservationModel.paymentMethod === GMO.Util.PAY_TYPE_CVS) {
                    // オーダーID保管
                    commonUpdate.gmo_order_id = reservationModel.transactionGMO.orderId;
                }
                break;
            case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
                commonUpdate.staff = req.staffUser.get('_id');
                commonUpdate.staff_user_id = req.staffUser.get('user_id');
                commonUpdate.staff_name = req.staffUser.get('name');
                commonUpdate.staff_email = req.staffUser.get('email');
                commonUpdate.staff_signature = req.staffUser.get('signature');
                commonUpdate.purchaser_last_name = '';
                commonUpdate.purchaser_first_name = '';
                commonUpdate.purchaser_email = '';
                commonUpdate.purchaser_tel = '';
                commonUpdate.purchaser_age = '';
                commonUpdate.purchaser_address = '';
                commonUpdate.purchaser_gender = '';
                break;
            case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_WINDOW:
                commonUpdate.window = req.windowUser.get('_id');
                commonUpdate.window_user_id = req.windowUser.get('user_id');
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
            const reservation = yield chevre_domain_1.Models.Reservation.findByIdAndUpdate(update._id, update, { new: true }).exec();
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
        update.status = chevre_domain_1.ReservationUtil.STATUS_RESERVED;
        // 予約完了ステータスへ変更
        yield chevre_domain_1.Models.Reservation.update({
            performance_day: performanceDay,
            payment_no: paymentNo
        }, update, { multi: true } // 必須！複数予約ドキュメントを一度に更新するため
        ).exec();
        try {
            // 完了メールキュー追加(あれば更新日時を更新するだけ)
            const emailQueue = yield createEmailQueue(res, performanceDay, paymentNo);
            yield chevre_domain_1.Models.EmailQueue.create(emailQueue);
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
        const reservations = yield chevre_domain_1.Models.Reservation.find({
            performance_day: performanceDay,
            payment_no: paymentNo
        }).exec();
        debug('reservations for email found.', reservations.length);
        if (reservations.length === 0) {
            throw new Error(`reservations of payment_no ${paymentNo} not found`);
        }
        let to = '';
        switch (reservations[0].get('purchaser_group')) {
            case chevre_domain_1.ReservationUtil.PURCHASER_GROUP_STAFF:
                to = reservations[0].get('staff_email');
                break;
            default:
                to = reservations[0].get('purchaser_email');
                break;
        }
        debug('to is', to);
        if (to.length === 0) {
            throw new Error('email to unknown');
        }
        const titleJa = 'CHEVRE_EVENT_NAMEチケット 購入完了のお知らせ';
        const titleEn = 'Notice of Completion of CHEVRE Ticket Purchase';
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
                ReservationUtil: chevre_domain_1.ReservationUtil
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
                    status: chevre_domain_1.EmailQueueUtil.STATUS_UNSENT
                };
                resolve(emailQueue);
            }));
        });
    });
}
