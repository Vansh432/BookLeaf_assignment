import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import authenticate from '../../middlewares/auth.js';
import { createTicketLimiter } from '../../middlewares/rateLimiter.js';
import authorize from '../../middlewares/role.js';
import validate from '../../middlewares/validation.js';
import * as ticketController from './ticket.controller.js';
import {
  addMessageSchema,
  addNoteSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdParamsSchema,
  updateTicketSchema,
} from './ticket.validation.js';

const router = Router();

const authorOnly = authorize(ROLES.AUTHOR);
const adminOnly = authorize(ROLES.ADMIN);
const anyRole = authorize(ROLES.AUTHOR, ROLES.ADMIN);
const withTicketId = validate({ params: ticketIdParamsSchema });

router.use(authenticate);

router.post('/', authorOnly, createTicketLimiter, validate({ body: createTicketSchema }), ticketController.createTicket);
router.get('/', anyRole, validate({ query: listTicketsQuerySchema }), ticketController.listTickets);
router.get('/:id', anyRole, withTicketId, ticketController.getTicket);
router.post('/:id/messages', anyRole, withTicketId, validate({ body: addMessageSchema }), ticketController.addMessage);

router.patch('/:id', adminOnly, withTicketId, validate({ body: updateTicketSchema }), ticketController.updateTicket);
router.post('/:id/assign', adminOnly, withTicketId, ticketController.assignToSelf);
router.post('/:id/notes', adminOnly, withTicketId, validate({ body: addNoteSchema }), ticketController.addInternalNote);

export default router;
