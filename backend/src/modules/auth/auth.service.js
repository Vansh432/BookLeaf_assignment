import bcrypt from 'bcryptjs';
import logger from '../../config/logger.js';
import AppError from '../../shared/errors/AppError.js';
import User from '../users/user.model.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './auth.tokens.js';

const PROFILE_FIELDS = 'name email role authorCode isActive';
const INVALID_CREDENTIALS = 'Invalid email or password';
const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_PASSWORD_HASH = '$2b$12$/9wHoV6i.oAeFrS0o1bO..ZSrmdptOwejpE3rN1pVjnlIuTJ7WZou';

const toProfile = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  ...(user.authorCode && { authorCode: user.authorCode }),
});

const createTokens = (profile) => ({
  accessToken: signAccessToken(profile),
  refreshToken: signRefreshToken(profile),
});

export const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select(`${PROFILE_FIELDS} +password`);

  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  if (!(await user.comparePassword(password)) || !user.isActive) {
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  const profile = toProfile(user);
  const tokens = createTokens(profile);

  // Only the hash is stored; one active session per user, so a new login replaces the previous one.
  await User.updateOne(
    { _id: user._id },
    { refreshTokenHash: hashToken(tokens.refreshToken), lastLoginAt: new Date() },
  );

  return { user: profile, tokens };
};

export const refreshSession = async (refreshToken) => {
  if (!refreshToken) {
    throw AppError.unauthorized(SESSION_EXPIRED);
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized(SESSION_EXPIRED);
  }

  const tokens = createTokens({ id: payload.sub, role: payload.role });

  // Rotation is atomic: the swap only succeeds if the presented token is still the current one.
  const user = await User.findOneAndUpdate(
    { _id: payload.sub, refreshTokenHash: hashToken(refreshToken), isActive: true },
    { refreshTokenHash: hashToken(tokens.refreshToken) },
    { projection: PROFILE_FIELDS, lean: true },
  );

  if (!user) {
    // A validly signed but already-rotated token means it was replayed, possibly stolen,
    // so the whole session is revoked and the real user must sign in again.
    await User.updateOne({ _id: payload.sub }, { $unset: { refreshTokenHash: 1 } });
    logger.warn('Refresh token reuse detected; session revoked', { userId: payload.sub });
    throw AppError.unauthorized(SESSION_EXPIRED);
  }

  return { user: toProfile(user), tokens };
};

export const logout = async (refreshToken) => {
  if (!refreshToken) {
    return;
  }

  let payload;
  try {
    // An expired token should still end its session, so only the signature is checked.
    payload = verifyRefreshToken(refreshToken, { ignoreExpiration: true });
  } catch {
    logger.warn('Logout called with an invalid refresh token');
    return;
  }

  await User.updateOne(
    { _id: payload.sub, refreshTokenHash: hashToken(refreshToken) },
    { $unset: { refreshTokenHash: 1 } },
  );
};

export const authenticate = async (accessToken) => {
  if (!accessToken) {
    throw AppError.unauthorized();
  }

  let payload;
  try {
    payload = verifyAccessToken(accessToken);
  } catch (error) {
    throw AppError.unauthorized(error.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token');
  }

  // Looked up on every request so a deactivated account loses access immediately,
  // and the role used for authorization always comes from the database.
  const user = await User.findById(payload.sub).select(PROFILE_FIELDS).lean();

  if (!user?.isActive) {
    throw AppError.unauthorized('Account not found or disabled');
  }

  return toProfile(user);
};
