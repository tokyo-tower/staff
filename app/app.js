"use strict";
/**
 * expressアプリケーション
 *
 * @module app
 * @global
 */
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const express = require("express");
// tslint:disable-next-line:no-require-imports
const partials = require("express-partials");
const i18n = require("i18n");
const mongoose = require("mongoose");
const multer = require("multer");
const favicon = require("serve-favicon");
const _ = require("underscore");
// tslint:disable-next-line:no-require-imports
const expressValidator = require("express-validator");
const basicAuth_1 = require("./middlewares/basicAuth");
const benchmarks_1 = require("./middlewares/benchmarks");
const errorHandler_1 = require("./middlewares/errorHandler");
const notFoundHandler_1 = require("./middlewares/notFoundHandler");
const session_1 = require("./middlewares/session");
const setLocals_1 = require("./middlewares/setLocals");
const customer_1 = require("./routes/customer");
const router_1 = require("./routes/router");
const staff_1 = require("./routes/staff");
const window_1 = require("./routes/window");
const app = express();
app.use(partials()); // レイアウト&パーシャルサポート
app.use(benchmarks_1.default); // ベンチマーク的な
app.use(session_1.default); // セッション
app.use(basicAuth_1.default); // ベーシック認証
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
app.use(favicon(__dirname + '/../public/favicon.ico'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
// for parsing multipart/form-data
const storage = multer.memoryStorage();
app.use(multer({ storage: storage }).any());
app.use(cookieParser());
app.use(express.static(__dirname + '/../public'));
// i18n を利用する設定
i18n.configure({
    locales: ['en', 'ja'],
    defaultLocale: 'ja',
    directory: __dirname + '/../locales',
    objectNotation: true,
    updateFiles: false // ページのビューで自動的に言語ファイルを更新しない
});
// i18n の設定を有効化
app.use(i18n.init);
// セッションで言語管理
// tslint:disable-next-line:variable-name
app.use((req, _res, next) => {
    if (!_.isEmpty(req.session.locale)) {
        req.setLocale(req.session.locale);
    }
    if (!_.isEmpty(req.query.locale)) {
        req.setLocale(req.query.locale);
        req.session.locale = req.query.locale;
    }
    next();
});
app.use(expressValidator()); // バリデーション
app.use(setLocals_1.default); // ローカル変数セット
// ルーティング登録の順序に注意！
app.use('/customer', customer_1.default);
app.use('/staff', staff_1.default);
app.use('/window', window_1.default);
app.use('/', router_1.default);
// 404
app.use(notFoundHandler_1.default);
// error handlers
app.use(errorHandler_1.default);
/*
 * Mongoose by default sets the auto_reconnect option to true.
 * We recommend setting socket options at both the server and replica set level.
 * We recommend a 30 second connection timeout because it allows for
 * plenty of time in most operating environments.
 */
const MONGOLAB_URI = process.env.MONGOLAB_URI;
// Use native promises
mongoose.Promise = global.Promise;
mongoose.connect(MONGOLAB_URI, {
    server: { socketOptions: { keepAlive: 300000, connectTimeoutMS: 30000 } },
    replset: { socketOptions: { keepAlive: 300000, connectTimeoutMS: 30000 } }
});
module.exports = app;
