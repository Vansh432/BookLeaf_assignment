import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import authenticate from '../../middlewares/auth.js';
import authorize from '../../middlewares/role.js';
import validate from '../../middlewares/validation.js';
import * as bookController from './book.controller.js';
import { bookIdParamsSchema, listBooksQuerySchema } from './book.validation.js';

const router = Router();

// Both roles may call these; the service scopes results to the author's own books.
router.use(authenticate, authorize(ROLES.AUTHOR, ROLES.ADMIN));

router.get('/', validate({ query: listBooksQuerySchema }), bookController.listBooks);
router.get('/:id', validate({ params: bookIdParamsSchema }), bookController.getBook);

export default router;
