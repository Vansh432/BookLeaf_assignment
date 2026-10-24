import AppError from '../shared/errors/AppError.js';

// Use after `authenticate`: router.get('/', authenticate, authorize(ROLES.ADMIN), handler)
const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return next(AppError.forbidden());
    }
    return next();
  };

export default authorize;
