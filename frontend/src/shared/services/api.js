import axios from 'axios'

const REQUEST_TIMEOUT_MS = 20000

// These either create or end the session, so a 401 from them must not trigger a refresh.
const NO_REFRESH_URLS = ['/auth/login', '/auth/refresh', '/auth/logout']

// Tokens live in httpOnly cookies set by the API, so they are never readable from JavaScript.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  withCredentials: true,
})

let refreshRequest = null
let sessionExpiredHandler = null

export const onSessionExpired = (handler) => {
  sessionExpiredHandler = handler
}

// Turns failures ({ status, message, errors }) into one error shape the UI can render.
const toApiError = (error) => {
  const body = error.response?.data
  const apiError = new Error(body?.message || 'Unable to reach the server. Please try again.')
  apiError.statusCode = error.response?.status ?? 0
  apiError.errors = body?.errors ?? []
  return apiError
}

// Concurrent 401s share one refresh call, so the refresh token is rotated only once.
const refreshSession = () => {
  refreshRequest ??= api.post('/auth/refresh').finally(() => {
    refreshRequest = null
  })
  return refreshRequest
}

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const { config, response } = error
    const shouldRefresh =
      response?.status === 401 && config && !config.isRetry && !NO_REFRESH_URLS.includes(config.url)

    if (!shouldRefresh) {
      return Promise.reject(toApiError(error))
    }

    try {
      await refreshSession()
    } catch (refreshError) {
      sessionExpiredHandler?.()
      return Promise.reject(refreshError)
    }

    return api({ ...config, isRetry: true })
  },
)

export default api
