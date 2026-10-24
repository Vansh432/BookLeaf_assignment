import rateLimit from 'express-rate-limit';
import AppError from '../shared/errors/AppError.js';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const baseOptions = {
  windowMs: FIFTEEN_MINUTES_MS,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
};

export const apiLimiter = rateLimit({
  ...baseOptions,
  limit: 500,
  handler: (req, res, next) => next(AppError.tooManyRequests()),
});

// Counts only failed attempts, so legitimate users are not locked out after signing in.
export const loginLimiter = rateLimit({
  ...baseOptions,
  limit: 10,
  skipSuccessfulRequests: true,
  handler: (req, res, next) =>
    next(AppError.tooManyRequests('Too many failed sign-in attempts. Please try again in 15 minutes.')),
});
