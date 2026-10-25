import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { TICKET_CATEGORIES } from '../../config/constants.js';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import logger from '../../config/logger.js';
import { embedPendingChunks, syncKnowledgeChunks } from '../../modules/knowledge/knowledge.service.js';

// Usage: npm run kb:ingest
// Loads the knowledge base into MongoDB and embeds new or changed chunks. Safe to re-run:
// unchanged chunks keep their version and embedding, so repeat runs make no provider calls.

const DATA_FILE = new URL('./data/bookleaf_knowledge_base.json', import.meta.url);

const knowledgeBaseSchema = z.object({
  source: z.string().min(1),
  chunks: z
    .array(
      z.object({
        chunkId: z.string().regex(/^[a-z0-9-]+$/, 'chunkId must be kebab-case'),
        section: z.string().min(1),
        title: z.string().min(1),
        category: z.enum(TICKET_CATEGORIES).nullable(),
        keywords: z.array(z.string().trim().toLowerCase().min(1)),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .refine((chunks) => new Set(chunks.map((chunk) => chunk.chunkId)).size === chunks.length, {
      message: 'chunkId values must be unique',
    }),
});

const ingest = async () => {
  const knowledgeBase = knowledgeBaseSchema.parse(JSON.parse(await readFile(DATA_FILE, 'utf8')));

  await connectDatabase();

  const stats = await syncKnowledgeChunks(knowledgeBase);
  logger.info(
    `Knowledge chunks: ${stats.created} created, ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats.deactivated} deactivated`,
  );

  const { embedded, skipped } = await embedPendingChunks();
  if (skipped) {
    logger.warn(`Embeddings skipped (${skipped}); retrieval will use keyword search`);
  } else {
    logger.info(`Embedded ${embedded} chunk(s)`);
  }
};

try {
  await ingest();
} catch (error) {
  logger.error('Knowledge base ingestion failed', { error: error.message });
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
