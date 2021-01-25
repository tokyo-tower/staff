/**
 * プロジェクトルーター
 */
import * as cinerinoapi from '@cinerino/sdk';
import * as express from 'express';

import homeRouter from './home';
import salesReportsRouter from './salesReports';

const projectsRouter = express.Router();

projectsRouter.all(
    '/:id/*',
    async (req, _, next) => {
        req.project = { id: req.params.id };

        next();
    }
);

projectsRouter.get(
    '/:id/logo',
    async (req, res) => {
        let logo = 'https://s3-ap-northeast-1.amazonaws.com/cinerino/logos/cinerino.png';

        try {
            const projectService = new cinerinoapi.service.Project({
                endpoint: <string>process.env.CINERINO_API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const project = await projectService.findById({ id: <string>req.project?.id });

            if (typeof project.logo === 'string') {
                logo = project.logo;
            }
        } catch (error) {
            // tslint:disable-next-line:no-console
            console.error(error);
        }

        res.redirect(logo);
    }
);

projectsRouter.use('/:id/home', homeRouter);
projectsRouter.use('/:id/salesReports', salesReportsRouter);

export default projectsRouter;
