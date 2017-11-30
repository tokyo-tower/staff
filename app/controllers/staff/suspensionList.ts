/**
 * 運行・オンライン販売停止一覧コントローラー
 *
 * @namespace controller/staff/suspensionList
 */
import { Models, PerformanceUtil, ReservationUtil } from '@motionpicture/ttts-domain';
import { NextFunction, Request, Response } from 'express';
import * as moment from 'moment';
import * as _ from 'underscore';

const DEFAULT_RADIX = 10;
const VIEW_PATH: string = 'staff/suspension';
const layout: string = 'layouts/staff/layout';
const EMPTY_STRING: string = '-';
const EV_SERVICE_STATUS_NAMES: any = { 0: EMPTY_STRING, 1: '減速', 2: '停止' };
const REFUND_STATUS_NAMES: any = { 0: EMPTY_STRING, 1: '未指示', 2: '指示済', 3: '返金済' };
/**
 * 運行・オンライン販売停止一覧
 *
 */
export async function index(__: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.render(`${VIEW_PATH}/list`, {
            layout: layout
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 販売中止一覧検索(api)
 *
 */
export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }

    // バリデーション
    // const errors = await validate(req);
    // if (Object.keys(errors).length > 0) {
    //     res.json({
    //         success: false,
    //         results: null,
    //         count: 0,
    //         errors: errors
    //     });
    //     return;
    // }

    // tslint:disable-next-line:no-magic-numbers
    const limit: number = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, DEFAULT_RADIX) : 10;
    const page: number = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, DEFAULT_RADIX) : 1;

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
    conditions.push({'ttts_extension.online_sales_status':  PerformanceUtil.ONLINE_SALES_STATUS.SUSPENDED});
    // 販売停止処理日
    if (day1 !== null || day2 !== null) {
        conditions.push({ 'ttts_extension.online_sales_update_at' : getConditionsFromTo(day1, day2, true) });
    }
    // 対象ツアー年月日
    if (performanceDate1 !== null || performanceDate2 !== null) {
        conditions.push({ day : getConditionsFromTo(performanceDate1, performanceDate2) });
    }

    // 予約情報
    // 返金ステータス
    const conditionsR: any = {};
    if (refundStatus !== null) {
        conditionsR.refund_status = refundStatus;
    }

    try {
        // データ検索
        const performances = await getPerformances(conditions, limit, page);
        const cntPerformances: number = performances.length;
        let infoR : any = {};
        if ( cntPerformances > 0 ) {
            // infoR.dicResevations { performance_id : [resevation1, resevationn] }
            infoR = await getResevations(conditionsR, performances);
        }
        // データから表示用の一覧を作成
        const suspensionList = getSuspensionList(performances, infoR);
        res.json({
            success: true,
            results: suspensionList,
            count: cntPerformances,
            errors: null
        });
    } catch (error) {
        console.error(error);
        res.json({
            success: false,
            results: [],
            errors: null,
            count: 0
        });
    }
}
/**
 * FromTo条件セット
 *
 * @param {string | null} value1
 * @param {string | null} value2
 * @param {boolean} convert
 * @return {any}
 */
