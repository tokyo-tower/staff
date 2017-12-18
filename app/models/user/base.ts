/**
 * ベースユーザークラス
 *
 * @export
 * @class BaseUser
 */
export default class BaseUser {
    /**
     * サインイン中かどうか
     */
    public isAuthenticated(): boolean {
        return (this.get('id') !== null);
    }

    // tslint:disable-next-line:no-reserved-keywords
    public get(key: string): any {
        return ((<any>this)[key] !== undefined) ? (<any>this)[key] : null;
    }
}
