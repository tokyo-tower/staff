/**
 * 内部関係者マイページコントローラー
 * @namespace controller/staff/mypage
 */

import * as ttts from '@motionpicture/ttts-domain';
import { NextFunction, Request, Response } from 'express';

const layout: string = 'layouts/staff/layout';

/**
 * マイページ(予約一覧)
 */
export async function index(__: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const ownerRepo = new ttts.repository.Owner(ttts.mongoose.connection);
        const owners = await ownerRepo.ownerModel.find({}, '_id name', { sort: { _id: 1 } }).exec();
        res.render('staff/mypage/index', {
            owners: owners,
            layout: layout
        });
    } catch (error) {
        next(error);
    }
}
