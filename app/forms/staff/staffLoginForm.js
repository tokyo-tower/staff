"use strict";
/**
 * 内部関係者ログインフォーム
 *
 * @ignore
 */
Object.defineProperty(exports, "__esModule", { value: true });
const SIGNATURE_MAX_LENGTH = 10;
exports.default = (req) => {
    // userId
    req.checkBody('userId', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.userId') })).notEmpty();
    // password
    req.checkBody('password', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.password') })).notEmpty();
    // language
    req.checkBody('language', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.language') })).notEmpty();
    // signature
    req.checkBody('signature', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.signature') })).notEmpty();
    req.checkBody('signature', req.__('Message.maxLength{{fieldName}}{{max}}', { fieldName: req.__('Form.FieldName.signature'), max: SIGNATURE_MAX_LENGTH.toString() })).isLength({
        max: SIGNATURE_MAX_LENGTH
    });
};
