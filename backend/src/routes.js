import { Router } from 'express';
import mongoose from 'mongoose';
import { sendSuccess } from './shared/responses/apiResponse.js';

const MONGOOSE_CONNECTED = 1;

const router = Router();

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
