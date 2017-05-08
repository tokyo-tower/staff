/**
 * 座席予約規約同意フォーム
 *
 * @ignore
 */
import { Request } from 'express';
export default (req: Request): void => {
    // isAgree
    req.checkBody('isAgree', req.__('Message.RequiredAgree')).notEmpty();
    req.checkBody('isAgree', 'Message.RequiredAgree').matches(/^on$/);
};
