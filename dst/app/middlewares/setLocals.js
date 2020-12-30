"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const moment = require("moment-timezone");
const numeral = require("numeral");
exports.default = (req, res, next) => {
    // let momentLocale = (typeof req.getLocale() === 'string') ? req.getLocale() : '';
    // if (momentLocale === 'zh-hans') {
    //     momentLocale = 'zh-cn';
    // } else if (momentLocale === 'zh-hant') {
    //     momentLocale = 'zh-tw';
    // }
    // if (momentLocale !== '') {
    //     moment.locale(momentLocale);
    // }
    moment.locale('ja');
    res.locals.req = req;
    res.locals.moment = moment;
    res.locals.numeral = numeral;
    res.locals.validation = null;
    next();
};
