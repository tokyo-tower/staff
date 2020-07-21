"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.update = void 0;
/**
 * 言語切り替え
 */
function update(req, res) {
    const locale = req.params.locale;
    req.session.locale = locale;
    const cb = (typeof req.query.cb === 'string' && req.query.cb.length > 0) ? decodeURIComponent(req.query.cb) : '/';
    res.redirect(cb);
}
exports.update = update;
