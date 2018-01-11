/**
 * expressアプリケーション
 * @module app
 * @global
 */

import * as middlewares from '@motionpicture/express-middleware';
import * as ttts from '@motionpicture/ttts-domain';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
// tslint:disable-next-line:no-require-imports
import partials = require('express-partials');
import * as expressValidator from 'express-validator';
import * as i18n from 'i18n';
import * as multer from 'multer';
import * as favicon from 'serve-favicon';
import * as _ from 'underscore';

import authentication from './middlewares/authentication';
import errorHandler from './middlewares/errorHandler';
import notFoundHandler from './middlewares/notFoundHandler';
import session from './middlewares/session';
import setLocals from './middlewares/setLocals';

import apiRouter from './routes/api';
import authRouter from './routes/auth';
import router from './routes/router';
import staffRouter from './routes/staff';

import mongooseConnectionOptions from '../mongooseConnectionOptions';

const app = express();

app.use(middlewares.basicAuth({ // ベーシック認証
    name: process.env.BASIC_AUTH_NAME,
    pass: process.env.BASIC_AUTH_PASS
}));

app.use(partials()); // レイアウト&パーシャルサポート

app.use(session); // セッション

if (process.env.NODE_ENV !== 'production') {
    // サーバーエラーテスト
    app.get('/500', (req) => {
        // req.on('data', (chunk) => {
        // });

        req.on('end', () => {
            throw new Error('500 manually.');
        });
    });
}

// view engine setup
app.set('views', `${__dirname}/views`);
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
app.use(favicon(`${__dirname}/../public/favicon.ico`));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// for parsing multipart/form-data
const storage = multer.memoryStorage();
app.use(multer({ storage: storage }).any());

app.use(cookieParser());
app.use(express.static(`${__dirname}/../public`));

// i18n を利用する設定
i18n.configure({
    locales: ['en', 'ja'],
    defaultLocale: 'ja',
    directory: `${__dirname}/../locales`,
    objectNotation: true,
    updateFiles: false // ページのビューで自動的に言語ファイルを更新しない
});
// i18n の設定を有効化
app.use(i18n.init);

// セッションで言語管理
// tslint:disable-next-line:variable-name
app.use((req, _res, next) => {
    if (!_.isEmpty((<any>req.session).locale)) {
        req.setLocale((<any>req.session).locale);
    }

    if (!_.isEmpty(req.query.locale)) {
        req.setLocale(req.query.locale);
        (<any>req.session).locale = req.query.locale;
    }

    next();
});

app.use(expressValidator()); // バリデーション

app.use(setLocals); // ローカル変数セット

// ルーティング登録の順序に注意！
app.use('/auth', authRouter);
app.use(authentication);

app.use('/api', apiRouter);
app.use('/staff', staffRouter);
app.use('/', router);

// 404
app.use(notFoundHandler);

// error handlers
app.use(errorHandler);

ttts.mongoose.connect(<string>process.env.MONGOLAB_URI, mongooseConnectionOptions);

export = app;
