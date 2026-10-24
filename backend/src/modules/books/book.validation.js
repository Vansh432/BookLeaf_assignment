import { z } from 'zod';
import { BOOK_STATUSES } from '../../config/constants.js';
import { paginationQuerySchema } from '../../shared/pagination/pagination.js';
import { objectIdSchema } from '../../shared/validators/objectId.js';

export const listBooksQuerySchema = paginationQuerySchema.extend({
  status: z.enum(BOOK_STATUSES).optional(),
  // Admin-only filter; the service rejects it for authors.
  authorId: objectIdSchema.optional(),
});

export const bookIdParamsSchema = z.object({
  id: objectIdSchema,
});
