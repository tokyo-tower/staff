"use strict";
/**
 * 言語コントローラー
 *
 * @namespace controller/language
 */
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
/**
 * 言語切り替え
 */
function update(req, res) {
    const locale = req.params.locale;
    req.session.locale = locale;
    const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/';
    res.redirect(cb);
}
exports.update = update;
