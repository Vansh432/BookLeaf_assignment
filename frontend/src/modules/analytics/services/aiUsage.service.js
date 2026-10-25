import api from '../../../shared/services/api.js'

// Admin-only. Costs in the response are estimates from the API's configured model prices, not invoices.
export const getAiUsage = async (params) => {
  const { data } = await api.get('/ai/usage', { params })
  return data.usage
}
