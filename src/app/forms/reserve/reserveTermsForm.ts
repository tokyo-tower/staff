/**
 * 座席予約規約同意フォーム
 */
import { Request } from 'express';
export default (req: Request): void => {
    // isAgree
    req.checkBody('isAgree', req.__('RequiredAgree')).notEmpty();
    req.checkBody('isAgree', 'RequiredAgree').matches(/^on$/);
};
