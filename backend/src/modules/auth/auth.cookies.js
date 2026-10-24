import env from '../../config/env.js';

const ACCESS_COOKIE = 'bl_access';
const REFRESH_COOKIE = 'bl_refresh';

// The refresh cookie is only sent to auth endpoints, which keeps it off every other request.
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: env.cookie.secure,
  sameSite: env.cookie.sameSite,
});

export const readAccessToken = (req) => req.cookies?.[ACCESS_COOKIE];

export const readRefreshToken = (req) => req.cookies?.[REFRESH_COOKIE];

export const setAuthCookies = (res, { accessToken, refreshToken }) => {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions(),
    path: '/',
    maxAge: env.jwt.accessTtlSeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions(),
    path: REFRESH_COOKIE_PATH,
    maxAge: env.jwt.refreshTtlSeconds * 1000,
  });
};

export const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookieOptions(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH });
};
