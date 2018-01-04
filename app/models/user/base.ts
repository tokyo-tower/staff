/**
 * ベースユーザークラス
 * @export
 * @class BaseUser
 */
export default class BaseUser {
    public id: string;

    /**
     * サインイン中かどうか
     */
    public isAuthenticated(): boolean {
        return (this.id !== undefined);
    }
}
