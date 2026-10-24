import env from '../config/env.js';
import AppError from '../shared/errors/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF protection for cookie-based auth: browsers always send an Origin header on cross-site
// state-changing requests, so any write from an origin outside CLIENT_URLS is rejected.
// Requests without an Origin (curl, Postman, server-to-server) carry no browser cookies to abuse.
const originGuard = (req, res, next) => {
  const origin = req.get('Origin');

  if (SAFE_METHODS.has(req.method) || !origin || env.clientUrls.includes(origin)) {
    return next();
  }

  return next(AppError.forbidden('Request origin is not allowed'));
};

export default originGuard;
