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
const ttts_domain_1 = require("@motionpicture/ttts-domain");
const conf = require("config");
const moment = require("moment");
const mongoose = require("mongoose");
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
            const token = yield ttts_domain_1.CommonUtil.getToken(process.env.API_ENDPOINT);
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
            // const onlineStatus: string =  executeType === '1' ? req.body.onlineStatus : PerformanceUtil.ONLINE_SALES_STATUS.NORMAL;
            // const evStatus: string =  executeType === '1' ? req.body.evStatus : PerformanceUtil.EV_SERVICE_STATUS.NORMAL;
            const onlineStatus = req.body.onlineStatus;
            const evStatus = req.body.evStatus;
            const notice = req.body.notice;
            const info = yield updateStatusByIds(req.staffUser.username, performanceIds, onlineStatus, evStatus);
            // 運行停止の時、メール作成
            if (evStatus === ttts_domain_1.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED) {
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
            return new mongoose.Types.ObjectId(id);
        });
        const now = moment().format('YYYY/MM/DD HH:mm:ss');
        // 返金対象予約情報取得(入塔記録のないもの)
        const info = yield suspensionCommon.getTargetReservationsForRefund(performanceIds, ttts_domain_1.PerformanceUtil.REFUND_STATUS.NONE, evStatus === ttts_domain_1.PerformanceUtil.EV_SERVICE_STATUS.SUSPENDED);
        // 予約情報返金ステータスを未指示に更新
        if (info.targrtIds.length > 0) {
            yield ttts_domain_1.Models.Reservation.update({
                _id: { $in: info.targrtIds }
            }, {
                $set: {
                    'performance_ttts_extension.refund_status': ttts_domain_1.PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED,
                    'performance_ttts_extension.refund_update_user': staffUser,
                    'performance_ttts_extension.refund_update_at': now
                }
            }, {
                multi: true
            }).exec();
        }
        // パフォーマンス更新
        yield ttts_domain_1.Models.Performance.update({
            _id: { $in: ids }
        }, {
            $set: {
                'ttts_extension.online_sales_status': onlineStatus,
                'ttts_extension.online_sales_update_user': staffUser,
                'ttts_extension.online_sales_update_at': now,
                'ttts_extension.ev_service_status': evStatus,
                'ttts_extension.ev_service_update_user': staffUser,
                'ttts_extension.ev_service_update_at': now,
                'ttts_extension.refund_status': ttts_domain_1.PerformanceUtil.REFUND_STATUS.NOT_INSTRUCTED,
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
                yield createEmail(res, targrtInfo[key][0], notice);
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
 * @param {an} reservation
 * @param {any} notice
 * @return {Promise<void>}
 */
function createEmail(res, reservation, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        // タイトル編集
        const title = res.__('Title');
        const titleEmail = res.__('Email.Title');
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
                text: notice
            },
            status: ttts_domain_1.EmailQueueUtil.STATUS_UNSENT
        };
        // メール作成
        yield ttts_domain_1.Models.EmailQueue.create(emailQueue);
    });
}
