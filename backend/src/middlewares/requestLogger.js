import { randomUUID } from 'node:crypto';
import logger from '../config/logger.js';

// Accepts a caller-supplied id only when it is short and harmless, so it can be logged safely.
const SAFE_REQUEST_ID = /^[\w-]{8,64}$/;

const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const incomingId = req.get('X-Request-Id');

  // Correlates this request's logs with the AI calls it triggers (stored as AiUsage.correlationId).
  req.id = incomingId && SAFE_REQUEST_ID.test(incomingId) ? incomingId : randomUUID();
  res.set('X-Request-Id', req.id);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`, { requestId: req.id });
  });

  next();
};

export default requestLogger;
