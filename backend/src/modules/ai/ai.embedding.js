import { AI_OPERATIONS } from '../../config/constants.js';
import env from '../../config/env.js';
import { getGeminiClient } from '../../infrastructure/ai/gemini.client.js';
import { AI_ERROR_CODES, AiError } from './ai.errors.js';
import { estimateTokens, runAiCall } from './ai.gateway.js';

// Keeps each request small enough to stay well inside the provider's request limits.
const MAX_BATCH_SIZE = 20;
// gemini-embedding-2 accepts up to 8,192 tokens per input.
const MAX_TOKENS_PER_INPUT = 8192;

// gemini-embedding-2 takes no taskType; documents and queries are marked with these prefixes instead,
// so stored vectors and query vectors stay comparable.
const documentInput = ({ title, text }) => `title: ${title || 'none'} | text: ${text}`;
const queryInput = (text) => `task: search result | query: ${text}`;

const assertValidVectors = (expectedCount) => (embeddings) => {
  if (embeddings.length !== expectedCount) {
    throw new AiError(AI_ERROR_CODES.INVALID_OUTPUT, `Expected ${expectedCount} embeddings, received ${embeddings.length}`);
  }

  return embeddings.map(({ values }) => {
    if (!Array.isArray(values) || values.length !== env.embeddingDimensions || !values.every(Number.isFinite)) {
      throw new AiError(AI_ERROR_CODES.INVALID_OUTPUT, `Embedding is not a valid ${env.embeddingDimensions}-dimension vector`);
    }
    return values;
  });
};

const embedBatch = (inputs, { ticketId, correlationId } = {}) => {
  // The embedding API reports no token counts, so cost is estimated from text length.
  const estimatedInputTokens = inputs.reduce((total, text) => total + estimateTokens(text), 0);

  return runAiCall({
    operation: AI_OPERATIONS.EMBEDDING,
    model: env.ai.embeddingModel,
    ticketId,
    correlationId,
    estimatedInputTokens,
    maxInputTokens: inputs.length * MAX_TOKENS_PER_INPUT,
    execute: async ({ httpOptions }) => {
      // Each input is wrapped in its own Content: plain strings in one call would be merged into a single embedding.
      const response = await getGeminiClient().models.embedContent({
        model: env.ai.embeddingModel,
        contents: inputs.map((text) => ({ role: 'user', parts: [{ text }] })),
        config: { outputDimensionality: env.embeddingDimensions, httpOptions },
      });
      return {
        value: response.embeddings ?? [],
        usage: { inputTokens: estimatedInputTokens, outputTokens: 0, cachedTokens: 0, estimated: true },
      };
    },
    validate: assertValidVectors(inputs.length),
  });
};

export const isEmbeddingConfigured = () => Boolean(env.embeddingDimensions);

// Batches run one after another to keep provider concurrency (and rate-limit pressure) at one request.
export const embedDocuments = async (documents, options) => {
  const vectors = [];
  for (let start = 0; start < documents.length; start += MAX_BATCH_SIZE) {
    const batch = documents.slice(start, start + MAX_BATCH_SIZE).map(documentInput);
    vectors.push(...(await embedBatch(batch, options)));
  }
  return vectors;
};

export const embedQuery = async (text, options) => {
  const [vector] = await embedBatch([queryInput(text)], options);
  return vector;
};
