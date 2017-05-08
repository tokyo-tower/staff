/**
 * 座席予約パフォーマンス選択フォーム
 *
 * viewに物理的にフォームはないが、hiddenフォームとして扱っている
 *
 * @ignore
 */
import { Request } from 'express';
export default (req: Request): void => {
    req.checkBody('performanceId').notEmpty();
};
