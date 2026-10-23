import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../config/logger.js';
import AppError from '../shared/errors/AppError.js';
import { sendFailure } from '../shared/responses/apiResponse.js';

const DUPLICATE_KEY_CODE = 11000;

// Converts known library errors into AppError so every failure shares one response shape.
const normalizeError = (error) => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(error.errors).map(({ path, message }) => ({ field: path, message }));
    return AppError.badRequest('Validation failed', errors);
  }

  if (error instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for ${error.path}`);
  }

  if (error.code === DUPLICATE_KEY_CODE) {
    const errors = Object.keys(error.keyValue ?? {}).map((field) => ({ field, message: `${field} already exists` }));
    return AppError.conflict('Duplicate value', errors);
  }

  if (error.type === 'entity.parse.failed') {
    return AppError.badRequest('Malformed JSON in request body');
  }

  if (error.type === 'entity.too.large') {
    return new AppError(413, 'Request body is too large');
  }

  return null;
};

// Express identifies error middleware by its four-argument signature, so `next` must stay.
const errorHandler = (error, req, res, next) => {
  const appError = normalizeError(error);

  if (appError) {
    if (appError.statusCode >= 500) {
      logger.error(appError);
    }
    return sendFailure(res, appError);
  }

  logger.error('Unhandled error', { method: req.method, url: req.originalUrl, stack: error.stack });

  return sendFailure(res, {
    statusCode: 500,
    message: env.isProduction ? 'Something went wrong' : error.message,
  });
};

export default errorHandler;
