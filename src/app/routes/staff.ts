/**
 * 予約管理スタッフルーティング
 */
import * as express from 'express';

import * as myPageController from '../controllers/staff/mypage';
import * as suspensionController from '../controllers/staff/suspension';

import authentication from '../middlewares/authentication';

const staffRouter = express.Router();

staffRouter.all('/mypage', authentication, myPageController.index);
staffRouter.get('/mypage/print', authentication, myPageController.print);
staffRouter.get('/mypage/printByToken', authentication, myPageController.printByToken);
staffRouter.post('/mypage/print/token', authentication, myPageController.getPrintToken);

// 運行・オンライン販売停止設定コントローラー
staffRouter.get('/suspension/setting/performances', authentication, suspensionController.performances);

// 運行・オンライン販売停止一覧コントローラー
staffRouter.get('/suspension/list', authentication, suspensionController.index);

staffRouter.get(
    '/auth',
    (req, res) => {
        try {
            if (req.session === undefined) {
                throw new Error('session undefined.');
            }

            res.json({
                success: true,
                token: req.tttsAuthClient.credentials,
                errors: null
            });
        } catch (error) {
            res.json({
                success: false,
                token: null,
                errors: error
            });
        }
    }
);

export default staffRouter;
