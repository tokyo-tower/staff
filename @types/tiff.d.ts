import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import * as ttts from '@motionpicture/ttts-domain';
import * as express from 'express';
import StaffUser from '../app/models/user/staff';

declare global {
    namespace Express {
        export interface Request {
            staffUser?: StaffUser;
            tttsAuthClient: tttsapi.auth.OAuth2;
        }

        interface ITransactionInProgress {
            /**
             * 取引ID(MongoDBで発行される)
             */
            id: string;
            /**
             * 取引主体ID
             */
            agentId: string;
            /**
             * 販売者ID
             */
            seller: ttts.factory.organization.corporation.IOrganization;
            /**
             * 販売者ID
             */
            sellerId: string;
            seatReservationAuthorizeActionId?: string;
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
             * 座席仮予約有効期限ISO8601フォーマット
             */
            expires: string;
            /**
             * パフォーマンス
             */
            performance?: ttts.factory.performance.IPerformanceWithDetails;
            /**
             * 決済方法選択肢
             */
            paymentMethodChoices: string[];
            /**
             * 券種リスト
             */
            ticketTypes: ITicketType[];
            /**
             * スクリーン内の座席グレードリスト
             */
            seatGradeCodesInScreen: string[];
            /**
             * 予約座席コードリスト
             */
            purchaser: IPurchaser;
            /**
             * 決済方法
             */
            paymentMethod: ttts.factory.paymentMethodType;
            /**
             * 購入者区分
             */
            purchaserGroup: string;
            /**
             * GMO取引
             */
            transactionGMO: ITransactionGMO;
            /**
             * 仮予約リスト
             */
            reservations: ttts.factory.action.authorize.seatReservation.ITmpReservation[];
        }

        /**
         * チケット情報インターフェース
         */
        type ITicketType = ttts.factory.offer.seatReservation.ITicketType & {
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

        interface ITransactionGMO {
            orderId: string;
            amount: number;
            count: number;
        }

        interface IStaffUser {
            familyName: string;
            givenName: string;
            email: string;
            telephone: string;
            username: string;
        }

        // tslint:disable-next-line:interface-name
        export interface Session {
            staffUser?: ttts.service.admin.IAdmin;
            cognitoCredentials?: ttts.service.admin.ICredentials;
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
            transactionResult?: ttts.factory.transaction.placeOrder.IResult;
            /**
             * 成立した取引の予約印刷トークン
             */
            printToken?: string;
        }
    }
}
