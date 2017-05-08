"use strict";
/**
 * エラーハンドラーミドルウェア
 */
Object.defineProperty(exports, "__esModule", { value: true });
const http_status_1 = require("http-status");
exports.default = (err, req, res, __) => {
    console.error(err.message, err.stack);
    if (req.xhr) {
        res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: err.message
        });
    }
    else {
        res.status(http_status_1.INTERNAL_SERVER_ERROR);
        res.render('error/error', {
            message: err.message,
            error: err
        });
    }
};
