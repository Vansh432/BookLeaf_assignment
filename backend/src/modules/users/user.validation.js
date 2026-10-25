import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/pagination/pagination.js';
import { objectIdSchema } from '../../shared/validators/objectId.js';

export const listAuthorsQuerySchema = paginationQuerySchema.extend({
  // Matches name, email or author code (e.g. "priya", "AUTH003").
  search: z.string().trim().max(100, 'Search must be at most 100 characters').optional(),
  // Adds profile details and book/ticket totals (the admin author directory).
  withStats: z.stringbool().default(false),
});

export const authorIdParamsSchema = z.object({
  id: objectIdSchema,
});
