/**
 * 代理予約スタッフルーティング
 */
import * as express from 'express';
import * as staffAuthController from '../controllers/staff/auth';
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

staffRouter.get('/auth', staffAuthController.auth);

export default staffRouter;
