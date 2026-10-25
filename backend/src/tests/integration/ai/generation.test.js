import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { z } from 'zod';
import { AI_OPERATIONS, TICKET_CATEGORIES } from '../../../config/constants.js';
import { getGeminiClient } from '../../../infrastructure/ai/gemini.client.js';
import { geminiCircuit } from '../../../modules/ai/ai.circuitBreaker.js';
import { embedDocuments } from '../../../modules/ai/ai.embedding.js';
import { AI_ERROR_CODES } from '../../../modules/ai/ai.errors.js';
import { generateStructured } from '../../../modules/ai/ai.generation.js';
import AiUsage from '../../../modules/ai/aiUsage.model.js';
import { useTestDatabase } from '../../helpers/database.js';

useTestDatabase();

const schema = z.object({ category: z.enum(TICKET_CATEGORIES), confidence: z.number().min(0).max(1) });

const usageMetadata = { promptTokenCount: 120, candidatesTokenCount: 20, thoughtsTokenCount: 30 };

const geminiResponse = ({ text, finishReason = 'STOP' }) => ({
  text,
  candidates: [{ finishReason }],
  usageMetadata,
});

const generate = () =>
  generateStructured({
    operation: AI_OPERATIONS.CLASSIFICATION,
    systemInstruction: 'Classify the ticket.',
    prompt: 'My royalty has not arrived.',
    schema,
    maxInputTokens: 2000,
    maxOutputTokens: 256,
  });

const stubGenerate = (response) => mock.method(getGeminiClient().models, 'generateContent', async () => response);

describe('generateStructured', () => {
  beforeEach(() => {
    geminiCircuit.reset();
    mock.restoreAll();
  });

  it('sends a JSON schema request and returns validated output', async () => {
    const stub = stubGenerate(geminiResponse({ text: '{"category":"Royalty & Payments","confidence":0.9}' }));

    assert.deepEqual(await generate(), { category: 'Royalty & Payments', confidence: 0.9 });

    const { config } = stub.mock.calls[0].arguments[0];
    assert.equal(config.responseMimeType, 'application/json');
    assert.equal(config.responseJsonSchema.$schema, undefined);
    assert.deepEqual(config.responseJsonSchema.properties.category.enum, TICKET_CATEGORIES);
    assert.equal(config.maxOutputTokens, 256);

    // Thinking tokens are billed as output: 120 * 1 + (20 + 30) * 4 micro-USD.
    const usage = await AiUsage.findOne().lean();
    assert.equal(usage.outputTokens, 50);
    assert.equal(usage.costMicroUsd, 320);
  });

  it('rejects output outside the schema', async () => {
    stubGenerate(geminiResponse({ text: '{"category":"Refunds","confidence":0.9}' }));
    await assert.rejects(generate(), { code: AI_ERROR_CODES.INVALID_OUTPUT });
  });

  it('rejects malformed JSON', async () => {
    stubGenerate(geminiResponse({ text: 'not json' }));
    await assert.rejects(generate(), { code: AI_ERROR_CODES.INVALID_OUTPUT });
  });

  it('reports truncated output instead of parsing a partial answer', async () => {
    stubGenerate(geminiResponse({ text: '{"category":"Roy', finishReason: 'MAX_TOKENS' }));
    await assert.rejects(generate(), { code: AI_ERROR_CODES.TRUNCATED });
  });

  it('reports blocked prompts', async () => {
    stubGenerate({ promptFeedback: { blockReason: 'SAFETY' }, usageMetadata });
    await assert.rejects(generate(), { code: AI_ERROR_CODES.BLOCKED });
  });
});

describe('embedDocuments', () => {
  beforeEach(() => {
    geminiCircuit.reset();
    mock.restoreAll();
  });

  it('wraps each input separately and validates vector size', async () => {
    const stub = mock.method(getGeminiClient().models, 'embedContent', async ({ contents }) => ({
      embeddings: contents.map(() => ({ values: [0.1, 0.2, 0.3, 0.4] })),
    }));

    const vectors = await embedDocuments([
      { title: 'A', text: 'one' },
      { title: 'B', text: 'two' },
    ]);

    assert.equal(vectors.length, 2);
    const { contents, config } = stub.mock.calls[0].arguments[0];
    assert.deepEqual(contents[0], { role: 'user', parts: [{ text: 'title: A | text: one' }] });
    assert.equal(config.outputDimensionality, 4);
    assert.equal((await AiUsage.findOne().lean()).tokensEstimated, true);
  });

  it('rejects vectors of the wrong size', async () => {
    mock.method(getGeminiClient().models, 'embedContent', async () => ({ embeddings: [{ values: [0.1, 0.2] }] }));
    await assert.rejects(embedDocuments([{ title: 'A', text: 'one' }]), { code: AI_ERROR_CODES.INVALID_OUTPUT });
  });
});
