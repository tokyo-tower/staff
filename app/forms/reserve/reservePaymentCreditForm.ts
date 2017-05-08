/**
 * 座席予約購入者情報フォーム
 *
 * @ignore
 */
import { Request } from 'express';

export default (req: Request) => {
    // gmoTokenObject
    req.checkBody('gmoTokenObject').notEmpty();
};
