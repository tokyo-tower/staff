"use strict";
/**
 * 運行・オンライン販売停止設定コントローラー
 * @namespace controller/staff/suspensionSetting
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
const VIEW_PATH = 'staff/suspension';
const layout = 'layouts/staff/layout';
/**
 * スケジュール選択
 * @method performances
 * @returns {Promise<void>}
 */
function performances(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const token = yield ttts.CommonUtil.getToken({
                authorizeServerDomain: process.env.API_AUTHORIZE_SERVER_DOMAIN,
                clientId: process.env.API_CLIENT_ID,
                clientSecret: process.env.API_CLIENT_SECRET,
                scopes: [
                    `${process.env.API_RESOURECE_SERVER_IDENTIFIER}/performances.read-only`
                ],
                state: ''
            });
            // 運行・オンライン販売停止設定画面表示
            res.render(`${VIEW_PATH}/performances`, {
                token: token,
                layout: layout
            });
        }
        catch (error) {
            next(new Error(req.__('Message.UnexpectedError')));
        }
    });
}
exports.performances = performances;
