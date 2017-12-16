/**
 * APIルーティング
 * @ignore
 */

import * as express from 'express';
import * as PerformancesController from '../controllers/api/performances';
import * as SuspendedPerformancesController from '../controllers/api/performances/suspended';
import * as ReservationsController from '../controllers/api/reservations';

import authentication from '../middlewares/authentication';

const apiRouter = express.Router();

apiRouter.get('/reservations', authentication, ReservationsController.search);
apiRouter.post('/reservations/updateWatcherName', authentication, ReservationsController.updateWatcherName);
apiRouter.post('/reservations/cancel', authentication, ReservationsController.cancel);

// 運行・オンライン販売停止設定コントローラー
apiRouter.post('/performances/updateOnlineStatus', authentication, PerformancesController.updateOnlineStatus);

// 運行・オンライン販売停止一覧コントローラー
apiRouter.get('/performances/suspended', authentication, SuspendedPerformancesController.searchSuspendedPerformances);
apiRouter.post(
    '/performances/suspended/:performanceId/tasks/returnOrders', authentication, SuspendedPerformancesController.returnOrders);

export default apiRouter;
