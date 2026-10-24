import api from '../../../shared/services/api.js'

export const getTickets = async (params) => {
  const { data } = await api.get('/tickets', { params })
  return data
}

export const getTicket = async (ticketId) => {
  const { data } = await api.get(`/tickets/${ticketId}`)
  return data.ticket
}

export const createTicket = async (payload) => {
  const { data } = await api.post('/tickets', payload)
  return data.ticket
}

export const addMessage = async (ticketId, payload) => {
  const { data } = await api.post(`/tickets/${ticketId}/messages`, payload)
  return data.ticket
}

export const updateTicket = async (ticketId, changes) => {
  const { data } = await api.patch(`/tickets/${ticketId}`, changes)
  return data.ticket
}

export const assignToSelf = async (ticketId) => {
  const { data } = await api.post(`/tickets/${ticketId}/assign`)
  return data.ticket
}

export const addInternalNote = async (ticketId, payload) => {
  const { data } = await api.post(`/tickets/${ticketId}/notes`, payload)
  return data.ticket
}
