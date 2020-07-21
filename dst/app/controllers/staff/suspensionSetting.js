"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performances = void 0;
/**
 * 運行・オンライン販売停止設定コントローラー
 */
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const layout = 'layouts/staff/layout';
/**
 * スケジュール選択
 */
function performances(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 運行・オンライン販売停止設定画面表示
            res.render('staff/suspension/performances', {
                token: req.tttsAuthClient.credentials,
                layout: layout,
                EvServiceStatus: tttsapi.factory.performance.EvServiceStatus,
                OnlineSalesStatus: tttsapi.factory.performance.OnlineSalesStatus,
                RefundStatus: tttsapi.factory.performance.RefundStatus
            });
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.performances = performances;
