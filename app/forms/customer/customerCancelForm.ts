/**
 * 一般座席予約キャンセルフォーム
 *
 * @ignore
 */
import { Request } from 'express';

const TEL_MAX_LENGTH = 4;
const TEL_MIN_LENGTH = 4;

export default (req: Request) => {
    // paymentNo
    req.checkBody(
        'paymentNo',
        req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.userId') })
    ).notEmpty();

    // last4DigitsOfTel
    req.checkBody(
        'last4DigitsOfTel',
        req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.last4DigitsOfTel') })
    ).notEmpty();
    req.checkBody(
        'last4DigitsOfTel',
        req.__(
            'Message.regexTelRange{{fieldName}}{{min}}{{max}}',
            { fieldName: req.__('Form.FieldName.last4DigitsOfTel'), min: String(TEL_MIN_LENGTH), max: String(TEL_MAX_LENGTH) }
        )
    ).matches(/^[0-9]{4}$/);
};
