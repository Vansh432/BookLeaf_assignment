import { createHash } from 'node:crypto';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { KNOWLEDGE_VECTOR_INDEX } from '../../database/indexes/vectorSearch.js';
import { embedDocuments, embedQuery, isEmbeddingConfigured } from '../ai/ai.embedding.js';
import { isAiConfigured } from '../../infrastructure/ai/gemini.client.js';
import KnowledgeChunk from './knowledge.model.js';

const DEFAULT_RESULT_LIMIT = 4;
const VECTOR_CANDIDATES = 100;
const MAX_CANDIDATES = 10;

const RESULT_FIELDS = 'chunkId section title content category version';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'this', 'that', 'have', 'has', 'was',
  'what', 'when', 'why', 'how', 'can', 'its', 'from', 'still', 'been', 'any', 'our', 'out', 'about',
  // Present in almost every query and chunk, so they carry no signal.
  'book', 'books',
]);

export const RETRIEVAL_METHODS = Object.freeze({ VECTOR: 'vector', KEYWORD: 'keyword' });

// Relevance cut-offs. Vector: gemini-embedding-2 at 768 dimensions, cosine mapped to 0..1 (0.5 = unrelated).
// Measured on the labeled set (npm run eval:live, 2026-10-25): precision@4 0.82, recall 0.95, hit@1 1.0,
// all off-topic queries rejected. Off-topic best scores peaked at 0.79 and the weakest relevant best match
// was 0.826; minScore 0.82 would raise precision to 0.87 but leave almost no margin, so 0.80 is kept.
// Keyword: phrase hits weigh 3, shared words 1 (offline eval: precision 0.76, recall 0.69).
export const RELEVANCE_THRESHOLDS = Object.freeze({
  [RETRIEVAL_METHODS.VECTOR]: Object.freeze({ minScore: 0.8, maxGap: 0.03 }),
  [RETRIEVAL_METHODS.KEYWORD]: Object.freeze({ minScore: 3, minRatio: 0.5 }),
});

const hashChunk = ({ section, title, content, category, keywords }) =>
  createHash('sha256').update(JSON.stringify({ section, title, content, category, keywords })).digest('hex');

// Upserts the source chunks by their stable chunkId. Text changes bump the version, so drafts can
// record exactly which policy wording they were grounded in; chunks dropped from the source are deactivated.
export const syncKnowledgeChunks = async ({ source, chunks }) => {
  const stats = { created: 0, updated: 0, unchanged: 0, deactivated: 0 };

  for (const chunk of chunks) {
    const contentHash = hashChunk(chunk);
    const existing = await KnowledgeChunk.findOne({ chunkId: chunk.chunkId }).select('contentHash active').lean();

    if (!existing) {
      await KnowledgeChunk.create({ ...chunk, source, contentHash });
      stats.created += 1;
    } else if (existing.contentHash !== contentHash || !existing.active) {
      // Conditioned on the hash read above, so a concurrent ingest cannot bump the version twice.
      await KnowledgeChunk.updateOne(
        { _id: existing._id, contentHash: existing.contentHash },
        {
          $set: { ...chunk, source, contentHash, active: true },
          ...(existing.contentHash !== contentHash && { $inc: { version: 1 } }),
        },
      );
      stats.updated += 1;
    } else {
      stats.unchanged += 1;
    }
  }

  const { modifiedCount } = await KnowledgeChunk.updateMany(
    { chunkId: { $nin: chunks.map((chunk) => chunk.chunkId) }, active: true },
    { active: false },
  );
  stats.deactivated = modifiedCount;

  return stats;
};

// Embeds only chunks whose text, embedding model or vector size changed since they were last embedded.
export const embedPendingChunks = async () => {
  if (!isAiConfigured() || !isEmbeddingConfigured()) {
    return { embedded: 0, skipped: 'GEMINI_API_KEY or EMBEDDING_DIMENSIONS is not set' };
  }

  const pending = await KnowledgeChunk.find({
    active: true,
    $or: [
      { $expr: { $ne: ['$embeddedHash', '$contentHash'] } },
      { embeddingModel: { $ne: env.ai.embeddingModel } },
      { $expr: { $ne: [{ $size: { $ifNull: ['$embedding', []] } }, env.embeddingDimensions] } },
    ],
  })
    .select('title content contentHash')
    .lean();

  if (!pending.length) {
    return { embedded: 0 };
  }

  const vectors = await embedDocuments(pending.map(({ title, content }) => ({ title, text: content })));
  const embeddedAt = new Date();

  // Each write is conditioned on the hash that was embedded, so text edited mid-run is never paired with a stale vector.
  await KnowledgeChunk.bulkWrite(
    pending.map((chunk, index) => ({
      updateOne: {
        filter: { _id: chunk._id, contentHash: chunk.contentHash },
        update: {
          $set: {
            embedding: vectors[index],
            embeddingModel: env.ai.embeddingModel,
            embeddedHash: chunk.contentHash,
            embeddedAt,
          },
        },
      },
    })),
  );

  return { embedded: pending.length };
};

