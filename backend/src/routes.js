import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './modules/auth/auth.route.js';
import bookRoutes from './modules/books/book.route.js';
import ticketRoutes from './modules/tickets/ticket.route.js';
import userRoutes from './modules/users/user.route.js';
import { sendSuccess } from './shared/responses/apiResponse.js';

const MONGOOSE_CONNECTED = 1;

const router = Router();

router.use('/auth', authRoutes);
router.use('/books', bookRoutes);
router.use('/tickets', ticketRoutes);
router.use('/users', userRoutes);

router.get('/health', (req, res) => {
  sendSuccess(res, {
    message: 'Service is healthy',
    data: {
      uptimeSeconds: Math.round(process.uptime()),
      database: mongoose.connection.readyState === MONGOOSE_CONNECTED ? 'connected' : 'disconnected',
    },
  });
});

export default router;
