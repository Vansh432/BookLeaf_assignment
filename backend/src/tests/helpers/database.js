import { after, before, beforeEach } from 'node:test';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import env from '../../config/env.js';

// Connects to the throwaway test database for the calling test file and empties it before each test.
export const useTestDatabase = () => {
  before(async () => {
    if (!env.mongodbUri.includes('_test')) {
      throw new Error(`Refusing to run tests against a non-test database: ${env.mongodbUri}`);
    }
    await connectDatabase();
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
  });

  after(async () => {
    await disconnectDatabase();
  });
};
