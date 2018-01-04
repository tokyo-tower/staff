import BaseUser from './base';

/**
 * 内部関係者ユーザー
 * @export
 * @class StaffUser
 * @extends {BaseUser}
 */
export default class StaffUser extends BaseUser {
    public familyName: string;
    public givenName: string;
    public email: string;
    public telephone: string;
    public username: string;

    public static PARSE(session: Express.Session | undefined): StaffUser {
        const user = new StaffUser();

        // セッション値からオブジェクトにセット
        if (session !== undefined &&
            session.staffUser !== undefined &&
            session.staffUser !== null) {
            Object.keys(session.staffUser).forEach((propertyName) => {
                (<any>user)[propertyName] = (<any>session.staffUser)[propertyName];
            });
        }

        return user;
    }
}
