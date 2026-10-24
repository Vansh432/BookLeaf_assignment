import { sendSuccess } from '../../shared/responses/apiResponse.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from './auth.cookies.js';
import * as authService from './auth.service.js';

export const login = async (req, res) => {
  const { user, tokens } = await authService.login(req.validated.body);

  setAuthCookies(res, tokens);
  sendSuccess(res, { message: 'Signed in successfully', data: { user } });
};

export const refresh = async (req, res) => {
  try {
    const { user, tokens } = await authService.refreshSession(readRefreshToken(req));
    setAuthCookies(res, tokens);
    sendSuccess(res, { message: 'Session refreshed', data: { user } });
  } catch (error) {
    // Drop stale cookies so the browser stops sending a token that can no longer be used.
    clearAuthCookies(res);
    throw error;
  }
};

export const logout = async (req, res) => {
  await authService.logout(readRefreshToken(req));
  clearAuthCookies(res);
  sendSuccess(res, { message: 'Signed out successfully' });
};

export const me = (req, res) => {
  sendSuccess(res, { message: 'Current user', data: { user: req.user } });
};
