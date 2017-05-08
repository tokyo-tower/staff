"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = (req) => {
    // userId
    req.checkBody('userId', 'ログイン番号が未入力です').notEmpty();
    // password
    req.checkBody('password', 'パスワードが未入力です').notEmpty();
};
