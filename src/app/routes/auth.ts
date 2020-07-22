/**
 * 認証ルーティング
 */
import * as express from 'express';

import { User } from '../user';

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
            const user = User.PARSE(req.session, req.hostname);

            await user.signIn(req.query.code);

            user.authClient.setCredentials({
                refresh_token: user.getRefreshToken()
            });
            await user.authClient.refreshAccessToken();

            const loginTicket = user.authClient.verifyIdToken({});
            const profile = (<any>loginTicket).payload;
            if (profile === undefined) {
                throw new Error('cannot get profile from id_token');
            }

            // const profile = <IProfile>jwt.decode((<any>authClient.credentials).id_token);
            const group = (Array.isArray((profile)['cognito:groups']) && profile['cognito:groups'].length > 0)
                ? { name: profile['cognito:groups'][0], description: '' }
                : { name: '', description: '' };

            // ログイン
            (<Express.Session>req.session).staffUser = {
                username: profile['cognito:username'],
                familyName: profile.family_name,
                givenName: profile.given_name,
                email: profile.email,
                telephone: profile.phone_number,
                group: group
            };

            const cb = (typeof req.query.cb === 'string' && req.query.cb.length > 0) ? req.query.cb : '/staff/mypage';
            res.redirect(cb);
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
            const user = User.PARSE(req.session, req.hostname);

            user.logout();
            res.redirect('/');
        } catch (error) {
            next(error);
        }
    }
);

export default authRouter;
