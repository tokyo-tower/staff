/**
 * ルーティング
 *
 * @ignore
 */
import * as conf from 'config';
import { Request, Response, Router } from 'express';
import * as languageController from '../controllers/language';
import * as reserveController from '../controllers/reserve';

// 本体サイトのトップページの言語別URL
const topUrlByLocale = conf.get<any>('official_url_top_by_locale');
// 本体サイトのプライバシーポリシーページの言語別URL
const privacyPolicyUrlByLocale = conf.get<any>('official_url_privacypolicy_by_locale');
// 本体サイトのお問い合わせページの言語別URL
const contactUrlByLocale = conf.get<any>('official_url_contact_by_locale');

const router = Router();

// 言語
router.get('/language/update/:locale', languageController.update);

router.get('/reserve/getSeatProperties', reserveController.getSeatProperties);
router.get('/reserve/:performanceId/unavailableSeatCodes', reserveController.getUnavailableSeatCodes);

// 利用規約ページ
router.get('/terms/', (req: Request, res: Response) => {
    res.locals.req = req;
    res.locals.conf = conf;
    res.locals.validation = null;
    res.locals.title = 'Tokyo Tower';
    res.locals.description = 'TTTS Terms';
    res.locals.keywords = 'TTTS Terms';

    return res.render('common/terms/');
});

// 本体サイトのプライバシーポリシーページの対応言語版(無ければ英語版)に転送
router.get('/privacypolicy', (req: Request, res: Response) => {
    const locale: string = (req.getLocale()) || 'en';
    const url: string = (privacyPolicyUrlByLocale[locale] || privacyPolicyUrlByLocale.en);

    return res.redirect(url);
});

// 本体サイトのお問い合わせページの対応言語版(無ければ英語版)に転送
router.get('/contact', (req: Request, res: Response) => {
    const locale: string = (req.getLocale()) || 'en';
    const url: string = (contactUrlByLocale[locale] || contactUrlByLocale.en);

    return res.redirect(url);
});

// 本体サイトトップページの対応言語版(無ければ英語版)に転送
router.get('/returntop', (req: Request, res: Response) => {
    const locale: string = (req.getLocale()) || 'en';
    const url: string = (topUrlByLocale[locale] || topUrlByLocale.en);

    return res.redirect(url);
});

export default router;
