import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import env from './config/env.js';
import errorHandler from './middlewares/errorHandler.js';
import notFound from './middlewares/notFound.js';
import originGuard from './middlewares/originGuard.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import requestLogger from './middlewares/requestLogger.js';
import routes from './routes.js';

const app = express();

// Hosting platforms (Render, Railway) sit behind a proxy; needed for correct client IPs in rate limiting.
app.set('trust proxy', 1);

app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: env.clientUrls, credentials: true }));
app.use(originGuard);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api/v1', apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
