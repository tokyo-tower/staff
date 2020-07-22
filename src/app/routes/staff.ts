/**
 * 代理予約スタッフルーティング
 */
import * as express from 'express';

import * as staffMyPageController from '../controllers/staff/mypage';
import * as staffSuspensionListController from '../controllers/staff/suspensionList';
import * as staffSuspensionSettingController from '../controllers/staff/suspensionSetting';

import authentication from '../middlewares/authentication';

const staffRouter = express.Router();

staffRouter.all('/mypage', authentication, staffMyPageController.index);
staffRouter.get('/mypage/print', authentication, staffMyPageController.print);

// 運行・オンライン販売停止設定コントローラー
staffRouter.get('/suspension/setting/performances', authentication, staffSuspensionSettingController.performances);

// 運行・オンライン販売停止一覧コントローラー
staffRouter.get('/suspension/list', authentication, staffSuspensionListController.index);

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
