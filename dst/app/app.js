"use strict";
/**
 * expressアプリケーション
 */
const middlewares = require("@motionpicture/express-middleware");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const express = require("express");
// tslint:disable-next-line:no-require-imports
const partials = require("express-partials");
const expressValidator = require("express-validator");
const i18n = require("i18n");
const multer = require("multer");
const favicon = require("serve-favicon");
const authentication_1 = require("./middlewares/authentication");
const errorHandler_1 = require("./middlewares/errorHandler");
const notFoundHandler_1 = require("./middlewares/notFoundHandler");
const session_1 = require("./middlewares/session");
const setLocals_1 = require("./middlewares/setLocals");
const api_1 = require("./routes/api");
const auth_1 = require("./routes/auth");
const router_1 = require("./routes/router");
const staff_1 = require("./routes/staff");
const app = express();
app.use(middlewares.basicAuth({
    name: process.env.BASIC_AUTH_NAME,
    pass: process.env.BASIC_AUTH_PASS
}));
app.use(partials()); // レイアウト&パーシャルサポート
app.use(session_1.default); // セッション
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
// i18n を利用する設定
i18n.configure({
    // locales: ['en', 'ja'],
    locales: ['ja'],
    defaultLocale: 'ja',
    directory: `${__dirname}/../../locales`,
    objectNotation: true,
    updateFiles: false // ページのビューで自動的に言語ファイルを更新しない
});
// i18n の設定を有効化
app.use(i18n.init);
// セッションで言語管理
// tslint:disable-next-line:variable-name
// app.use((req, _res, next) => {
//     if (!_.isEmpty((<any>req.session).locale)) {
//         req.setLocale((<any>req.session).locale);
//     }
//     if (!_.isEmpty(req.query.locale)) {
//         req.setLocale(req.query.locale);
//         (<any>req.session).locale = req.query.locale;
//     }
//     next();
// });
app.use(expressValidator()); // バリデーション
app.use(setLocals_1.default); // ローカル変数セット
// ルーティング登録の順序に注意！
app.use(auth_1.default);
app.use(authentication_1.default);
app.use('/api', api_1.default);
app.use('/staff', staff_1.default);
app.use('/', router_1.default);
// 404
app.use(notFoundHandler_1.default);
// error handlers
app.use(errorHandler_1.default);
module.exports = app;
