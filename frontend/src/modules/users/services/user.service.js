import api from '../../../shared/services/api.js'

// withStats: true adds profile details and book/ticket totals (the admin author directory).
export const getAuthors = async (params) => {
  const { data } = await api.get('/users/authors', { params })
  return data
}

export const getAuthor = async (authorId) => {
  const { data } = await api.get(`/users/authors/${authorId}`)
  return data.author
}
