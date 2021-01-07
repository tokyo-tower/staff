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
/**
 * ヘルスチェックルーター
 */
const express = require("express");
const healthRouter = express.Router();
const http_status_1 = require("http-status");
healthRouter.get('', (_, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.status(http_status_1.OK)
            .send('healthy!');
    }
    catch (error) {
        next(error);
    }
}));
exports.default = healthRouter;
