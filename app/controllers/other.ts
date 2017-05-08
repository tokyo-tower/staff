/**
 * 静的ページコントローラー
 *
 * @namespace controller/other
 */

import { Request, Response } from 'express';

export function policy(req: Request, res: Response): void {
    res.render(`other/policy_${req.getLocale()}`);
}

export function privacy(req: Request, res: Response): void {
    res.render(`other/privacy_${req.getLocale()}`);
}

export function commercialTransactions(req: Request, res: Response): void {
    res.render(`other/commercialTransactions_${req.getLocale()}`);
}
