/**
 * ルーティング
 */
import { Router } from 'express';

import apiRouter from './api';
import checkinRouter from './checkin';
import reportsRouter from './reports';
import staffRouter from './staff';

const PROJECT_ID = process.env.PROJECT_ID;
const DEFAULT_CALLBACK = process.env.DEFAULT_CALLBACK;

const router = Router();

// デフォルトトップページ
router.get('/', (_, res, next) => {
    if (typeof DEFAULT_CALLBACK === 'string' && DEFAULT_CALLBACK.length > 0) {
        res.redirect(DEFAULT_CALLBACK);

        return;
    }

    next();
});

// リクエストプロジェクトをセット
router.use((req, __, next) => {
    if (typeof PROJECT_ID === 'string' && PROJECT_ID.length > 0) {
        req.project = { id: PROJECT_ID };
    }

    next();
});

router.use('/api', apiRouter);
router.use('/staff', staffRouter);
router.use('/reports', reportsRouter); //レポート出力

// 入場
router.use('/checkin', checkinRouter);

export default router;
