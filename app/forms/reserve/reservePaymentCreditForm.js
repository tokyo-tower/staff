"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req) => {
    // gmoTokenObject
    req.checkBody('gmoTokenObject').notEmpty();
};
