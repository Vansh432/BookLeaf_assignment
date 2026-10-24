import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../../config/env.js';

const TOKEN_ISSUER = 'bookleaf-api';
const ALGORITHM = 'HS256';

const sign = (user, secret, expiresIn, extraOptions = {}) =>
  jwt.sign({ role: user.role }, secret, {
    subject: String(user.id),
    issuer: TOKEN_ISSUER,
    algorithm: ALGORITHM,
    expiresIn,
    ...extraOptions,
  });

const verify = (token, secret, options = {}) =>
  jwt.verify(token, secret, { issuer: TOKEN_ISSUER, algorithms: [ALGORITHM], ...options });

export const signAccessToken = (user) => sign(user, env.jwt.accessSecret, env.jwt.accessTtlSeconds);

// A unique jwtid makes every refresh token distinct, even when two are issued in the same second.
export const signRefreshToken = (user) =>
  sign(user, env.jwt.refreshSecret, env.jwt.refreshTtlSeconds, { jwtid: crypto.randomUUID() });

export const verifyAccessToken = (token) => verify(token, env.jwt.accessSecret);

export const verifyRefreshToken = (token, options) => verify(token, env.jwt.refreshSecret, options);

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
