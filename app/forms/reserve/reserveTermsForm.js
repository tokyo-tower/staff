"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req) => {
    // isAgree
    req.checkBody('isAgree', req.__('RequiredAgree')).notEmpty();
    req.checkBody('isAgree', 'RequiredAgree').matches(/^on$/);
};
