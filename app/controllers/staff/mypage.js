"use strict";
/**
 * 内部関係者マイページコントローラー
 * @namespace controller/staff/mypage
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
 * マイページ(予約一覧)
 */
function index(__, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const ownerRepo = new ttts.repository.Owner(ttts.mongoose.connection);
            const owners = yield ownerRepo.ownerModel.find({}, '_id name', { sort: { _id: 1 } }).exec();
            res.render('staff/mypage/index', {
                owners: owners,
                layout: layout
            });
        }
        catch (error) {
            next(error);
        }
    });
}
exports.index = index;
