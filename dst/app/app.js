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
const multer = require("multer");
const favicon = require("serve-favicon");
const authentication_1 = require("./middlewares/authentication");
const errorHandler_1 = require("./middlewares/errorHandler");
const notFoundHandler_1 = require("./middlewares/notFoundHandler");
const session_1 = require("./middlewares/session");
const setLocals_1 = require("./middlewares/setLocals");
const auth_1 = require("./routes/auth");
const health_1 = require("./routes/health");
const router_1 = require("./routes/router");
const app = express();
app.use(middlewares.basicAuth({
    name: process.env.BASIC_AUTH_NAME,
    pass: process.env.BASIC_AUTH_PASS
}));
app.use(partials()); // レイアウト&パーシャルサポート
app.use(session_1.default); // セッション
// api version
// tslint:disable-next-line:no-require-imports no-var-requires
const packageInfo = require('../../package.json');
app.use((__, res, next) => {
    res.setHeader('x-api-version', packageInfo.version);
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
app.use(setLocals_1.default); // ローカル変数セット
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
app.use('/health', health_1.default);
app.use(auth_1.default);
app.use(authentication_1.default);
app.use(router_1.default);
// 404
app.use(notFoundHandler_1.default);
// error handlers
app.use(errorHandler_1.default);
module.exports = app;
