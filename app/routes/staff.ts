/**
 * 内部関係者ルーティング
 * @ignore
 */

import * as express from 'express';
import * as staffAuthController from '../controllers/staff/auth';
import * as staffMyPageController from '../controllers/staff/mypage';
import * as staffReserveController from '../controllers/staff/reserve';
import * as staffSuspensionListController from '../controllers/staff/suspensionList';
import * as staffSuspensionSettingController from '../controllers/staff/suspensionSetting';

import authentication from '../middlewares/authentication';

const staffRouter = express.Router();

staffRouter.all('/mypage', authentication, staffMyPageController.index);
staffRouter.get('/reserve/start', authentication, staffReserveController.start);
staffRouter.all('/reserve/terms', authentication, staffReserveController.terms);
staffRouter.all('/reserve/performances', authentication, staffReserveController.performances);
staffRouter.all('/reserve/tickets', authentication, staffReserveController.tickets);
staffRouter.all('/reserve/profile', authentication, staffReserveController.profile);
staffRouter.all('/reserve/confirm', authentication, staffReserveController.confirm);
staffRouter.get('/reserve/:performanceDay/:paymentNo/complete', authentication, staffReserveController.complete);

// 運行・オンライン販売停止設定コントローラー
staffRouter.get('/suspension/setting/performances', authentication, staffSuspensionSettingController.performances);

// 運行・オンライン販売停止一覧コントローラー
staffRouter.get('/suspension/list', authentication, staffSuspensionListController.index);

staffRouter.get('/auth', staffAuthController.auth);

export default staffRouter;
