import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/pagination/pagination.js';

export const listAuthorsQuerySchema = paginationQuerySchema.extend({
  // Matches name, email or author code (e.g. "priya", "AUTH003").
  search: z.string().trim().max(100, 'Search must be at most 100 characters').optional(),
});
