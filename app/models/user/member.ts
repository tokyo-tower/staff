import BaseUser from './base';

/**
 * メルマガ会員ユーザー
 *
 * @export
 * @class MemberUser
 * @extends {BaseUser}
 */
export default class MemberUser extends BaseUser {
    public static AUTH_SESSION_NAME: string = 'CHEVREFrontendMemberAuth';

    // tslint:disable-next-line:function-name
    public static parse(session: Express.Session | undefined): MemberUser {
        const user = new MemberUser();

        // セッション値からオブジェクトにセット
        if (session !== undefined && session.hasOwnProperty(MemberUser.AUTH_SESSION_NAME)) {
            Object.keys(session[MemberUser.AUTH_SESSION_NAME]).forEach((propertyName) => {
                (<any>user)[propertyName] = session[MemberUser.AUTH_SESSION_NAME][propertyName];
            });
        }

        return user;
    }
}
