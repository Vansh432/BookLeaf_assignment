import { io } from 'socket.io-client'
import { refreshSession } from './api.js'

// Must match the server's rejection message for a missing or expired session.
const UNAUTHORIZED_SOCKET_ERROR = 'unauthorized'

// The socket server shares the API's origin; the session cookie authenticates the handshake.
const socket = io(new URL(import.meta.env.VITE_API_BASE_URL).origin, {
  autoConnect: false,
  withCredentials: true,
})

let hasRetriedAuth = false

// An expired access token rejects the handshake, and Socket.IO does not retry after a
// server-side rejection. Refresh the session once, then reconnect.
socket.on('connect_error', async (error) => {
  if (error.message !== UNAUTHORIZED_SOCKET_ERROR || hasRetriedAuth) {
    return
  }

  hasRetriedAuth = true
  try {
    await refreshSession()
    socket.connect()
  } catch {
    // The session is gone; the API client's session-expired handler signs the user out.
  }
})

socket.on('connect', () => {
  hasRetriedAuth = false
})

export const connectSocket = () => socket.connect()

export const disconnectSocket = () => socket.disconnect()

export default socket
