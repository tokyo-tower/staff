"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const base_1 = require("./base");
/**
 * 当日窓口ユーザー
 *
 * @export
 * @class WindowUser
 * @extends {BaseUser}
 */
class WindowUser extends base_1.default {
    // tslint:disable-next-line:function-name
    static parse(session) {
        const user = new WindowUser();
        // セッション値からオブジェクトにセット
        if (session !== undefined && session.hasOwnProperty(WindowUser.AUTH_SESSION_NAME)) {
            Object.keys(session[WindowUser.AUTH_SESSION_NAME]).forEach((propertyName) => {
                user[propertyName] = session[WindowUser.AUTH_SESSION_NAME][propertyName];
            });
        }
        return user;
    }
}
WindowUser.AUTH_SESSION_NAME = 'CHEVREFrontendWindowAuth';
exports.default = WindowUser;
