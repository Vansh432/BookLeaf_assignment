import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { ApiError } from '@google/genai';
import { AI_CALL_STATUSES } from '../../config/constants.js';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { isAiConfigured } from '../../infrastructure/ai/gemini.client.js';
import AiUsage from './aiUsage.model.js';
import { claimTicketCall, estimateCostMicroUsd, releaseTicketCall, reserveBudget, settleBudget } from './ai.budget.js';
import { geminiCircuit } from './ai.circuitBreaker.js';
import { acquireRequestSlot } from './ai.rateLimiter.js';
import { AI_ERROR_CODES, AiError, PROVIDER_FAILURE_CODES, REJECTION_CODES } from './ai.errors.js';

const PROVIDER = 'gemini';

// A Retry-After longer than this means the provider wants us gone for a while: fall back instead of waiting.
const MAX_RETRY_AFTER_MS = 30 * 1000;
const MAX_BACKOFF_MS = 8 * 1000;

const TRANSIENT_STATUSES = new Set([408, 500, 502, 503, 504]);

// How long a call may queue for a request slot under AI_REQUESTS_PER_MINUTE before giving up.
const DEFAULT_QUEUE_WAIT_MS = 60 * 1000;

// Rough upper bound used before a call, when real token counts are not known yet.
export const estimateTokens = (text) => Math.ceil(text.length / 3);

const parseRetryAfterMs = (headers) => {
  const value = headers.get('retry-after');
  if (!value) {
    return 0;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(seconds * 1000, 0);
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(date - Date.now(), 0);
};

const toAiError = (error, retryAfterMs) => {
  if (error instanceof AiError) {
    return error;
  }

  if (error instanceof ApiError) {
    if (error.status === 429) {
      return new AiError(AI_ERROR_CODES.RATE_LIMITED, 'AI provider rate limit reached', { retryable: true, retryAfterMs, cause: error });
    }
    if (TRANSIENT_STATUSES.has(error.status)) {
      return new AiError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, `AI provider returned ${error.status}`, { retryable: true, retryAfterMs, cause: error });
    }
    // 400/401/403/404: bad key, unknown model or malformed request. Retrying cannot fix these.
    return new AiError(AI_ERROR_CODES.PROVIDER_REJECTED, `AI provider rejected the request (${error.status})`, { cause: error });
  }

  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return new AiError(AI_ERROR_CODES.TIMEOUT, 'AI provider request timed out', { retryable: true, cause: error });
  }

  // fetch rejects with a TypeError on network failures (DNS, connection reset).
  if (error instanceof TypeError && error.message.includes('fetch failed')) {
    return new AiError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'AI provider is unreachable', { retryable: true, cause: error });
  }

  return new AiError(AI_ERROR_CODES.UNEXPECTED, 'Unexpected AI failure', { cause: error });
};

// Exponential backoff with full jitter, but never sooner than the provider's Retry-After.
export const retryDelayMs = (attempt, retryAfterMs, baseDelayMs = env.ai.retryBaseDelayMs) => {
  const backoff = Math.random() * Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return Math.max(backoff, retryAfterMs);
};

// Per-attempt HTTP options: a timeout, and a fetch wrapper that captures Retry-After, which the SDK's
// errors do not expose.
const createAttemptTransport = () => {
  const transport = { retryAfterMs: 0 };
  transport.httpOptions = {
    timeout: env.ai.requestTimeoutMs,
    fetch: async (url, init) => {
      const response = await fetch(url, init);
      if (!response.ok) {
        transport.retryAfterMs = parseRetryAfterMs(response.headers);
      }
      return response;
    },
  };
  return transport;
};

// Each attempt (retries included) waits for a request slot first, so retries also respect the quota.
const callWithRetries = async (execute, { maxAttempts, onAttempt, acquireSlot }) => {
  for (let attempt = 1; ; attempt += 1) {
    await acquireSlot();
    onAttempt(attempt);
    const transport = createAttemptTransport();

    try {
      return await execute({ httpOptions: transport.httpOptions });
    } catch (error) {
      const aiError = toAiError(error, transport.retryAfterMs);
      const canRetry = aiError.retryable && attempt < maxAttempts && aiError.retryAfterMs <= MAX_RETRY_AFTER_MS;

      if (!canRetry) {
        throw aiError;
      }

      await sleep(retryDelayMs(attempt, aiError.retryAfterMs));
    }
  }
};

const recordUsage = async (record) => {
  try {
    await AiUsage.create({ ...record, provider: PROVIDER });
  } catch (error) {
    // Accounting must never turn a successful AI call into a failure.
    logger.error('Failed to record AI usage', { correlationId: record.correlationId, error: error.message });
  }
};

