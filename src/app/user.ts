import * as cinerinoapi from '@cinerino/sdk';

/**
 * 予約管理ユーザー
 */
export class User {
    public familyName: string;
    public givenName: string;
    public email: string;
    public telephone: string;
    public username: string;
    public authClient: cinerinoapi.auth.OAuth2;
    public session: Express.Session;
    public state: string;

    public static PARSE(session: Express.Session | undefined, host: string): User {
        const user = new User();

        user.session = <Express.Session>session;

        // セッション値からオブジェクトにセット
        if (session !== undefined && session.staffUser !== undefined) {
            user.familyName = session.staffUser.familyName;
            user.givenName = session.staffUser.givenName;
            user.email = session.staffUser.email;
            user.telephone = session.staffUser.telephone;
            user.username = session.staffUser.username;
        }

        user.authClient = new cinerinoapi.auth.OAuth2({
            domain: <string>process.env.API_AUTHORIZE_SERVER_DOMAIN,
            clientId: <string>process.env.API_CLIENT_ID,
            clientSecret: <string>process.env.API_CLIENT_SECRET,
            redirectUri: `https://${host}/signIn`,
            logoutUri: `https://${host}/logout`
        });
        user.authClient.setCredentials({ refresh_token: user.getRefreshToken() });

        return user;
    }

    /**
     * サインイン中かどうか
     */
    public isAuthenticated(): boolean {
        return (this.username !== undefined);
    }

    public generateAuthUrl() {
        return this.authClient.generateAuthUrl({
            scopes: [],
            state: this.state,
            codeVerifier: <string>process.env.API_CODE_VERIFIER
        });
    }

    public generateLogoutUrl() {
        return this.authClient.generateLogoutUrl();
    }

    public getRefreshToken(): string | undefined {
        return (this.session !== undefined && this.session !== null
            && this.session.cognitoCredentials !== undefined && this.session.cognitoCredentials !== null)
            ? this.session.cognitoCredentials.refreshToken
            : undefined;
    }

    public async signIn(code: string) {
        // 認証情報を取得できればログイン成功
        const credentials = await this.authClient.getToken(code, <string>process.env.API_CODE_VERIFIER);

        if (credentials.access_token === undefined) {
            throw new Error('Access token is required for credentials.');
        }

        if (credentials.refresh_token === undefined) {
            throw new Error('Refresh token is required for credentials.');
        }

        // リフレッシュトークンを保管
        // this.session.refreshToken = credentials.refresh_token;
        this.session.cognitoCredentials = {
            accessToken: credentials.access_token,
            expiresIn: <number>credentials.expiry_date,
            idToken: <string>credentials.id_token,
            refreshToken: credentials.refresh_token,
            tokenType: <string>credentials.token_type
        };

        return this;
    }

    public logout() {
        // delete this.session.refreshToken;
        delete this.session.staffUser;
        delete this.session.cognitoCredentials;
    }

    // public async retrieveProfile() {
    //     await this.authClient.refreshAccessToken();
    //     this.profile = <IProfile>jwt.decode((<any>this.authClient.credentials).id_token);

    //     return this;
    // }
}
