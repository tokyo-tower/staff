/**
 * 座席予約座席選択フォーム
 *
 * @ignore
 */
import { Request } from 'express';
export default (req: Request): void => {
    req.checkBody('seatCodes').notEmpty();
};
