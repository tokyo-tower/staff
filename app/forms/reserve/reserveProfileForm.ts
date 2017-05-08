/**
 * 座席予約購入者情報フォーム
 *
 * @ignore
 */
import { Request } from 'express';

const NAME_MAX_LENGTH = 15;

export default (req: Request) => {
    // lastName
    req.checkBody('lastName', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.lastName') })).notEmpty();
    req.checkBody(
        'lastName',
        req.__('Message.maxLength{{fieldName}}{{max}}', { fieldName: req.__('Form.FieldName.lastName'), max: NAME_MAX_LENGTH.toString() })
    ).isLength({
        max: NAME_MAX_LENGTH
    });
    req.checkBody(
        'lastName',
        req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.lastName') })
    ).matches(/^[ァ-ロワヲンーa-zA-Z]*$/);

    // firstName
    req.checkBody('firstName', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.firstName') })).notEmpty();
    req.checkBody(
        'firstName',
        req.__('Message.maxLength{{fieldName}}{{max}}', { fieldName: req.__('Form.FieldName.firstName'), max: NAME_MAX_LENGTH.toString() })
    ).isLength({
        max: NAME_MAX_LENGTH
    });
    req.checkBody(
        'firstName',
        req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.firstName') })
    ).matches(/^[ァ-ロワヲンーa-zA-Z]*$/);

    // tel
    req.checkBody('tel', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.tel') })).notEmpty();
    req.checkBody('tel', req.__('Message.regexTel')).matches(/^[0-9]{7,13}$/);

    // email
    req.checkBody('email', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.email') })).notEmpty();
    req.checkBody('email', req.__('Message.invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.email') })).isEmail();
    req.checkBody(
        'email',
        req.__('Message.match{{fieldName}}', { fieldName: req.__('Form.FieldName.email') })
    ).equals(`${req.body.emailConfirm}@${req.body.emailConfirmDomain}`);

    // emailConfirm
    req.checkBody('emailConfirm', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.emailConfirm') })).notEmpty();

    // emailConfirmDomain
    req.checkBody(
        'emailConfirmDomain',
        req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.emailConfirmDomain') })
    ).notEmpty();

    // address
    // req.checkBody('address', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.address') })).notEmpty();

    // paymentMethod
    req.checkBody(
        'paymentMethod',
        req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.paymentMethod') })
    ).notEmpty();

    // age
    req.checkBody('age', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.age') })).notEmpty();

    // gender
    req.checkBody('gender', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.gender') })).notEmpty();
};
