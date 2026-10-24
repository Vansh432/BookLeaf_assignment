import { Router } from 'express';
import authenticate from '../../middlewares/auth.js';
import { loginLimiter } from '../../middlewares/rateLimiter.js';
import validate from '../../middlewares/validation.js';
import * as authController from './auth.controller.js';
import { loginSchema } from './auth.validation.js';

const router = Router();

router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export default router;
