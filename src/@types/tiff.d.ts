import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import { User } from '../app/user';

declare global {
    namespace Express {
        // tslint:disable-next-line:interface-name
        export interface Request {
            staffUser?: User;
            tttsAuthClient: tttsapi.auth.OAuth2;
            project?: {
                id: string;
            };
        }

        export interface IGroup {
            name: string;
            description: string;
        }

        interface IStaffUser {
            sub: string;
            group: IGroup;
            familyName: string;
            givenName: string;
            email: string;
            telephone: string;
            username: string;
        }

        export interface ICredentials {
            accessToken: string;
            expiresIn: number;
            idToken: string;
            refreshToken: string;
            tokenType: string;
        }

        // tslint:disable-next-line:interface-name
        export interface Session {
            staffUser?: IStaffUser;
            cognitoCredentials?: ICredentials;
        }
    }
}
