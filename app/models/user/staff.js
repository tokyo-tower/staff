"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 内部関係者ユーザー
 * @export
 * @class StaffUser
 */
class StaffUser {
    static PARSE(session) {
        const user = new StaffUser();
        // セッション値からオブジェクトにセット
        if (session !== undefined && session.staffUser !== undefined) {
            user.familyName = session.staffUser.familyName;
            user.givenName = session.staffUser.givenName;
            user.email = session.staffUser.email;
            user.telephone = session.staffUser.telephone;
            user.username = session.staffUser.username;
        }
        return user;
    }
    /**
     * サインイン中かどうか
     */
    isAuthenticated() {
        return (this.username !== undefined);
    }
}
exports.default = StaffUser;
