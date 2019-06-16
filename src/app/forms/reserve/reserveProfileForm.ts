/**
 * 座席予約購入者情報フォーム
 */
import { Request } from 'express';

export default (req: Request) => {
    // 決済手段
    req.checkBody('paymentMethod', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.paymentMethod') }))
        .notEmpty();
};