/**
 * Runs one AI call behind every production guard, in this order: configuration, context size,
 * circuit breaker, per-ticket limit, budget reservation, bounded retries (each queued under the per-minute
 * request limit), output validation, and usage
 * accounting. Any failure is thrown as an AiError so callers can fall back to rules or manual work.
 *
 * execute({ httpOptions }) performs the provider call and resolves to { value, usage }, where usage is
 * { inputTokens, outputTokens, cachedTokens, estimated }. validate(value) turns the raw response into the
 * result, throwing an AiError for unusable output; it runs inside the guards so that cost is still recorded.
 */
export const runAiCall = async ({
  operation,
  model,
  execute,
  validate = (value) => value,
  estimatedInputTokens,
  maxInputTokens,
  maxOutputTokens = 0,
  ticketId = null,
  correlationId = randomUUID(),
  maxAttempts = env.ai.maxAttempts,
  maxQueueWaitMs = DEFAULT_QUEUE_WAIT_MS,
}) => {
  const startedAt = performance.now();
  let attempts = 0;
  let usage = null;
  let reservation = null;
  let ticketClaimed = false;
  let circuitAcquired = false;
  let queuedMs = 0;

  const acquireSlot = async () => {
    const waitStartedAt = performance.now();
    try {
      await acquireRequestSlot(model, { maxWaitMs: maxQueueWaitMs });
    } finally {
      queuedMs += performance.now() - waitStartedAt;
    }
  };

  // Never throws, so accounting problems cannot mask the call's real outcome or settle twice.
  const finish = async (status, failureReason = null) => {
    const costMicroUsd = usage ? estimateCostMicroUsd(model, usage) : 0;

    if (reservation) {
      try {
        await settleBudget(reservation, costMicroUsd);
      } catch (error) {
        logger.error('Failed to settle AI budget reservation', { correlationId, error: error.message });
      }
    }

    await recordUsage({
      operation,
      model,
      status,
      failureReason,
      attempts,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cachedTokens: usage?.cachedTokens ?? 0,
      tokensEstimated: usage?.estimated ?? false,
      costMicroUsd,
      latencyMs: Math.round(performance.now() - startedAt),
      queuedMs: Math.round(queuedMs),
      correlationId,
      ticket: ticketId,
    });
  };

  try {
    if (!isAiConfigured()) {
      throw new AiError(AI_ERROR_CODES.NOT_CONFIGURED, 'AI is not configured');
    }
    if (estimatedInputTokens > maxInputTokens) {
      throw new AiError(AI_ERROR_CODES.INPUT_TOO_LARGE, `Input of ~${estimatedInputTokens} tokens exceeds ${maxInputTokens}`);
    }
    if (!geminiCircuit.tryAcquire()) {
      throw new AiError(AI_ERROR_CODES.CIRCUIT_OPEN, 'AI provider is temporarily disabled after repeated failures');
    }
    circuitAcquired = true;

    if (ticketId) {
      await claimTicketCall(ticketId);
      ticketClaimed = true;
    }
    reservation = await reserveBudget(
      estimateCostMicroUsd(model, { inputTokens: estimatedInputTokens, outputTokens: maxOutputTokens }),
    );

    const raw = await callWithRetries(
      async (transport) => {
        const result = await execute(transport);
        usage = result.usage;
        return result.value;
      },
      {
        maxAttempts,
        onAttempt: (attempt) => {
          attempts = attempt;
        },
        acquireSlot,
      },
    );

    geminiCircuit.recordSuccess();
    const value = await validate(raw);
    await finish(AI_CALL_STATUSES.SUCCESS);
    return value;
  } catch (error) {
    const aiError = toAiError(error);
    const rejected = REJECTION_CODES.has(aiError.code);

    if (PROVIDER_FAILURE_CODES.has(aiError.code)) {
      geminiCircuit.recordFailure();
    } else if (circuitAcquired) {
      // Says nothing about provider health, but a half-open probe slot held by this call must be freed.
      geminiCircuit.recordNeutral();
    }
    if (rejected && ticketClaimed) {
      await releaseTicketCall(ticketId).catch((releaseError) =>
        logger.error('Failed to release AI ticket call', { correlationId, error: releaseError.message }),
      );
    }

    await finish(rejected ? AI_CALL_STATUSES.REJECTED : AI_CALL_STATUSES.FAILED, aiError.code);
    logger.warn('AI call failed', { operation, correlationId, ticketId, reason: aiError.code, attempts });
    throw aiError;
  }
};
