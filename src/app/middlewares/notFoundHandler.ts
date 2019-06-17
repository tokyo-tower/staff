/**
 * 404ハンドラーミドルウェア
 */

import { Request, Response } from 'express';
import { NOT_FOUND } from 'http-status';

export default (req: Request, res: Response) => {
    if (req.xhr) {
        res.status(NOT_FOUND).send({ error: 'Not Found.' });
    } else {
        res.status(NOT_FOUND);
        res.render('error/notFound', {
        });
    }
};
