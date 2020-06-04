import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import StaffUser from '../app/models/user/staff';

declare global {
    namespace Express {
        // tslint:disable-next-line:interface-name
        export interface Request {
            staffUser?: StaffUser;
            tttsAuthClient: tttsapi.auth.OAuth2;
        }

        export interface IGroup {
            name: string;
            description: string;
        }

        interface IStaffUser {
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
