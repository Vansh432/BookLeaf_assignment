import http from 'node:http';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import env from './config/env.js';
import logger from './config/logger.js';

const server = http.createServer(app);

const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
};

const start = async () => {
  try {
    await connectDatabase();
    server.listen(env.port, () => logger.info(`Server listening on port ${env.port} (${env.nodeEnv})`));
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', { reason }));

start();
