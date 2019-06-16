"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req) => {
    // choices
    req.checkBody('choices').notEmpty();
};
