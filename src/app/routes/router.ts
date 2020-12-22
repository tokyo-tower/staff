/**
 * ルーティング
 */
import { Router } from 'express';

import apiRouter from './api';
import checkinRouter from './checkin';
import reportsRouter from './reports';
import staffRouter from './staff';

const DEFAULT_CALLBACK = process.env.DEFAULT_CALLBACK;
const GCP_REDIRECT = process.env.GCP_REDIRECT;

const router = Router();

// デフォルトトップページ
router.get('/', (_, res, next) => {
    if (typeof DEFAULT_CALLBACK === 'string' && DEFAULT_CALLBACK.length > 0) {
        res.redirect(DEFAULT_CALLBACK);

        return;
    }

    next();
});

// GCPへのリダイレクト指定があれば全てリダイレクト
router.use((req, res, next) => {
    if (typeof GCP_REDIRECT === 'string' && GCP_REDIRECT.length > 0) {
        res.redirect(`${GCP_REDIRECT}${req.originalUrl}`);

        return;
    }

    next();
});

router.use('/api', apiRouter);

router.use('/staff', staffRouter);
router.use('/reports', reportsRouter); //レポート出力

// 入場
router.use('/checkin', checkinRouter);

export default router;
