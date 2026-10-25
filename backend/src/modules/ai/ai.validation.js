import { z } from 'zod';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 366;

// Inclusive calendar dates (YYYY-MM-DD, UTC); defaults to the last 30 days.
export const usageQuerySchema = z
  .object({
    from: z.iso.date().transform((value) => new Date(value)).optional(),
    to: z.iso
      .date()
      .transform((value) => new Date(new Date(value).getTime() + ONE_DAY_MS))
      .optional(),
    // Evaluation runs (npm run eval:live) are tagged eval-*; excluded unless asked for, so they never
    // inflate production metrics.
    includeEvaluation: z.stringbool().default(false),
  })
  .transform(({ from, to = new Date(), includeEvaluation }) => ({
    from: from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * ONE_DAY_MS),
    to,
    includeEvaluation,
  }))
  .refine(({ from, to }) => from < to, { message: '"from" must be on or before "to"', path: ['from'] })
  .refine(({ from, to }) => to - from <= MAX_WINDOW_DAYS * ONE_DAY_MS, {
    message: `The window cannot exceed ${MAX_WINDOW_DAYS} days`,
    path: ['from'],
  });
