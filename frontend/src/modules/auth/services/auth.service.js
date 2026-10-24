import api from '../../../shared/services/api.js'

export const login = async (credentials) => {
  const { data } = await api.post('/auth/login', credentials)
  return data.user
}

export const getCurrentUser = async () => {
  const { data } = await api.get('/auth/me')
  return data.user
}

export const logout = () => api.post('/auth/logout')
