import { ADMINS_ROOM, authorRoom, emitToRooms } from '../../config/socket.js';

export const TICKET_CHANGED_EVENT = 'ticket:changed';

export const TICKET_ACTIONS = Object.freeze({
  CREATED: 'created',
  MESSAGE: 'message',
  UPDATED: 'updated',
  ASSIGNED: 'assigned',
  NOTE: 'note',
  CLASSIFIED: 'classified',
});

// Actor for changes made by background jobs rather than a signed-in user.
export const SYSTEM_ACTOR = Object.freeze({ id: 'system', role: 'system' });

// Payloads carry identifiers only. Clients refetch through the REST API, which applies the
// role-based views, so nothing internal (notes, AI output) can leak over the socket.
export const publishTicketChange = ({ ticket, action, actor, adminOnly = false }) => {
  const rooms = adminOnly ? [ADMINS_ROOM] : [ADMINS_ROOM, authorRoom(String(ticket.author))];

  emitToRooms(rooms, TICKET_CHANGED_EVENT, {
    ticketId: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    action,
    actorId: actor.id,
    actorRole: actor.role,
  });
};
