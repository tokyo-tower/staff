/**
 * ダッシュボードルーター
 */
import * as cinerinoapi from '@cinerino/sdk';
import * as express from 'express';

const dashboardRouter = express.Router();

dashboardRouter.get(
    '/',
    async (req, res, next) => {
        try {
            const projectService = new cinerinoapi.service.Project({
                endpoint: <string>process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient
            });

            const searchProjectsResult = await projectService.search({});
            const projects = searchProjectsResult.data;

            res.render('dashboard', {
                layout: 'layouts/dashboard',
                message: 'Welcome to Cinerino Console!',
                projects: projects,
                extractScripts: true
            });
        } catch (error) {
            next(error);
        }
    });

export default dashboardRouter;
