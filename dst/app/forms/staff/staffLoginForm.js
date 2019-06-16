"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req) => {
    // userId
    req.checkBody('userId', req.__('NoInput{{fieldName}}', { fieldName: 'ID' })).notEmpty();
    // password
    req.checkBody('password', req.__('NoInput{{fieldName}}', { fieldName: 'Password' })).notEmpty();
    // language
    req.checkBody('language', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.language') })).notEmpty();
};
