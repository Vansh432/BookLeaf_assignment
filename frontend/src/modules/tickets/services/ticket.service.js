import api from '../../../shared/services/api.js'

// Drafting can take several AI attempts (each up to a minute) on a slow provider day.
const DRAFT_TIMEOUT_MS = 3 * 60 * 1000

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

export const getDraft = async (ticketId) => {
  const { data } = await api.get(`/tickets/${ticketId}/draft`)
  return data.draft
}

// Returns the cached draft when it is still current; otherwise the API generates a new one.
export const requestDraft = async (ticketId, { regenerate = false } = {}) => {
  const { data } = await api.post(`/tickets/${ticketId}/draft`, { regenerate }, { timeout: DRAFT_TIMEOUT_MS })
  return data.draft
}

export const addInternalNote = async (ticketId, payload) => {
  const { data } = await api.post(`/tickets/${ticketId}/notes`, payload)
  return data.ticket
}
