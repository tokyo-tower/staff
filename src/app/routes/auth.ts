/**
 * 認証ルーティング
 */
import * as express from 'express';
import * as staffAuthController from '../controllers/staff/auth';

const authRouter = express.Router();

authRouter.all('/login', staffAuthController.login);
authRouter.all('/logout', staffAuthController.logout);

export default authRouter;
