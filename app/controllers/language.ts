/**
 * 言語コントローラー
 *
 * @namespace controller/language
 */

import { Request, Response } from 'express';
import * as _ from 'underscore';

/**
 * 言語切り替え
 */
export function update(req: Request, res: Response): void {
    const locale = req.params.locale;
    (<any>req.session).locale = locale;

    const cb = (!_.isEmpty(req.query.cb)) ? decodeURIComponent(req.query.cb) : '/';
    res.redirect(cb);
}
