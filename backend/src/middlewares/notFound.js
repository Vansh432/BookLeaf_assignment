import AppError from '../shared/errors/AppError.js';

const notFound = (req, res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

export default notFound;
