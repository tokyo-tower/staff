"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 運行・オンライン販売停止設定コントローラー
 *
 * @namespace controller/staff/suspensionSetting
 */
const ttts = require("@motionpicture/ttts-domain");
const conf = require("config");
const moment = require("moment");
const suspensionCommon = require("./suspensionCommon");
const SETTING_PATH = '/staff/suspension/setting';
const VIEW_PATH = 'staff/suspension';
const layout = 'layouts/staff/layout';
/**
 * 開始
 */
function start(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        // 期限指定
        if (moment() < moment(conf.get('datetimes.reservation_start_staffs'))) {
            next(new Error(req.__('Message.OutOfTerm')));
            return;
        }
        try {
            res.redirect(`${SETTING_PATH}/performances`);
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.start = start;
/**
 * スケジュール選択
 * @method performances
 * @returns {Promise<void>}
 */
function performances(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // token取得
            const token = yield ttts.CommonUtil.getToken(process.env.API_ENDPOINT);
            if (req.method !== 'POST') {
                // 運行・オンライン販売停止設定画面表示
                res.render(`${VIEW_PATH}/performances`, {
                    token: token,
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.performances = performances;
/**
 * 運行・オンライン販売停止設定実行api
 *
 */
function execute(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('Message.UnexpectedError')));
            return;
        }
        try {
            // パフォーマンスIDリストをjson形式で受け取る
            const performanceIds = JSON.parse(req.body.performanceIds);
            if (!Array.isArray(performanceIds)) {
                throw new Error(req.__('Message.UnexpectedError'));
            }
            // const executeType: string = req.body.executeType;
            const onlineStatus = req.body.onlineStatus;
            const evStatus = req.body.evStatus;
            const notice = req.body.notice;
            const info = yield updateStatusByIds(req.staffUser.username, performanceIds, onlineStatus, evStatus);
            // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
            if (evStatus === ttts.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED) {
                // メール送信情報 [{'20171201_12345': [r1,r2,,,rn]}]
                yield createEmails(res, info.targrtInfo, notice);
            }
            res.json({
                success: true,
                message: null
            });
        }
        catch (error) {
            res.json({
                success: false,
                message: error.message
            });
        }
    });
}
exports.execute = execute;
/**
 * 運行・オンライン販売停止設定処理(idから)
 *
 * @param {string} staffUser
 * @param {string[]} performanceIds
 * @param {string} onlineStatus
 * @param {string} evStatus
 * @return {Promise<boolean>}
 */
function updateStatusByIds(staffUser, performanceIds, onlineStatus, evStatus) {
    return __awaiter(this, void 0, void 0, function* () {
        // パフォーマンスIDをObjectIdに変換
        const ids = performanceIds.map((id) => {
            return new ttts.mongoose.Types.ObjectId(id);
        });
        const now = moment().format('YYYY/MM/DD HH:mm:ss');
        let info = {};
        // オンライン販売停止の時、予約更新
        if (onlineStatus === ttts.PerformanceUtil.ONLINE_SALES_STATUS.SUSPENDED) {
            // 返金対象予約情報取得(入塔記録のないもの)
            info = yield suspensionCommon.getTargetReservationsForRefund(performanceIds, ttts.PerformanceUtil.REFUND_STATUS.NONE, evStatus === ttts.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED);
            // 予約情報返金ステータスを未指示に更新
            if (info.targrtIds.length > 0) {
                const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
                yield reservationRepo.reservationModel.update({
                    _id: { $in: info.targrtIds }
                }, {
                    $set: {
                        'performance_ttts_extension.refund_status': ttts.PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED,
                        'performance_ttts_extension.refund_update_user': staffUser,
                        'performance_ttts_extension.refund_update_at': now
                    }
                }, {
                    multi: true
                }).exec();
            }
        }
        // 販売停止か再開かで返金ステータスセットorクリア決定
        const refundStatus = onlineStatus === ttts.PerformanceUtil.ONLINE_SALES_STATUS.SUSPENDED ?
            ttts.PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED :
            ttts.PerformanceUtil.REFUND_STATUS.NONE;
        // パフォーマンス更新
        const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
        yield performanceRepo.performanceModel.update({
            _id: { $in: ids }
        }, {
            $set: {
                'ttts_extension.online_sales_status': onlineStatus,
                'ttts_extension.online_sales_update_user': staffUser,
                'ttts_extension.online_sales_update_at': now,
                'ttts_extension.ev_service_status': evStatus,
                'ttts_extension.ev_service_update_user': staffUser,
                'ttts_extension.ev_service_update_at': now,
                'ttts_extension.refund_status': refundStatus,
                'ttts_extension.refund_update_user': staffUser,
                'ttts_extension.refund_update_at': now
            }
        }, {
            multi: true
        }).exec();
        return info;
    });
}
/**
 * 運行・オンライン販売停止メール作成
 *
 * @param {Response} res
 * @param {any[]} targrtInfos
 * @param {any} notice
 * @return {Promise<void>}
 */
function createEmails(res, targrtInfo, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        // メール送信情報 [{'20171201_12345': [r1,r2,,,rn]}]
        if (Object.keys(targrtInfo).length === 0) {
            return;
        }
        // 購入単位ごとにメール作成
        const promises = (Object.keys(targrtInfo).map((key) => __awaiter(this, void 0, void 0, function* () {
            if (targrtInfo[key].length > 0) {
                yield createEmail(res, targrtInfo[key], notice);
            }
        })));
        yield Promise.all(promises);
        return;
    });
}
/**
 * 運行・オンライン販売停止メール作成(1通)
 *
 * @param {Response} res
 * @param {any} reservation
 * @param {any} notice
 * @return {Promise<void>}
 */
