import { parseCookie } from 'cookie';
import { Server } from 'socket.io';
import { readAccessToken } from '../modules/auth/auth.cookies.js';
import { authenticate } from '../modules/auth/auth.service.js';
import { ROLES } from './constants.js';
import env from './env.js';
import logger from './logger.js';

export const ADMINS_ROOM = 'admins';
export const authorRoom = (authorId) => `author:${authorId}`;

// Clients reconnect after refreshing their session when they receive this message.
export const UNAUTHORIZED_SOCKET_ERROR = 'unauthorized';

let io = null;

// Reuses the REST session cookie. WebSocket handshakes are not covered by CORS,
// so the origin is checked explicitly to block cross-site socket hijacking.
const authenticateSocket = async (socket, next) => {
  const { origin, cookie } = socket.handshake.headers;

  if (origin && !env.clientUrls.includes(origin)) {
    return next(new Error('Origin not allowed'));
  }

  try {
    const accessToken = readAccessToken({ cookies: parseCookie(cookie ?? '') });
    socket.data.user = await authenticate(accessToken);
    return next();
  } catch {
    return next(new Error(UNAUTHORIZED_SOCKET_ERROR));
  }
};

export const initSocket = (httpServer) => {
  io = new Server(httpServer, { cors: { origin: env.clientUrls, credentials: true } });
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { user } = socket.data;
    // Authors only ever join their own room, so they can never receive another author's events.
    socket.join(user.role === ROLES.ADMIN ? ADMINS_ROOM : authorRoom(user.id));
    logger.debug(`Socket connected: ${user.role} ${user.id}`);
  });

  return io;
};

// A no-op until the server has started (e.g. in the seed script), so services can emit unconditionally.
export const emitToRooms = (rooms, event, payload) => {
  io?.to(rooms).emit(event, payload);
};
