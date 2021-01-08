/**
 * 認証ルーティング
 */
import * as express from 'express';

import { User } from '../user';

const DEFAULT_CALLBACK = process.env.DEFAULT_CALLBACK;

const authRouter = express.Router();

/**
 * サインイン
 * Cognitoからリダイレクトしてくる
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
authRouter.get(
    '/signIn',
    async (req, res, next) => {
        try {
            // stateにはイベントオブジェクトとして受け取ったリクエストボディが入っている
            const user = User.PARSE(req.session, req.hostname, req.originalUrl);

            await user.signIn(req.query.code);

            user.authClient.setCredentials({
                refresh_token: user.getRefreshToken()
            });
            await user.authClient.refreshAccessToken();

            const loginTicket = user.authClient.verifyIdToken({});
            const profile = loginTicket.payload;
            if (profile === undefined) {
                throw new Error('cannot get profile from id_token');
            }

            // const profile = <IProfile>jwt.decode((<any>authClient.credentials).id_token);
            const group = (Array.isArray(((<any>profile))['cognito:groups']) && (<any>profile)['cognito:groups'].length > 0)
                ? { name: (<any>profile)['cognito:groups'][0], description: '' }
                : { name: '', description: '' };

            // ログイン
            (<Express.Session>req.session).staffUser = {
                sub: profile.sub,
                username: <string>profile['cognito:username'],
                familyName: <string>profile.family_name,
                givenName: <string>profile.given_name,
                email: <string>profile.email,
                telephone: <string>profile.phone_number,
                group: group
            };

            const redirect = (typeof req.query.state === 'string' && req.query.state.length > 0)
                ? req.query.state
                : (typeof DEFAULT_CALLBACK === 'string' && DEFAULT_CALLBACK.length > 0) ? DEFAULT_CALLBACK : '/';
            res.redirect(redirect);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * ログアウト
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
authRouter.get(
    '/logout',
    async (req, res, next) => {
        try {
            const user = User.PARSE(req.session, req.hostname, req.originalUrl);

            user.logout();

            const redirect = (typeof req.query.redirect === 'string' && req.query.redirect.length > 0) ? req.query.redirect : '/';
            res.redirect(redirect);
        } catch (error) {
            next(error);
        }
    }
);

export default authRouter;
