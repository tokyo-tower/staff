"use strict";
/**
 * 404ハンドラーミドルウェア
 */
Object.defineProperty(exports, "__esModule", { value: true });
const http_status_1 = require("http-status");
exports.default = (req, res) => {
    if (req.xhr) {
        res.status(http_status_1.NOT_FOUND).send({ error: 'Not Found.' });
    }
    else {
        res.status(http_status_1.NOT_FOUND);
        res.render('error/notFound', {});
    }
};
