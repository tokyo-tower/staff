"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req) => {
    // 決済手段
    req.checkBody('paymentMethod', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.paymentMethod') }))
        .notEmpty();
};
