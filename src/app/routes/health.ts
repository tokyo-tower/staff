/**
 * ヘルスチェックルーター
 */
import * as express from 'express';

const healthRouter = express.Router();

import { OK } from 'http-status';

healthRouter.get(
    '',
    async (_, res, next) => {
        try {
            res.status(OK)
                .send('healthy!');
        } catch (error) {
            next(error);
        }
    }
);

export default healthRouter;
