import useSocketEvent from '../../../shared/hooks/useSocketEvent.js'

export const TICKET_CHANGED_EVENT = 'ticket:changed'

// Calls `onChange` for ticket events, optionally only for one ticket.
// Events carry ids only; the page refetches so the API applies the viewer's role-based view.
const useTicketChanges = (onChange, ticketId) => {
  useSocketEvent(TICKET_CHANGED_EVENT, (event) => {
    if (!ticketId || event.ticketId === ticketId) {
      onChange(event)
    }
  })
}

export default useTicketChanges
