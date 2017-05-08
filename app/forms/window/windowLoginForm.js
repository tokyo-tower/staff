"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req) => {
    // userId
    req.checkBody('userId', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.userId') })).notEmpty();
    // password
    req.checkBody('password', req.__('Message.required{{fieldName}}', { fieldName: req.__('Form.FieldName.password') })).notEmpty();
};
