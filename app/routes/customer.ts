/**
 * customerルーティング
 *
 * @ignore
 */

import * as express from 'express';
import * as customerCancelController from '../controllers/customer/cancel';
import * as customerReserveController from '../controllers/customer/reserve';
import * as customerReserveGmoController from '../controllers/customer/reserve/gmo';

const router = express.Router();

// 本番環境ではhomeは存在しない
if (process.env.NODE_ENV !== 'production') {
    router.all('/reserve/performances', customerReserveController.performances);
}
router.get('/reserve/start', customerReserveController.start);
router.all('/reserve/terms', customerReserveController.terms);
router.all('/reserve/seats', customerReserveController.seats);
router.all('/reserve/tickets', customerReserveController.tickets);
router.all('/reserve/profile', customerReserveController.profile);
router.all('/reserve/confirm', customerReserveController.confirm);
router.get('/reserve/:performanceDay/:paymentNo/waitingSettlement', customerReserveController.waitingSettlement);
router.get('/reserve/:performanceDay/:paymentNo/complete', customerReserveController.complete);

router.post('/reserve/gmo/start', customerReserveGmoController.start);
router.post('/reserve/gmo/result', customerReserveGmoController.result);
router.get('/reserve/gmo/:orderId/cancel', customerReserveGmoController.cancel);

router.all('/cancel', customerCancelController.index);
router.post('/cancel/executeByPaymentNo', customerCancelController.executeByPaymentNo);

export default router;
