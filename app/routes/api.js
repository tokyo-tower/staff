"use strict";
/**
 * APIルーティング
 * @ignore
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const PerformancesController = require("../controllers/api/performances");
const SuspendedPerformancesController = require("../controllers/api/performances/suspended");
const ReservationsController = require("../controllers/api/reservations");
const authentication_1 = require("../middlewares/authentication");
const apiRouter = express.Router();
apiRouter.get('/reservations', authentication_1.default, ReservationsController.search);
apiRouter.post('/reservations/updateWatcherName', authentication_1.default, ReservationsController.updateWatcherName);
apiRouter.post('/reservations/cancel', authentication_1.default, ReservationsController.cancel);
// 運行・オンライン販売停止設定コントローラー
apiRouter.post('/performances/updateOnlineStatus', authentication_1.default, PerformancesController.updateOnlineStatus);
// 運行・オンライン販売停止一覧コントローラー
apiRouter.get('/performances/suspended', authentication_1.default, SuspendedPerformancesController.searchSuspendedPerformances);
apiRouter.post('/performances/suspended/:performanceId/tasks/returnOrders', authentication_1.default, SuspendedPerformancesController.returnOrders);
exports.default = apiRouter;
