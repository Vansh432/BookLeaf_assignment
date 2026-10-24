import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import authenticate from '../../middlewares/auth.js';
import authorize from '../../middlewares/role.js';
import validate from '../../middlewares/validation.js';
import * as userController from './user.controller.js';
import { listAuthorsQuerySchema } from './user.validation.js';

const router = Router();

// Author directory for admin filters; authors never see other authors.
router.get('/authors', authenticate, authorize(ROLES.ADMIN), validate({ query: listAuthorsQuerySchema }), userController.listAuthors);

export default router;
