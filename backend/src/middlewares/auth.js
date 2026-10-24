import { readAccessToken } from '../modules/auth/auth.cookies.js';
import { authenticate as authenticateAccessToken } from '../modules/auth/auth.service.js';

const authenticate = async (req, res, next) => {
  req.user = await authenticateAccessToken(readAccessToken(req));
  next();
};

export default authenticate;
