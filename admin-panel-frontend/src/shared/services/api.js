import axios from 'axios'

const REQUEST_TIMEOUT_MS = 20000

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
})

// Unwraps the backend envelope ({ status, message, data }) and turns failures
// ({ status, message, errors }) into one error shape the UI can render.
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const body = error.response?.data
    const apiError = new Error(body?.message || 'Unable to reach the server. Please try again.')
    apiError.statusCode = error.response?.status ?? 0
    apiError.errors = body?.errors ?? []
    return Promise.reject(apiError)
  },
)

export default api
