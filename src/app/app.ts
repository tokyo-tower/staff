/**
 * expressアプリケーション
 */
import * as middlewares from '@motionpicture/express-middleware';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
// tslint:disable-next-line:no-require-imports
import partials = require('express-partials');
import * as expressValidator from 'express-validator';
// import * as i18n from 'i18n';
import * as multer from 'multer';
import * as favicon from 'serve-favicon';

import authentication from './middlewares/authentication';
import errorHandler from './middlewares/errorHandler';
import notFoundHandler from './middlewares/notFoundHandler';
import session from './middlewares/session';
import setLocals from './middlewares/setLocals';

import authRouter from './routes/auth';
import router from './routes/router';

const app = express();

app.use(middlewares.basicAuth({ // ベーシック認証
    name: process.env.BASIC_AUTH_NAME,
    pass: process.env.BASIC_AUTH_PASS
}));

app.use(partials()); // レイアウト&パーシャルサポート

app.use(session); // セッション

// api version
// tslint:disable-next-line:no-require-imports no-var-requires
const packageInfo = require('../../package.json');
app.use((__, res, next) => {
    res.setHeader('x-api-version', <string>packageInfo.version);
    next();
});

// view engine setup
app.set('views', `${__dirname}/../../views`);
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
app.use(favicon(`${__dirname}/../../public/favicon.ico`));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// for parsing multipart/form-data
const storage = multer.memoryStorage();
app.use(multer({ storage: storage }).any());

app.use(cookieParser());
app.use(express.static(`${__dirname}/../../public`));

app.use(expressValidator()); // バリデーション

app.use(setLocals); // ローカル変数セット

// GCPへのリダイレクト指定があれば全てリダイレクト
const APP_STOPPED = process.env.APP_STOPPED === '1';
app.use((__, res, next) => {
    if (APP_STOPPED) {
        res.end('このアプリケーションは停止いたしました。新しい環境をご利用ください。');

        return;
    }

    next();
});

// ルーティング登録の順序に注意！
app.use(authRouter);
app.use(authentication);

app.use(router);

// 404
app.use(notFoundHandler);

// error handlers
app.use(errorHandler);

export = app;
