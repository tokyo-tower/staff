"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const base_1 = require("./base");
/**
 * 内部関係者ユーザー
 * @export
 * @class StaffUser
 * @extends {BaseUser}
 */
class StaffUser extends base_1.default {
    static PARSE(session) {
        const user = new StaffUser();
        // セッション値からオブジェクトにセット
        if (session !== undefined &&
            session.staffUser !== undefined &&
            session.staffUser !== null) {
            Object.keys(session.staffUser).forEach((propertyName) => {
                user[propertyName] = session.staffUser[propertyName];
            });
        }
        return user;
    }
}
exports.default = StaffUser;
