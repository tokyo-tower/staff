/**
 * 言語コントローラー
 */
import { Request, Response } from 'express';

/**
 * 言語切り替え
 */
export function update(req: Request, res: Response): void {
    const locale = req.params.locale;
    (<any>req.session).locale = locale;

    const cb = (typeof req.query.cb === 'string' && req.query.cb.length > 0) ? decodeURIComponent(req.query.cb) : '/';
    res.redirect(cb);
}
