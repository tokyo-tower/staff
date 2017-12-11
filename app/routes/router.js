"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ルーティング
 *
 * @ignore
 */
const conf = require("config");
const express_1 = require("express");
const languageController = require("../controllers/language");
const reserveController = require("../controllers/reserve");
// 本体サイトのトップページの言語別URL
const topUrlByLocale = conf.get('official_url_top_by_locale');
// 本体サイトのチケット案内ページの言語別URL
const ticketInfoUrlByLocale = conf.get('official_url_ticketinfo_by_locale');
// 本体サイトの入場案内ページの言語別URL
const aboutEnteringUrlByLocale = conf.get('official_url_aboutentering_by_locale');
// 本体サイトのプライバシーポリシーページの言語別URL
const privacyPolicyUrlByLocale = conf.get('official_url_privacypolicy_by_locale');
// 本体サイトのお問い合わせページの言語別URL
const contactUrlByLocale = conf.get('official_url_contact_by_locale');
const router = express_1.Router();
// 言語
router.get('/language/update/:locale', languageController.update);
router.get('/reserve/getSeatProperties', reserveController.getSeatProperties);
router.get('/reserve/:performanceId/unavailableSeatCodes', reserveController.getUnavailableSeatCodes);
// 利用規約ページ
router.get('/terms/', (req, res) => {
    res.locals.req = req;
    res.locals.conf = conf;
    res.locals.validation = null;
    res.locals.title = 'Tokyo Tower';
    res.locals.description = 'TTTS Terms';
    res.locals.keywords = 'TTTS Terms';
    return res.render('common/terms/');
});
// 本体サイトのチケット案内ページの対応言語版(無ければ英語版)に転送
router.get('/ticketinfo', (req, res) => {
    const locale = (req.getLocale()) || 'en';
    const url = (ticketInfoUrlByLocale[locale] || ticketInfoUrlByLocale.en);
    return res.redirect(url);
});
// 本体サイトの入場案内ページの対応言語版(無ければ英語版)に転送
router.get('/aboutenter', (req, res) => {
    const locale = (req.getLocale()) || 'en';
    const url = (aboutEnteringUrlByLocale[locale] || aboutEnteringUrlByLocale.en);
    return res.redirect(url);
});
// 本体サイトのプライバシーポリシーページの対応言語版(無ければ英語版)に転送
router.get('/privacypolicy', (req, res) => {
    const locale = (req.getLocale()) || 'en';
    const url = (privacyPolicyUrlByLocale[locale] || privacyPolicyUrlByLocale.en);
    return res.redirect(url);
});
// 本体サイトのお問い合わせページの対応言語版(無ければ英語版)に転送
router.get('/contact', (req, res) => {
    const locale = (req.getLocale()) || 'en';
    const url = (contactUrlByLocale[locale] || contactUrlByLocale.en);
    return res.redirect(url);
});
// 本体サイトトップページの対応言語版(無ければ英語版)に転送
router.get('/returntop', (req, res) => {
    const locale = (req.getLocale()) || 'en';
    const url = (topUrlByLocale[locale] || topUrlByLocale.en);
    return res.redirect(url);
});
exports.default = router;
