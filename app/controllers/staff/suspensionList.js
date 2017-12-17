"use strict";
/**
 * 運行・オンライン販売停止一覧コントローラー
 * @namespace controller/staff/suspensionList
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
const layout = 'layouts/staff/layout';
/**
 * 運行・オンライン販売停止一覧
 */
function index(__, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            res.render('staff/suspension/list', {
                layout: layout,
                EvServiceStatus: ttts.factory.performance.EvServiceStatus,
                OnlineSalesStatus: ttts.factory.performance.OnlineSalesStatus,
                RefundStatus: ttts.factory.performance.RefundStatus
            });
        }
        catch (error) {
            next(error);
        }
    });
}
exports.index = index;
