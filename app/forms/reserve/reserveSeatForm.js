"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req) => {
    req.checkBody('seatCodes').notEmpty();
};
