/**
 * エラーハンドラーミドルウェア
 */

import { NextFunction, Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR } from 'http-status';

export default (err: any, req: Request, res: Response, __: NextFunction) => {
    console.error(err.message, err.stack);

    if (req.xhr) {
        res.status(INTERNAL_SERVER_ERROR).json({
            success: false,
            message: err.message
        });
    } else {
        res.status(INTERNAL_SERVER_ERROR);
        res.render('error/error', {
            message: err.message,
            error: err
        });
    }
};
