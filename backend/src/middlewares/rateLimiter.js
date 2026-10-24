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

// Caps ticket creation per client so a script or stuck form cannot flood the support queue.
export const createTicketLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  handler: (req, res, next) =>
    next(AppError.tooManyRequests('You have raised many queries in a short time. Please try again in an hour.')),
});

// Counts only failed attempts, so legitimate users are not locked out after signing in.
export const loginLimiter = rateLimit({
  ...baseOptions,
  limit: 10,
  skipSuccessfulRequests: true,
  handler: (req, res, next) =>
    next(AppError.tooManyRequests('Too many failed sign-in attempts. Please try again in 15 minutes.')),
});
