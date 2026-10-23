import mongoose from 'mongoose';
import env from './env.js';
import logger from './logger.js';

mongoose.set('strictQuery', true);

export const connectDatabase = async () => {
  await mongoose.connect(env.mongodbUri);
  logger.info('MongoDB connected');
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};
