/**
 * テンプレート変数をセットする
 *
 * @module middleware/setLocal
 */

import { CommonUtil, GMO, Models, ReservationUtil, ScreenUtil } from '@motionpicture/ttts-domain';
import * as conf from 'config';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as numeral from 'numeral';

export default (req: Request, res: Response, next: NextFunction) => {
    res.locals.req = req;
    res.locals.moment = moment;
    res.locals.numeral = numeral;
    res.locals.conf = conf;
    res.locals.Util = CommonUtil;
    res.locals.validation = null;

    res.locals.GMOUtil = GMO.utils.util;
    res.locals.ReservationUtil = ReservationUtil;
    res.locals.ScreenUtil = ScreenUtil;
    res.locals.Models = Models;

    next();
};
