import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import authenticate from '../../middlewares/auth.js';
import authorize from '../../middlewares/role.js';
import validate from '../../middlewares/validation.js';
import * as userController from './user.controller.js';
import { authorIdParamsSchema, listAuthorsQuerySchema } from './user.validation.js';

const router = Router();

// Author directory and profiles are for the BookLeaf team only; authors never see other authors.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/authors', validate({ query: listAuthorsQuerySchema }), userController.listAuthors);
router.get('/authors/:id', validate({ params: authorIdParamsSchema }), userController.getAuthor);

export default router;
