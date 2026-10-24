import api from '../../../shared/services/api.js'

export const getAuthors = async (params) => {
  const { data } = await api.get('/users/authors', { params })
  return data
}
