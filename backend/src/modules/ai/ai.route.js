import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import authenticate from '../../middlewares/auth.js';
import authorize from '../../middlewares/role.js';
import validate from '../../middlewares/validation.js';
import * as aiController from './ai.controller.js';
import { usageQuerySchema } from './ai.validation.js';

const router = Router();

// Usage and spend are operational data for the BookLeaf team only.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/usage', validate({ query: usageQuerySchema }), aiController.getUsage);

export default router;
