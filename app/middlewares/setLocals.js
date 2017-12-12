"use strict";
/**
 * テンプレート変数をセットする
 *
 * @module middleware/setLocal
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ttts_domain_1 = require("@motionpicture/ttts-domain");
const conf = require("config");
const moment = require("moment");
const numeral = require("numeral");
exports.default = (req, res, next) => {
    res.locals.req = req;
    res.locals.moment = moment;
    res.locals.numeral = numeral;
    res.locals.conf = conf;
    res.locals.Util = ttts_domain_1.CommonUtil;
    res.locals.validation = null;
    res.locals.GMOUtil = ttts_domain_1.GMO.utils.util;
    res.locals.ReservationUtil = ttts_domain_1.ReservationUtil;
    res.locals.Models = ttts_domain_1.Models;
    next();
};
