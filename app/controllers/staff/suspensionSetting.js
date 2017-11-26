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
            yield suspendById(req.staffUser.username, performanceIds, req.body.onlineStatus, req.body.evStatus, req.body.notice);
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
 * @param {string} notice
 * @return {Promise<boolean>}
 */
function suspendById(staffUser, performanceIds, onlineStatus, evStatus, notice) {
    return __awaiter(this, void 0, void 0, function* () {
        // tslint:disable-next-line:no-console
        console.log(notice);
        // パフォーマンスIDをObjectIdに変換
        const ids = performanceIds.map((id) => {
            return new mongoose.Types.ObjectId(id);
        });
        try {
            const now = moment().format('YYYY/MM/DD HH:mm:ss');
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
                    'ttts_extension.ev_service_update_at': now
                }
            }, {
                multi: true
            }).exec();
        }
        catch (error) {
            return false;
        }
        return true;
    });
}