function createEmail(res, reservations, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        const reservation = reservations[0];
        // タイトル編集
        // 東京タワー TOP DECK Ticket
        const title = res.__('Title');
        // 東京タワー TOP DECK エレベータ運行停止のお知らせ
        const titleEmail = res.__('Email.TitleSus');
        //トウキョウ タロウ 様
        const purchaserName = `${res.__('Mr{{name}}', { name: reservation.purchaser_name[res.locale] })}`;
        // 購入チケット情報
        const paymentTicketInfos = [];
        // 購入番号 : 850000001
        paymentTicketInfos.push(`${res.__('Label.PaymentNo')} : ${reservation.payment_no}`);
        // ご来塔日時 : 2017/12/10 09:15
        const day = moment(reservation.performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
        // tslint:disable-next-line:no-magic-numbers
        const time = `${reservation.performance_start_time.substr(0, 2)}:${reservation.performance_start_time.substr(2, 2)}`;
        paymentTicketInfos.push(`${res.__('Label.Day')} : ${day} ${time}`);
        // 券種 枚数
        paymentTicketInfos.push(`${res.__('Label.TicketType')} ${res.__('Label.TicketCount')}`);
        // TOP DECKチケット(大人) 1枚
        const leaf = res.__('Email.Leaf');
        const infos = suspensionCommon.getTicketInfo(reservations, leaf, res.locale);
        paymentTicketInfos.push(infos.join('\n'));
        // 本文セット
        const content = `${titleEmail}\n\n${purchaserName}\n\n${notice}\n\n${paymentTicketInfos.join('\n')}`;
        // メール編集
        const emailQueue = {
            from: {
                address: conf.get('email.from'),
                name: conf.get('email.fromname')
            },
            to: {
                address: reservation.purchaser_email
            },
            subject: `${title} ${titleEmail}`,
            content: {
                mimetype: 'text/plain',
                text: content
            },
            status: ttts.EmailQueueUtil.STATUS_UNSENT
        };
        // メール作成
        yield ttts.Models.EmailQueue.create(emailQueue);
    });
}