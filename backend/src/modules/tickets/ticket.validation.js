import { z } from 'zod';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../../config/constants.js';
import { paginationQuerySchema } from '../../shared/pagination/pagination.js';
import { objectIdSchema } from '../../shared/validators/objectId.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const statusSchema = z.enum(Object.values(TICKET_STATUSES));

export const ticketIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const createTicketSchema = z.object({
  // null (or omitted) means "General / Account Level".
  bookId: objectIdSchema.nullable().default(null),
  subject: z
    .string()
    .trim()
    .min(5, 'Subject must be at least 5 characters')
    .max(150, 'Subject must be at most 150 characters'),
  description: z
    .string()
    .trim()
    .min(20, 'Please describe your query in at least 20 characters')
    .max(5000, 'Description must be at most 5000 characters'),
});

export const listTicketsQuerySchema = paginationQuerySchema
  .extend({
    status: statusSchema.optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    // Admin-only filters; the service rejects them for authors.
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assigned: z.enum(['me', 'unassigned']).optional(),
    authorId: objectIdSchema.optional(),
    // Inclusive calendar dates (YYYY-MM-DD) on the ticket's creation time.
    from: z.iso.date().transform((value) => new Date(value)).optional(),
    to: z.iso
      .date()
      .transform((value) => new Date(new Date(value).getTime() + ONE_DAY_MS))
      .optional(),
  })
  .refine((query) => !query.from || !query.to || query.from < query.to, {
    message: '"from" must be on or before "to"',
    path: ['from'],
  });

export const addMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(5000, 'Message must be at most 5000 characters'),
  // Admin-only: lets the team reply and resolve in one step.
  status: statusSchema.optional(),
});

export const updateTicketSchema = z
  .object({
    status: statusSchema.optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'Provide at least one of status, category or priority',
  });

export const addNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(2000, 'Note must be at most 2000 characters'),
});
