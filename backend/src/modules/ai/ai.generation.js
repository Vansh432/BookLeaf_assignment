import { FinishReason, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import env from '../../config/env.js';
import { getGeminiClient } from '../../infrastructure/ai/gemini.client.js';
import { AI_ERROR_CODES, AiError } from './ai.errors.js';
import { estimateTokens, runAiCall } from './ai.gateway.js';

export { ThinkingLevel };

// The schema is sent to Gemini for constrained decoding, but values are still validated here:
// the API does not enforce every JSON Schema keyword (e.g. string lengths).
const toResponseSchema = (schema) => {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
};

const toUsage = (metadata = {}) => ({
  inputTokens: metadata.promptTokenCount ?? 0,
  // Thinking tokens are billed as output.
  outputTokens: (metadata.candidatesTokenCount ?? 0) + (metadata.thoughtsTokenCount ?? 0),
  cachedTokens: metadata.cachedContentTokenCount ?? 0,
  estimated: false,
});

const parseStructured = (schema) => (response) => {
  if (response.promptFeedback?.blockReason) {
    throw new AiError(AI_ERROR_CODES.BLOCKED, `Prompt blocked (${response.promptFeedback.blockReason})`);
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === FinishReason.MAX_TOKENS) {
    throw new AiError(AI_ERROR_CODES.TRUNCATED, 'Response hit the output token limit');
  }
  if (finishReason && finishReason !== FinishReason.STOP) {
    throw new AiError(AI_ERROR_CODES.BLOCKED, `Response stopped early (${finishReason})`);
  }

  let data;
  try {
    data = JSON.parse(response.text ?? '');
  } catch {
    throw new AiError(AI_ERROR_CODES.INVALID_OUTPUT, 'Response is not valid JSON');
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AiError(AI_ERROR_CODES.INVALID_OUTPUT, 'Response does not match the expected schema');
  }

  return result.data;
};

/**
 * Asks the generation model for JSON matching a zod schema and returns the validated object.
 * Throws AiError on any failure; callers own the fallback. systemInstruction carries the trusted
 * instructions, prompt carries the (possibly untrusted) ticket content.
 */
export const generateStructured = ({
  operation,
  model = env.ai.generationModel,
  systemInstruction,
  prompt,
  schema,
  maxInputTokens,
  maxOutputTokens,
  thinkingLevel = ThinkingLevel.LOW,
  ticketId,
  correlationId,
  maxAttempts,
}) =>
  runAiCall({
    operation,
    model,
    ticketId,
    correlationId,
    maxAttempts,
    maxInputTokens,
    maxOutputTokens,
    estimatedInputTokens: estimateTokens(systemInstruction) + estimateTokens(prompt),
    execute: async ({ httpOptions }) => {
      const response = await getGeminiClient().models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema: toResponseSchema(schema),
          // Includes thinking tokens, so it also caps reasoning spend.
          maxOutputTokens,
          thinkingConfig: { thinkingLevel },
          httpOptions,
        },
      });
      return { value: response, usage: toUsage(response.usageMetadata) };
    },
    validate: parseStructured(schema),
  });