function getConditionsFromTo(value1: string | null,
                             value2: string | null,
                             convert: boolean = false): any {
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
/**
 * パフォーマンス情報取得
 *
 * @param {any} conditions
 * @param {number} limit
 * @param {number} page
 * @return {any}
 */
async function getPerformances(conditions: any[],
                               limit: number,
                               page: number): Promise<any> {

    return (<any[]>await Models.Performance
        .find({$and: conditions})
        .sort({
            day: -1,
            start_time: 1
        })
        .skip(limit * (page - 1))
        .limit(limit)
        .exec()
    );
}
/**
 * 予約情報取得
 *
 * @param {any} conditions
 * @param {any} performances
 * @return {any}
 */
async function getResevations(conditions: any,
                              performances: any[]): Promise<any> {

    const info: any = { dicReservations: {}};
    // 予約情報取得
    // { performanceId : [reservation1,reservationn] }
    conditions.status = ReservationUtil.STATUS_RESERVED;
    const dicReservations: any = {};
    const promises = performances.map(async(performance: any) => {
        // パフォーマンスごとに予約情報取得
        const key: string = performance._id.toString();
        conditions.performance = key;
        dicReservations[key] = await Models.Reservation.find(
            conditions
        ).exec();
    });
    await Promise.all(promises);
    info.dicReservations = dicReservations;

    return info;
}
/**
 * 表示一覧取得
 *
 * @param {any} performances
 * @param {any} infoR
 * @return {any}
 */
function getSuspensionList(performances: any[],
                           infoR: any): any {
    const suspensionList: any[] = [];
    for (const performance of performances) {
        // 予約情報がない時のため、予約関連項目はここで初期化
        const suspension: any = {};
        const performanceId: string = performance._id.toString();
        // パフォーマンスIDの並列
        suspension.performance_id = performanceId;
        // 対象ツアー年月日
        suspension.performance_day = moment(performance.day, 'YYYYMMDD').format('YYYY/MM/DD');
        // 対象ツアーNo
        suspension.tour_number = performance.ttts_extension.tour_number === '' ?
            EMPTY_STRING : performance.ttts_extension.tour_number;
        // 運転状況
        suspension.ev_service_status = performance.ttts_extension.ev_service_status;
        // 運転状況(名称)
        suspension.ev_service_status_name = EV_SERVICE_STATUS_NAMES[performance.ttts_extension.ev_service_status];
        // 販売停止処理日時
        suspension.online_sales_update_at = performance.ttts_extension.online_sales_update_at;
        // 処理実施者
        suspension.online_sales_update_user = performance.ttts_extension.online_sales_update_user;
        // 一般予約数
        suspension.canceled = infoR.dicReservations[performanceId].length;
        // 来塔数
        suspension.arrived = getArrivedCount(infoR.dicReservations[performanceId]);
        // 返金状態
        suspension.refund_status = performance.ttts_extension.refund_status;
        // 返金状態(名称)
        suspension.refund_status_name = REFUND_STATUS_NAMES[performance.ttts_extension.refund_status];
        // 返金済数
        suspension.refunded = performance.ttts_extension.refunded_count;
        // 一覧に追加
        suspensionList.push(suspension);
    }
    return suspensionList;
}
/**
 * 来塔数取得
 *
 * @param {any} reservations
 * @return {number}
 */
function getArrivedCount(reservations: any[]): number {
    let cnt: number = 0;
    for (const reservation of reservations) {
        if (reservation.checkins.length > 0) {
            cnt += 1;
        }
    }

    return cnt;
}
/**
 * 返金処理(api)
 *
 */
export async function refundProcess(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('Message.UnexpectedError')));
        return;
    }
    try {
        // パフォーマンスIDセット
        const performanceId: string = (!_.isEmpty(req.body.performanceId)) ? req.body.performanceId : null;
        if (performanceId === null) {
            res.json({
                success: false,
                message: 'req.body.performanceId is empty.'
            });

            return;
        }
        // パフォーマンスと予約情報の返金ステータス更新(指示済に)
        await updateRefundStatus(performanceId,
                                 (<any>req.staffUser).username);
        res.json({
            success: true,
            message: null
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message
        });
    }
}
/**
 * パフォーマンス・予約情報返金ステータス更新
 *
 * @param {string} performanceId
 * @param {string} staffUser
 */
async function updateRefundStatus(performanceId: string,
                                  staffUser: string): Promise<void> {
    // パフォーマンスに紐づく予約情報取得
    const reservations = <any[]>await Models.Reservation.find(
        {
            purchaser_group: ReservationUtil.PURCHASER_GROUP_CUSTOMER,
            status: { $in: [ReservationUtil.STATUS_RESERVED, ReservationUtil.STATUS_ON_KEPT_FOR_SECURE_EXTRA]},
            performance: performanceId
        },
        '_id performance_day payment_no checkins performance_ttts_extension'
    ).exec();

    // 入塔済、返金済の予約情報セット
    const arrivedInfos: any[] = [];
    const refundedInfo: any = {};
    reservations.map((reservation: any) => {
        if (reservation.checkins.length > 0) {
            arrivedInfos.push({ performance_day: reservation.performance_day,
                                payment_no: reservation.payment_no});
        }
        const key : string = `${reservation.performance_day}_${reservation.payment_no}`;
        if (refundedInfo.hasOwnProperty(key) === false) {
            if (reservation.performance_ttts_extension.refund_status === PerformanceUtil.REFUND_STATUS.COMPLETE) {
                refundedInfo[key] = reservation._id.toString();
            }
        }
    });

    // 入塔済判定
    const isArrived = (reservation: any): boolean => {
        for (const arrivedInfo of arrivedInfos) {
            if (arrivedInfo.performance_day === reservation.performance_day &&
                arrivedInfo.payment_no === reservation.payment_no) {
                    return true;
            }
        }
        return false;
    };

    // 更新対象の予約IDセット
    const ids: any = [];
    reservations.map((reservation: any) => {
        if (isArrived(reservation) === false) {
            ids.push(reservation._id);
        }
    });

    //対象予約(checkinsのない購入番号)の返金ステータスを更新する。
    const now = moment().format('YYYY/MM/DD HH:mm:ss');
    await Models.Reservation.update(
        {
            _id: { $in: ids}
        },
        {
            $set: {
                'performance_ttts_extension.refund_status': PerformanceUtil.REFUND_STATUS.INSTRUCTED,
                'performance_ttts_extension.refund_update_user': staffUser,
                'performance_ttts_extension.refund_update_at': now
            }
        },
        {
            multi: true
        }
    ).exec();

    // パフォーマンス更新
    await Models.Performance.findOneAndUpdate(
        {
            _id: performanceId
        },
        {
            $set: {
                'ttts_extension.refunded_count' : Object.keys(refundedInfo).length,
                'ttts_extension.refund_status': PerformanceUtil.REFUND_STATUS.INSTRUCTED,
                'ttts_extension.refund_update_user': staffUser,
                'ttts_extension.refund_update_at': now
            }
        },
        {
            new: true
        }
    ).exec();
}
