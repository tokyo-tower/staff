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
const EV_SERVICE_STATUS_NAMES: any = { 0: '', 1: '減速', 2: '停止' };
const REFUND_STATUS_NAMES: any = { 0: '', 1: '未指示', 2: '指示済', 3: '返金済' };
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
 * マイページ予約検索
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
        // データ検索(検索→ソート→指定ページ分切取り)
        // infoP.dicPerformances{ 2017/11/11/12:00:00 : [performance1, performancen] }
        // infoR.dicResevations { 2017/11/11/12:00:00 : [resevation1, resevationn] }
        const infoP = await getPerformances(conditions, limit, page);
        const count: number = infoP.count;
        let infoR : any = {};
        if ( count > 0 ) {
            infoR = await getResevations(conditionsR, infoP.dicPerformances);
        }
        // データから表示用の一覧を作成
        const suspensionList = getSuspensionList(infoP, infoR);
        res.json({
            success: true,
            results: suspensionList,
            count: infoP.count,
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
    // info {
    //    count: 10
    //    dicP: { "2017/11/01 12:00:00": [p1,p2,,,pn]}
    //    dicR: { "2017/11/01 12:00:00": [r1,r2,,,rn]}
    // }
    const info: any = { count: 0, dicPerformances: {}};
    // 総数検索
    info.count = await Models.Performance.count({ $and: conditions }).exec();
    if (info.count <= 0) {
        return info;
    }
    // データ検索
    const performances = <any[]>await Models.Performance
        .find({
            $and: conditions
        })
        .sort({
            'ttts_extension.online_sales_update_at': -1,
            day: 1,
            start_time: 1
        })
        .exec();

    // { 2017/11/11/12:00:00 : [performance1,performancen] }
    const dicPerformances: any = {};
    let updateAtArray: string[] = [];
    for (const performance of performances) {
        const key: string = performance.ttts_extension.online_sales_update_at;
        if (!dicPerformances.hasOwnProperty(key)) {
            dicPerformances[key] = [];
            updateAtArray.push(key);
        }
        //dicPerformances[key].push(performance._id.toString());
        dicPerformances[key].push(performance);
    }
    // 対象ページ分を切り取る
    // @@@@データ3行と4行、psge=1と2でテスト！！@@@
    const start: number =  limit * (page - 1);
    if ( start >= updateAtArray.length) {
        return info;
    }
    updateAtArray = updateAtArray.splice(start, limit);
    // 対象ページのパフォーマンス情報をセット
    for (const updateAt of updateAtArray) {
        info.dicPerformances[updateAt] = dicPerformances[updateAt];
    }
    return info;
}
/**
 * 予約情報取得
 *
 * @param {any} conditions
 * @param {any} dicPerformances
 * @return {any}
 */
async function getResevations(conditions: any,
                              dicPerformances: any): Promise<any> {

    const info: any = { dicReservations: {}};
    // 予約情報取得
    // { 2017/11/11/12:00:00 : [reservation1,reservationn] }
    conditions.status = ReservationUtil.STATUS_RESERVED;
    const dicReservations: any = {};
    const promises = Object.keys(dicPerformances).map(async(key: string) => {
        const ids: string[] = [];
        // 販売停止日時ごとにidをセット
        const performances = dicPerformances[key];
        for (const performance of performances) {
            ids.push(performance._id.toString());
        }
        conditions.performance = {$in: ids};
        if (!dicReservations.hasOwnProperty(key)) {
            dicReservations[key] = [];
        }
        // 販売停止日時ごとに予約情報取得
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
 * @param {any} infoP
 * @param {any} infoR
 * @return {any}
 */
function getSuspensionList(infoP: any,
                           infoR: any): any {
    const suspensionList: any[] = [];
    for (const key of Object.keys(infoP.dicPerformances)) {
        const suspension: any = {};
        const performanceTop: any = infoP.dicPerformances[key][0];
        const reservationTop: any = infoR.dicReservations[key][0];
        // 販売停止処理日時
        suspension.online_sales_update_at = key;
        // 処理実施者
        suspension.online_sales_update_user = performanceTop.ttts_extension.online_sales_update_user;
        // 対象ツアー年月日
        suspension.performance_day = moment(performanceTop.day, 'YYYYMMDD').format('YYYY/MM/DD');
        // 対象ツアーNo
        suspension.tour_number = getTourNumberString(infoP.dicPerformances[key]);
        // 運転状況
        suspension.online_sales_status = EV_SERVICE_STATUS_NAMES[performanceTop.ttts_extension.ev_service_status];
        // キャンセル対象予約数
        suspension.canceled = infoR.dicReservations[key].length;
        // 来塔数
        suspension.arrived = getArrivedCount(infoR.dicReservations[key]);
        // 返金状態
        suspension.refund_status = REFUND_STATUS_NAMES[reservationTop.reservation_ttts_extension.refund_status];
        // 返金済数
        suspension.refunded = getRefundedCount(infoR.dicReservations[key]);
        suspensionList.push(suspension);
    }
    return suspensionList;
}
/**
 * ツアーナンバー編集
 * 例：'91,92'
 *
 * @param {any} performances
 * @return {any}
 */
function getTourNumberString(performances: any[]): string {
    const tourNumbers: string[] = [];
    for (const performance of performances) {
        const tourNumber: string = isNaN((<any>performance).ttts_extension.tour_number) ?
            '' : Number((<any>performance).ttts_extension.tour_number).toString()
        tourNumbers.push(tourNumber);
    }
    return tourNumbers.join(',');
}
/**
 * 来塔数取得
 *
 * @param {any} reservations
 * @return {number}
 */
function getArrivedCount(reservations: any[]): number {
    const arrived = reservations.find((reservation: any) => (reservation.checkins.length > 0));

    return (arrived === undefined) ? 0 : arrived.length;
}
/**
 * 返金済数取得
 *
 * @param {any} reservations
 * @return {number}
 */
function getRefundedCount(reservations: any[]): number {
    const refunded = reservations.find((reservation: any) =>
        (reservation.reservation_ttts_extension.refund_status === ReservationUtil.REFUND_STATUS.COMPLETE));

    return (refunded === undefined) ? 0 : refunded.length;
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
        value2 = convert ? moment(value2, 'YYYY/MM/DD').format('YYYY/MM/DD HH:mm:ss') : value2;
        conditionsFromTo.$lte = value2;
    }

    return conditionsFromTo;
}
// /**
//  * 運行・オンライン販売停止一覧検索画面検証
//  *
//  * @param {any} req
//  * @return {any}
//  */
// async function validate(req: Request): Promise<any> {
//     // 販売停止処理日
//     req.checkQuery('input_onlinedate1', req.__('Message.required{{fieldName}}', { fieldName: req.__('Label.Day') })).notEmpty();

//     // 検証
//     const validatorResult = await req.getValidationResult();
//     //const errors = (!validatorResult.isEmpty()) ? req.validationErrors(true) : {};

//     return (!validatorResult.isEmpty()) ? req.validationErrors(true) : {};

//     // // 片方入力エラーチェック
//     // if (!isInputEven(req.query.start_hour1, req.query.start_minute1)) {
//     //     (<any>errors).start_hour1 = {msg: '時分Fromが片方しか指定されていません'};
//     // }
//     // if (!isInputEven(req.query.start_hour2, req.query.start_minute2)) {
//     //     (<any>errors).start_hour2 = {msg: '時分Toが片方しか指定されていません'};
//     // }
//     // return errors;
// }
