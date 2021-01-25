/**
 * プロジェクトホームルーター
 */
// import * as cinerinoapi from '@cinerino/sdk';
// import * as createDebug from 'debug';
import * as express from 'express';
// import { INTERNAL_SERVER_ERROR } from 'http-status';
// import * as moment from 'moment-timezone';

// const debug = createDebug('cinerino-console:routes');
const homeRouter = express.Router();

homeRouter.get(
    '',
    async (__, res, next) => {
        try {
            res.render('home', {
                message: 'Welcome to Cinerino Console!',
                extractScripts: true
            });
        } catch (error) {
            next(error);
        }
    }
);

export default homeRouter;
