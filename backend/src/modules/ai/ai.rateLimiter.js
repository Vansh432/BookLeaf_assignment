import { setTimeout as sleep } from 'node:timers/promises';
import env from '../../config/env.js';
import { AI_ERROR_CODES, AiError } from './ai.errors.js';

const WINDOW_MS = 60 * 1000;

// Recent request start times per model, for a sliding one-minute window.
const windows = new Map();

/**
 * Waits for a free request slot under the model's configured requests-per-minute limit, so bursts queue
 * instead of hitting the provider's quota (and tripping the circuit breaker). Models without a limit pass
 * straight through. Gives up with THROTTLED when the wait would exceed maxWaitMs. Per process: with several
 * instances, divide the provider quota between them.
 */
export const acquireRequestSlot = async (model, { maxWaitMs }) => {
  const limit = env.ai.requestsPerMinute[model];
  if (!limit) {
    return;
  }

  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const now = Date.now();
    const recent = (windows.get(model) ?? []).filter((startedAt) => now - startedAt < WINDOW_MS);

    // Check and claim happen without an await in between, so concurrent callers cannot both take the last slot.
    if (recent.length < limit) {
      recent.push(now);
      windows.set(model, recent);
      return;
    }

    windows.set(model, recent);
    const waitMs = WINDOW_MS - (now - recent[0]) + 1;
    if (now + waitMs > deadline) {
      throw new AiError(AI_ERROR_CODES.THROTTLED, `Request limit of ${limit}/min for ${model} reached`);
    }
    await sleep(waitMs);
  }
};

export const resetRateLimits = () => windows.clear();
