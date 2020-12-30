/**
 * テンプレート変数をセットする
 */
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment-timezone';
import * as numeral from 'numeral';

export default (req: Request, res: Response, next: NextFunction) => {
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
