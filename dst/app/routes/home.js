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
 * プロジェクトホームルーター
 */
// import * as cinerinoapi from '@cinerino/sdk';
// import * as createDebug from 'debug';
const express = require("express");
// import { INTERNAL_SERVER_ERROR } from 'http-status';
// import * as moment from 'moment-timezone';
// const debug = createDebug('cinerino-console:routes');
const homeRouter = express.Router();
homeRouter.get('', (__, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.render('home', {
            message: 'Welcome to Cinerino Console!',
            extractScripts: true
        });
    }
    catch (error) {
        next(error);
    }
}));
exports.default = homeRouter;
