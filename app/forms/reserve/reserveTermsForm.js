"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req) => {
    // isAgree
    req.checkBody('isAgree', req.__('Message.RequiredAgree')).notEmpty();
    req.checkBody('isAgree', 'Message.RequiredAgree').matches(/^on$/);
};
