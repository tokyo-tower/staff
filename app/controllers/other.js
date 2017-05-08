"use strict";
/**
 * 静的ページコントローラー
 *
 * @namespace controller/other
 */
Object.defineProperty(exports, "__esModule", { value: true });
function policy(req, res) {
    res.render(`other/policy_${req.getLocale()}`);
}
exports.policy = policy;
function privacy(req, res) {
    res.render(`other/privacy_${req.getLocale()}`);
}
exports.privacy = privacy;
function commercialTransactions(req, res) {
    res.render(`other/commercialTransactions_${req.getLocale()}`);
}
exports.commercialTransactions = commercialTransactions;
