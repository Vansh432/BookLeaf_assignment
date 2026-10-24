import { z } from 'zod';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be 1 or greater').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be 1 or greater')
    .max(MAX_PAGE_SIZE, `limit cannot exceed ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
});

export const paginationStages = ({ page, limit }) => [{ $skip: (page - 1) * limit }, { $limit: limit }];

export const buildPagination = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});
