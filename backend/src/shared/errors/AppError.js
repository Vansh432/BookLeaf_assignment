export default class AppError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
  }

  static badRequest(message = 'Bad request', errors = []) {
    return new AppError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, message);
  }

  static conflict(message = 'Resource already exists', errors = []) {
    return new AppError(409, message, errors);
  }

  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new AppError(429, message);
  }
}
