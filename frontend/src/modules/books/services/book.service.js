import api from '../../../shared/services/api.js'

export const getBooks = async (params) => {
  const { data } = await api.get('/books', { params })
  return data
}
