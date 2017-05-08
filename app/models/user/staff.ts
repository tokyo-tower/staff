import BaseUser from './base';

/**
 * 内部関係者ユーザー
 *
 * @export
 * @class StaffUser
 * @extends {BaseUser}
 */
export default class StaffUser extends BaseUser {
    public static AUTH_SESSION_NAME: string = 'CHEVREFrontendStaffAuth';

    // tslint:disable-next-line:function-name
    public static parse(session: Express.Session | undefined): StaffUser {
        const user = new StaffUser();

        // セッション値からオブジェクトにセット
        if (session !== undefined && session.hasOwnProperty(StaffUser.AUTH_SESSION_NAME)) {
            Object.keys(session[StaffUser.AUTH_SESSION_NAME]).forEach((propertyName) => {
                (<any>user)[propertyName] = session[StaffUser.AUTH_SESSION_NAME][propertyName];
            });
        }

        return user;
    }
}
