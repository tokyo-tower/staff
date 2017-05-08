"use strict";
/**
 * テンプレート変数をセットする
 *
 * @module middleware/setLocal
 */
Object.defineProperty(exports, "__esModule", { value: true });
const chevre_domain_1 = require("@motionpicture/chevre-domain");
const GMO = require("@motionpicture/gmo-service");
const conf = require("config");
const moment = require("moment");
const numeral = require("numeral");
exports.default = (req, res, next) => {
    res.locals.req = req;
    res.locals.moment = moment;
    res.locals.numeral = numeral;
    res.locals.conf = conf;
    res.locals.Util = chevre_domain_1.CommonUtil;
    res.locals.validation = null;
    res.locals.GMOUtil = GMO.Util;
    res.locals.ReservationUtil = chevre_domain_1.ReservationUtil;
    res.locals.ScreenUtil = chevre_domain_1.ScreenUtil;
    res.locals.Models = chevre_domain_1.Models;
    next();
};
