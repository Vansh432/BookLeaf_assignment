import { sendSuccess } from '../../shared/responses/apiResponse.js';
import * as ticketService from './ticket.service.js';

export const createTicket = async (req, res) => {
  const ticket = await ticketService.createTicket(req.user, req.validated.body);
  sendSuccess(res, { statusCode: 201, message: 'Your query has been submitted', data: { ticket } });
};

export const listTickets = async (req, res) => {
  const data = await ticketService.listTickets(req.user, req.validated.query);
  sendSuccess(res, { message: 'Tickets fetched successfully', data });
};

export const getTicket = async (req, res) => {
  const ticket = await ticketService.getTicket(req.user, req.validated.params.id);
  sendSuccess(res, { message: 'Ticket fetched successfully', data: { ticket } });
};

export const addMessage = async (req, res) => {
  const ticket = await ticketService.addMessage(req.user, req.validated.params.id, req.validated.body);
  sendSuccess(res, { statusCode: 201, message: 'Message sent', data: { ticket } });
};

export const updateTicket = async (req, res) => {
  const ticket = await ticketService.updateTicket(req.user, req.validated.params.id, req.validated.body);
  sendSuccess(res, { message: 'Ticket updated', data: { ticket } });
};

export const assignToSelf = async (req, res) => {
  const ticket = await ticketService.assignToSelf(req.user, req.validated.params.id);
  sendSuccess(res, { message: 'Ticket assigned to you', data: { ticket } });
};

export const addInternalNote = async (req, res) => {
  const ticket = await ticketService.addInternalNote(req.user, req.validated.params.id, req.validated.body);
  sendSuccess(res, { statusCode: 201, message: 'Internal note added', data: { ticket } });
};
