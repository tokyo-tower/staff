"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ベースユーザークラス
 * @export
 * @class BaseUser
 */
class BaseUser {
    /**
     * サインイン中かどうか
     */
    isAuthenticated() {
        return (this.id !== undefined);
    }
}
exports.default = BaseUser;
