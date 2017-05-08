/**
 * ベンチマークミドルウェア
 *
 * @module benchmarksMiddleware
 */

import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';

const debug = createDebug('chevre-frontend:middlewares:benchmarks');

// tslint:disable-next-line:variable-name
export default (req: Request, _: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'development') {
        const startMemory = process.memoryUsage();
        const startTime = process.hrtime();

        req.on('end', () => {
            const endMemory = process.memoryUsage();
            const memoryUsage = endMemory.rss - startMemory.rss;
            const diff = process.hrtime(startTime);
            debug(
                'process.pid: %s benchmark: took %s seconds and %s nanoseconds. memoryUsage:%s (%s - %s)',
                process.pid, diff[0], diff[1], memoryUsage, startMemory.rss, endMemory.rss
            );
        });
    }

    next();
};
