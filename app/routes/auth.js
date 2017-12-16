"use strict";
/**
 * 認証ルーティング
 * @ignore
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const staffAuthController = require("../controllers/staff/auth");
const authRouter = express.Router();
authRouter.all('/login', staffAuthController.login);
authRouter.all('/logout', staffAuthController.logout);
exports.default = authRouter;
