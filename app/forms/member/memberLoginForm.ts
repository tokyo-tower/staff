/**
 * メルマガ先行会員ログインフォーム
 *
 * @ignore
 */
import { Request } from 'express';

export default (req: Request) => {
    // userId
    req.checkBody('userId', 'ログイン番号が未入力です').notEmpty();

    // password
    req.checkBody('password', 'パスワードが未入力です').notEmpty();
};