const categoryMatch = (category) => (category ? { category: { $in: [category, null] } } : {});

// Query embeddings are not charged to a ticket's call limit: they cost a fraction of a generation call
// and are still covered by the global budget.
const vectorCandidates = async (query, { category, correlationId }) => {
  const queryVector = await embedQuery(query, { correlationId });

  return KnowledgeChunk.aggregate([
    {
      $vectorSearch: {
        index: KNOWLEDGE_VECTOR_INDEX,
        path: 'embedding',
        queryVector,
        numCandidates: VECTOR_CANDIDATES,
        limit: VECTOR_CANDIDATES,
        filter: { active: true },
      },
    },
    { $match: categoryMatch(category) },
    { $limit: MAX_CANDIDATES },
    { $project: { _id: 0, chunkId: 1, section: 1, title: 1, content: 1, category: 1, version: 1, score: { $meta: 'vectorSearchScore' } } },
  ]);
};

const tokenize = (text) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9₹]+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );

// Keyword phrases found in the query weigh most; shared words with the title and body add to the score.
const keywordScore = (query, queryTokens, chunk) => {
  const phraseHits = chunk.keywords.filter((keyword) => query.includes(keyword)).length;
  const chunkTokens = tokenize(`${chunk.title} ${chunk.content}`);
  const sharedTokens = [...queryTokens].filter((token) => chunkTokens.has(token)).length;
  return phraseHits * 3 + sharedTokens;
};

const keywordCandidates = async (query, { category }) => {
  const normalizedQuery = query.toLowerCase();
  const queryTokens = tokenize(query);
  const chunks = await KnowledgeChunk.find({ active: true, ...categoryMatch(category) })
    .select(`${RESULT_FIELDS} keywords`)
    .lean();

  return chunks
    .map(({ _id, keywords, ...chunk }) => ({ ...chunk, score: keywordScore(normalizedQuery, queryTokens, { ...chunk, keywords }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
};

// Best-first candidates with scores, before any relevance cut-off. Vector search when embeddings are
// available; keyword search when they are not, or when the provider or Atlas Search fails, so
// retrieval never blocks a draft.
export const rankKnowledge = async (query, { category = null, correlationId } = {}) => {
  if (isAiConfigured() && isEmbeddingConfigured()) {
    try {
      return { method: RETRIEVAL_METHODS.VECTOR, candidates: await vectorCandidates(query, { category, correlationId }) };
    } catch (error) {
      logger.warn('Vector search failed; using keyword retrieval', { correlationId, error: error.message });
    }
  }

  return { method: RETRIEVAL_METHODS.KEYWORD, candidates: await keywordCandidates(query, { category }) };
};

// Keeps candidates above an absolute floor and close to the best match: tangential chunks only add tokens.
export const selectRelevant = ({ method, candidates }, { limit = DEFAULT_RESULT_LIMIT, thresholds = RELEVANCE_THRESHOLDS[method] } = {}) => {
  if (!candidates.length) {
    return [];
  }

  const best = candidates[0].score;
  const floor =
    method === RETRIEVAL_METHODS.VECTOR
      ? Math.max(thresholds.minScore, best - thresholds.maxGap)
      : Math.max(thresholds.minScore, best * thresholds.minRatio);

  return candidates.filter((chunk) => chunk.score >= floor).slice(0, limit);
};

// An empty result means no relevant policy.
export const searchKnowledge = async (query, { category = null, limit = DEFAULT_RESULT_LIMIT, correlationId } = {}) => {
  const ranked = await rankKnowledge(query, { category, correlationId });
  return { method: ranked.method, chunks: selectRelevant(ranked, { limit }) };
};

// Active chunks by id, for loading fixed guidance and checking whether cited versions are still current.
export const getActiveChunks = (chunkIds) =>
  KnowledgeChunk.find({ chunkId: { $in: chunkIds }, active: true }).select(RESULT_FIELDS).lean();
