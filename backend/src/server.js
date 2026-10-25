import http from 'node:http';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import env from './config/env.js';
import logger from './config/logger.js';
import { initSocket } from './config/socket.js';
import { startTriageWorker, stopTriageWorker } from './modules/triage/triage.jobs.js';

const server = http.createServer(app);
initSocket(server);


const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down`);
  stopTriageWorker();
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
};

const start = async () => {
  try {
    await connectDatabase();
    // Picks up tickets left pending by a previous run, then keeps sweeping in the background.
    startTriageWorker();
    server.listen(env.port, () => logger.info(`Server listening on port ${env.port} (${env.nodeEnv})`));
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

server.on('error', (error) => {
  logger.error(
    error.code === 'EADDRINUSE' ? `Port ${env.port} is already in use` : 'HTTP server error',
    { error: error.message },
  );
  process.exit(1);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', { reason }));

start();
