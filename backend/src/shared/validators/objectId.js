import { z } from 'zod';

// Stricter than mongoose.isValidObjectId, which also accepts any 12-character string.
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');
