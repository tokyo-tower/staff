/**
 * 内部関係者ログインフォーム
 *
 * @ignore
 */

import { Request } from 'express';

//  const SIGNATURE_MAX_LENGTH = 10;

export default (req: Request) => {
    // userId
    req.checkBody('userId', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.userId') })).notEmpty();

    // password
    req.checkBody('password', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.password') })).notEmpty();

    // language
    req.checkBody('language', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.language') })).notEmpty();

    // signature
    //req.checkBody('signature', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.signature') })).notEmpty();
    // req.checkBody(
    //     'signature',
    //     req.__(
    //         'MaxLength{{fieldName}}{{max}}',
    //         { fieldName: req.__('Form.FieldName.signature'), max: SIGNATURE_MAX_LENGTH.toString() }
    //     )
    // ).isLength({
    //     max: SIGNATURE_MAX_LENGTH
    // });
};
