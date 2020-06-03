import * as cinerinoapi from '@cinerino/api-nodejs-client';
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as express from 'express';
import StaffUser from '../app/models/user/staff';

declare global {
    namespace Express {
        // tslint:disable-next-line:interface-name
        export interface Request {
            staffUser?: StaffUser;
            tttsAuthClient: tttsapi.auth.OAuth2;
        }

        export interface IPlaceOrderTransactionResult extends cinerinoapi.factory.transaction.placeOrder.IResult {
            paymentNo: string;
            printToken: string;
        }

        /**
         * 進行中の仮予約インターフェース
         */
        interface ITmpReservation {
            /**
             * 予約メモ
             */
            additionalTicketText?: string;
            reservedTicket: {
                /**
                 * 券種
                 */
                ticketType: cinerinoapi.factory.chevre.offer.IOffer;
            };
            /**
             * 単価
             */
            unitPrice: number;
        }

        type IAuthorizeSeatReservationResult =
            cinerinoapi.factory.action.authorize.offer.seatReservation.IResult<cinerinoapi.factory.service.webAPI.Identifier.Chevre>;

        interface ITransactionInProgress {
            /**
             * 取引ID
             */
            id: string;
            expires: string;
            agent?: cinerinoapi.factory.transaction.placeOrder.IAgent;
            seller: cinerinoapi.factory.seller.IOrganization<any>;
            seatReservationAuthorizeActionId?: string;
            /**
             * 座席予約承認結果
             */
            authorizeSeatReservationResult?: IAuthorizeSeatReservationResult;
            creditCardAuthorizeActionId?: string;
            /**
             * 予約対象カテゴリ("0":一般,"1":車椅子)
             */
            category: string;
            /**
             * 購入管理番号
             */
            paymentNo?: string;
            /**
             * パフォーマンス
             */
            performance?: tttsapi.factory.performance.IPerformanceWithDetails;
            /**
             * 決済方法選択肢
             */
            paymentMethodChoices: string[];
            /**
             * 券種リスト
             */
            ticketTypes: ITicketType[];
            purchaser: IPurchaser;
            profile?: cinerinoapi.factory.person.IProfile;
            /**
             * 決済方法
             */
            paymentMethod: string;
            /**
             * 仮予約リスト
             */
            reservations: ITmpReservation[];
        }

        /**
         * チケット情報インターフェース
         */
        type ITicketType = cinerinoapi.factory.chevre.offer.IOffer & {
            count: number;
        };

        /**
         * 購入者情報インターフェース
         */
        interface IPurchaser {
            lastName: string;
            firstName: string;
            tel: string;
            email: string;
            age: string;
            address: string;
            gender: string;
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
            /**
             * 購入者情報(一度入力するとセッションが保持)
             */
            purchaser?: IPurchaser;
            /**
             * 進行中の取引
             */
            transactionInProgress?: ITransactionInProgress;
            /**
             * 成立した取引結果
             */
            transactionResult?: IPlaceOrderTransactionResult;
        }
    }
}
