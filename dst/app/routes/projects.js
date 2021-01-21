"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * プロジェクトルーター
 */
const cinerinoapi = require("@cinerino/sdk");
const express = require("express");
const salesReports_1 = require("./salesReports");
const projectsRouter = express.Router();
projectsRouter.all('/:id/*', (req, _, next) => __awaiter(void 0, void 0, void 0, function* () {
    req.project = { id: req.params.id };
    next();
}));
projectsRouter.get('/:id/logo', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    let logo = 'https://s3-ap-northeast-1.amazonaws.com/cinerino/logos/cinerino.png';
    try {
        const projectService = new cinerinoapi.service.Project({
            endpoint: process.env.CINERINO_API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const project = yield projectService.findById({ id: (_a = req.project) === null || _a === void 0 ? void 0 : _a.id });
        if (typeof project.logo === 'string') {
            logo = project.logo;
        }
    }
    catch (error) {
        // tslint:disable-next-line:no-console
        console.error(error);
    }
    res.redirect(logo);
}));
projectsRouter.use('/:id/salesReports', salesReports_1.default);
exports.default = projectsRouter;
