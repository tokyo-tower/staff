/**
 * 代理予約スタッフユーザー
 */
export default class StaffUser {
    public familyName: string;
    public givenName: string;
    public email: string;
    public telephone: string;
    public username: string;

    public static PARSE(session: Express.Session | undefined): StaffUser {
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
    public isAuthenticated(): boolean {
        return (this.username !== undefined);
    }
}
