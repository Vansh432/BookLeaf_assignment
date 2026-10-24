import AppError from '../shared/errors/AppError.js';

const REQUEST_PARTS = ['params', 'query', 'body'];

// Validates request parts against zod schemas. Parsed (coerced and stripped) values are
// exposed on req.validated because Express 5 makes req.query read-only.
const validate = (schemas) => (req, res, next) => {
  const validated = {};
  const errors = [];

  for (const part of REQUEST_PARTS) {
    if (!schemas[part]) {
      continue;
    }

    const result = schemas[part].safeParse(req[part] ?? {});

    if (result.success) {
      validated[part] = result.data;
    } else {
      errors.push(
        ...result.error.issues.map((issue) => ({
          location: part,
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
  }

  if (errors.length) {
    return next(AppError.badRequest('Validation failed', errors));
  }

  // Merged so a route can chain validators (e.g. params, then body) without losing earlier results.
  req.validated = { ...req.validated, ...validated };
  return next();
};

export default validate;
