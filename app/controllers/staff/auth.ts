/**
 * 内部関係者認証コントローラー
 * @namespace controllers.staff.auth
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as AWS from 'aws-sdk';
import * as crypto from 'crypto';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import * as _ from 'underscore';

import staffLoginForm from '../../forms/staff/staffLoginForm';

const debug = createDebug('ttts-staff:controller:staff:auth');

/**
 * 内部関係者ログイン
 * @method login
 * @returns {Promise<void>}
 */
// tslint:disable-next-line:max-func-body-length
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser !== undefined && req.staffUser.isAuthenticated()) {
        res.redirect('/staff/mypage');

        return;
    }

    try {
        res.locals.userId = '';
        res.locals.password = '';

        if (req.method === 'POST') {
            staffLoginForm(req);
            const validationResult = await req.getValidationResult();
            res.locals.userId = req.body.userId;
            res.locals.password = '';
            res.locals.language = req.body.language;
            res.locals.remember = req.body.remember;
            res.locals.validation = validationResult.array();

            if (validationResult.isEmpty()) {
                // ユーザー認証
                const ownerRepo = new ttts.repository.Owner(ttts.mongoose.connection);
                const owner = await ownerRepo.ownerModel.findOne(
                    {
                        username: req.body.userId,
                        group: ttts.factory.person.Group.Staff
                    }
                ).exec();

                res.locals.userId = req.body.userId;
                res.locals.password = '';
                res.locals.language = req.body.language;
                res.locals.remember = req.body.remember;

                if (owner === null) {
                    res.locals.validation = [
                        { msg: req.__('Invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                    ];
                } else {
                    // パスワードチェック
                    if (owner.get('password_hash') !== ttts.CommonUtil.createHash(req.body.password, owner.get('password_salt'))) {
                        res.locals.validation = [
                            { msg: req.__('Invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                        ];
                    } else {
                        try {
                            // ログイン情報が有効であれば、Cognitoでもログイン
                            (<Express.Session>req.session).cognitoCredentials =
                                await getCognitoCredentials(req.body.userId, req.body.password);
                            debug('cognito credentials published.', (<Express.Session>req.session).cognitoCredentials);
                        } catch (error) {
                            res.locals.validation = [
                                { msg: req.__('Invalid{{fieldName}}', { fieldName: req.__('Form.FieldName.password') }) }
                            ];
                        }

                        const cognitoCredentials = (<Express.Session>req.session).cognitoCredentials;
                        if (cognitoCredentials !== undefined) {
                            const cognitoUser = await getCognitoUser(<string>cognitoCredentials.AccessToken);

                            // ログイン記憶
                            // tslint:disable-next-line:no-suspicious-comment
                            // TODO Cognitoユーザーに合わせて調整
                            // if (req.body.remember === 'on') {
                            //     // トークン生成
                            //     const authentication = await ttts.Models.Authentication.create(
                            //         {
                            //             token: ttts.CommonUtil.createToken(),
                            //             owner: owner.get('id'),
                            //             locale: req.body.language
                            //         }
                            //     );
                            //     // tslint:disable-next-line:no-cookies
                            //     res.cookie(
                            //         'remember_staff',
                            //         authentication.get('token'),
                            //         { path: '/', httpOnly: true, maxAge: 604800000 }
                            //     );
                            // }

                            // ログイン
                            (<Express.Session>req.session).staffUser = cognitoUser;

                            const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/staff/mypage';
                            res.redirect(cb);

                            return;
                        }
                    }
                }
            }
        }

        res.render('staff/auth/login', { layout: 'layouts/staff/login' });
    } catch (error) {
        next(new Error(req.__('UnexpectedError')));
    }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (req.session === undefined) {
            next(new Error(req.__('UnexpectedError')));

            return;
        }

        delete req.session.staffUser;
        await ttts.Models.Authentication.remove({ token: req.cookies.remember_staff }).exec();

        res.clearCookie('remember_staff');
        res.redirect('/staff/mypage');
    } catch (error) {
        next(error);
    }
}

async function getCognitoUser(accesssToken: string) {
    return new Promise<Express.IStaffUser>((resolve, reject) => {
        const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({
            apiVersion: 'latest',
            region: 'ap-northeast-1'
        });

        type CognitoUserAttributeType = AWS.CognitoIdentityServiceProvider.AttributeType;

        cognitoIdentityServiceProvider.getUser(
            {
                AccessToken: accesssToken
            },
            (err, data) => {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    resolve({
                        username: data.Username,
                        // id: <string>(<CognitoUserAttributeType>data.UserAttributes.find((a) => a.Name === 'sub')).Value,
                        familyName: <string>(<CognitoUserAttributeType>data.UserAttributes.find((a) => a.Name === 'family_name')).Value,
                        givenName: <string>(<CognitoUserAttributeType>data.UserAttributes.find((a) => a.Name === 'given_name')).Value,
                        email: <string>(<CognitoUserAttributeType>data.UserAttributes.find((a) => a.Name === 'email')).Value,
                        telephone: <string>(<CognitoUserAttributeType>data.UserAttributes.find((a) => a.Name === 'phone_number')).Value
                    });
                }
            });
    });
}

/**
 * Cognito認証情報を取得する
 * @param {string} username ユーザーネーム
 * @param {string} password パスワード
 */
async function getCognitoCredentials(username: string, password: string) {
    return new Promise<AWS.CognitoIdentityServiceProvider.AuthenticationResultType>((resolve, reject) => {
        const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider({
            region: 'ap-northeast-1',
            accessKeyId: <string>process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: <string>process.env.AWS_SECRET_ACCESS_KEY
        });
        const hash = crypto.createHmac('sha256', <string>process.env.API_CLIENT_SECRET)
            .update(`${username}${<string>process.env.API_CLIENT_ID}`)
            .digest('base64');
        const params = {
            UserPoolId: <string>process.env.COGNITO_USER_POOL_ID,
            ClientId: <string>process.env.API_CLIENT_ID,
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
                USERNAME: username,
                SECRET_HASH: hash,
                PASSWORD: password
            }
            // ClientMetadata?: ClientMetadataType;
            // AnalyticsMetadata?: AnalyticsMetadataType;
            // ContextData?: ContextDataType;
        };

        cognitoidentityserviceprovider.adminInitiateAuth(params, (err, data) => {
            debug('adminInitiateAuth result:', err, data);
            if (err instanceof Error) {
                reject(err);
            } else {
                if (data.AuthenticationResult === undefined) {
                    reject(new Error('Unexpected.'));
                } else {
                    resolve(data.AuthenticationResult);
                }
            }
        });
    });
}

export async function auth(req: Request, res: Response): Promise<void> {
    try {
        if (req.session === undefined) {
            throw new Error('session undefined.');
        }

        res.json({
            success: true,
            token: req.tttsAuthClient.credentials,
            errors: null
        });
    } catch (error) {
        res.json({
            success: false,
            token: null,
            errors: error
        });
    }
}
