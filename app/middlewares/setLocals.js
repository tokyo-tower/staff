"use strict";
/**
 * テンプレート変数をセットする
 *
 * @module middleware/setLocal
 */
Object.defineProperty(exports, "__esModule", { value: true });
const conf = require("config");
const moment = require("moment");
const numeral = require("numeral");
exports.default = (req, res, next) => {
    res.locals.req = req;
    res.locals.moment = moment;
    res.locals.numeral = numeral;
    res.locals.conf = conf;
    res.locals.validation = null;
    next();
};
