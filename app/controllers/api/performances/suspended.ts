/**
 * 販売停止パフォーマンスAPIコントローラー
 * @namespace controllers.api.performances.suspended
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import { CREATED, INTERNAL_SERVER_ERROR } from 'http-status';
import * as moment from 'moment';
import * as _ from 'underscore';

const debug = createDebug('ttts-staff:controllers:api:performances');
const EMPTY_STRING: string = '-';
const EV_SERVICE_STATUS_NAMES: any = {
};
EV_SERVICE_STATUS_NAMES[ttts.factory.performance.EvServiceStatus.Normal] = EMPTY_STRING;
EV_SERVICE_STATUS_NAMES[ttts.factory.performance.EvServiceStatus.Slowdown] = '減速';
EV_SERVICE_STATUS_NAMES[ttts.factory.performance.EvServiceStatus.Suspended] = '停止';
const REFUND_STATUS_NAMES: any = {
};
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.None] = EMPTY_STRING;
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.NotInstructed] = '未指示';
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.Instructed] = '指示済';
REFUND_STATUS_NAMES[ttts.factory.performance.RefundStatus.Compeleted] = '返金済';

/**
 * 販売中止一覧検索(api)
 */
export async function searchSuspendedPerformances(req: Request, res: Response): Promise<void> {
    // tslint:disable-next-line:no-magic-numbers
    const limit: number = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, 10) : 10;
    // tslint:disable-next-line:no-magic-numbers
    const page: number = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, 10) : 1;

    // 入力値またはnull取得
    const getValue = (value: string | null) => {
        return (!_.isEmpty(value)) ? value : null;
    };
    // 販売停止処理日
    const day1: string | null = getValue(req.query.input_onlinedate1);
    const day2: string | null = getValue(req.query.input_onlinedate2);
    // 対象ツアー年月日
    const performanceDate1: string | null = getValue(req.query.input_performancedate1);
    const performanceDate2: string | null = getValue(req.query.input_performancedate2);
    // 返金ステータス
    const refundStatus: string | null = getValue(req.query.refund_status);

    // 検索条件を作成
    const conditions: any[] = [];
    conditions.push({ 'ttts_extension.online_sales_status': ttts.factory.performance.OnlineSalesStatus.Suspended });
    // 販売停止処理日
    if (day1 !== null || day2 !== null) {
        conditions.push({ 'ttts_extension.online_sales_update_at': getConditionsFromTo(day1, day2, true) });
    }
    // 対象ツアー年月日
    if (performanceDate1 !== null || performanceDate2 !== null) {
        conditions.push({ day: getConditionsFromTo(performanceDate1, performanceDate2) });
    }
    // 返金ステータス
    if (refundStatus !== null) {
        conditions.push({ 'ttts_extension.refund_status': refundStatus });
    }

    try {
        // 販売停止パフォーマンス情報を検索
        const suspensionList = await findSuspendedPerformances(conditions, limit, page);
        res.json(suspensionList);
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            errors: [{
                message: error.message
            }]
        });
    }
}

/**
 * FromTo条件セット
 * @param {string | null} value1
 * @param {string | null} value2
 * @param {boolean} convert
 * @return {any}
 */
function getConditionsFromTo(value1: string | null, value2: string | null, convert: boolean = false): any {
    const conditionsFromTo: any = {};
    if (value1 !== null) {
        value1 = convert ? moment(value1, 'YYYY/MM/DD').format('YYYY/MM/DD HH:mm:ss') : value1;
        conditionsFromTo.$gte = value1;
    }
    if (value2 !== null) {
        value2 = convert ? moment(value2, 'YYYY/MM/DD').add('days', 1).format('YYYY/MM/DD HH:mm:ss') : value2;
        conditionsFromTo.$lt = value2;
    }

    return conditionsFromTo;
}

export interface ISuspendedPerformances {
    performance_id: string;
    // 対象ツアー年月日
    performance_day: string;
    // 対象ツアーNo
    tour_number: string;
    // 運転状況
    ev_service_status: string;
    // 運転状況(名称)
    ev_service_status_name: string;
    // 販売停止処理日時
    online_sales_update_at: Date;
    // 処理実施者
    online_sales_update_user: string;
    // 一般予約数
    canceled: number;
    // 来塔数
    arrived: number;
    // 返金状態
    refund_status: string;
    // 返金状態(名称)
    refund_status_name: string;
    // 返金済数
    refunded: number;
}

/**
 * 表示一覧取得
 */
async function findSuspendedPerformances(conditions: any[], limit: number, page: number): Promise<ISuspendedPerformances[]> {
    const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);

    const performances = <any[]>await performanceRepo.performanceModel
        .find({ $and: conditions })
        .sort({
            day: -1,
            start_time: 1
        })
        .skip(limit * (page - 1))
        .limit(limit)
        .lean()
        .exec();
    debug('suspended performances found.', performances);

    return Promise.all(performances.map(async (performance) => {
        const performanceId = performance._id.toString();

        // パフォーマンスに対する予約数
        const numberOfReservations = await reservationRepo.reservationModel.count(
            {
                status: ttts.factory.reservationStatusType.ReservationConfirmed,
                purchaser_group: ttts.factory.person.Group.Customer,
                performance: performance._id
            }
        ).exec();
        // 未入場の予約数
        const nubmerOfUncheckedReservations = await reservationRepo.reservationModel.count(
            {
                status: ttts.factory.reservationStatusType.ReservationConfirmed,
                purchaser_group: ttts.factory.person.Group.Customer,
                performance: performance._id,
                checkins: { $size: 0 } // $sizeが0より大きい、という検索は現時点ではMongoDBが得意ではない
            }
        ).exec();

        return {
            performance_id: performanceId,
            performance_day: moment(performance.day, 'YYYYMMDD').format('YYYY/MM/DD'),
            tour_number: performance.ttts_extension.tour_number === '' ?
                EMPTY_STRING : performance.ttts_extension.tour_number,
            ev_service_status: performance.ttts_extension.ev_service_status,
            ev_service_status_name: EV_SERVICE_STATUS_NAMES[performance.ttts_extension.ev_service_status],
            online_sales_update_at: performance.ttts_extension.online_sales_update_at,
            online_sales_update_user: performance.ttts_extension.online_sales_update_user,
            canceled: numberOfReservations,
            arrived: numberOfReservations - nubmerOfUncheckedReservations,
            refund_status: performance.ttts_extension.refund_status,
            refund_status_name: REFUND_STATUS_NAMES[performance.ttts_extension.refund_status],
            refunded: performance.ttts_extension.refunded_count
        };
    }));
}

/**
 * 返金処理(api)
 */
export async function returnOrders(req: Request, res: Response): Promise<void> {
    try {
        // パフォーマンスと予約情報の返金ステータス更新(指示済に)
        const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
        const taskRepo = new ttts.repository.Task(ttts.mongoose.connection);
        const task = await ttts.service.order.returnAllByPerformance(req.params.performanceId)(performanceRepo, taskRepo);
        debug('returnAllByPerformance task created.', task);

        res.status(CREATED).json(task);
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            errors: [
                { message: error.message }
            ]
        });
    }
}
