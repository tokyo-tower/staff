"use strict";
/**
 * 内部関係者ログインフォーム
 *
 * @ignore
 */
Object.defineProperty(exports, "__esModule", { value: true });
//  const SIGNATURE_MAX_LENGTH = 10;
exports.default = (req) => {
    // userId
    req.checkBody('userId', req.__('NoInput{{fieldName}}', { fieldName: 'ID' })).notEmpty();
    // password
    req.checkBody('password', req.__('NoInput{{fieldName}}', { fieldName: 'Password' })).notEmpty();
    // language
    req.checkBody('language', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.language') })).notEmpty();
};
