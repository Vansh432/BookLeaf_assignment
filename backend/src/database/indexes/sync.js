import { setTimeout as sleep } from 'node:timers/promises';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import AiUsage from '../../modules/ai/aiUsage.model.js';
import Book from '../../modules/books/book.model.js';
import KnowledgeChunk from '../../modules/knowledge/knowledge.model.js';
import Ticket from '../../modules/tickets/ticket.model.js';
import User from '../../modules/users/user.model.js';
import { KNOWLEDGE_VECTOR_INDEX, knowledgeVectorIndex } from './vectorSearch.js';

// Usage: npm run db:indexes
// Builds the regular indexes declared on the models, then creates (or updates) the Atlas Vector
// Search index. Safe to re-run: nothing is dropped and an up-to-date index is left alone.

const READY_TIMEOUT_MS = 3 * 60 * 1000;
const READY_POLL_MS = 5000;

const findVectorIndex = async (collection) => {
  try {
    const [index] = await collection.listSearchIndexes(KNOWLEDGE_VECTOR_INDEX).toArray();
    return index ?? null;
  } catch (error) {
    throw new Error(
      `Search indexes are not available on this deployment (${error.message}). ` +
        'Point MONGODB_URI at a MongoDB Atlas cluster to use Vector Search.',
    );
  }
};

const waitUntilQueryable = async (collection) => {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const index = await findVectorIndex(collection);
    if (index?.queryable) {
      return true;
    }
    logger.info(`Vector index status: ${index?.status ?? 'unknown'}; waiting...`);
    await sleep(READY_POLL_MS);
  }

  return false;
};

const syncVectorIndex = async () => {
  const numDimensions = env.embeddingDimensions;

  if (!numDimensions) {
    logger.warn('EMBEDDING_DIMENSIONS is not set; skipping the vector search index until an embedding model is chosen');
    return;
  }

  const { collection } = KnowledgeChunk;
  const { definition } = knowledgeVectorIndex(numDimensions);
  const existing = await findVectorIndex(collection);
  const existingDimensions = existing?.latestDefinition?.fields?.find((field) => field.type === 'vector')?.numDimensions;

  if (!existing) {
    await collection.createSearchIndex(knowledgeVectorIndex(numDimensions));
    logger.info(`Created vector search index "${KNOWLEDGE_VECTOR_INDEX}" (${numDimensions} dimensions)`);
  } else if (existingDimensions !== numDimensions) {
    await collection.updateSearchIndex(KNOWLEDGE_VECTOR_INDEX, definition);
    logger.warn(
      `Updated "${KNOWLEDGE_VECTOR_INDEX}" from ${existingDimensions} to ${numDimensions} dimensions; ` +
        'existing chunk embeddings must be regenerated with the new model',
    );
  } else {
    logger.info(`Vector search index "${KNOWLEDGE_VECTOR_INDEX}" is up to date (${numDimensions} dimensions)`);
  }

  if (await waitUntilQueryable(collection)) {
    logger.info('Vector search index is ready');
  } else {
    logger.warn('Vector search index is still building; Atlas will finish it in the background');
  }
};

const syncIndexes = async () => {
  await connectDatabase();
  // createIndexes also creates missing collections, which a search index requires.
  await Promise.all([User, Book, Ticket, KnowledgeChunk, AiUsage].map((model) => model.createIndexes()));
  logger.info('Regular indexes are in place');
  await syncVectorIndex();
};

try {
  await syncIndexes();
} catch (error) {
  logger.error('Index sync failed', { error: error.message });
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
