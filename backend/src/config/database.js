import { setServers } from 'node:dns';
import mongoose from 'mongoose';
import env from './env.js';
import logger from './logger.js';

mongoose.set('strictQuery', true);

export const connectDatabase = async () => {
  if (env.dnsServers.length > 0) {
    setServers(env.dnsServers);
  }
  await mongoose.connect(env.mongodbUri);
  logger.info('MongoDB connected');
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};
