import { z } from 'zod';

export const requestDraftSchema = z.object({
  // true discards the cached draft even if it is still current.
  regenerate: z.boolean().default(false),
});
