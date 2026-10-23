import rateLimit from 'express-rate-limit';
import AppError from '../shared/errors/AppError.js';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 500,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => next(AppError.tooManyRequests()),
});
