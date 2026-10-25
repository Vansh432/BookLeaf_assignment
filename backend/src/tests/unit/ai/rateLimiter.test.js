import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { AI_ERROR_CODES } from '../../../modules/ai/ai.errors.js';
import { acquireRequestSlot, resetRateLimits } from '../../../modules/ai/ai.rateLimiter.js';

// setup.js limits 'test-throttled' to 2 requests per minute.
describe('acquireRequestSlot', () => {
  beforeEach(() => resetRateLimits());

  it('lets requests through up to the per-minute limit', async () => {
    await acquireRequestSlot('test-throttled', { maxWaitMs: 0 });
    await acquireRequestSlot('test-throttled', { maxWaitMs: 0 });
  });

  it('refuses locally once the wait for a slot would exceed the allowed queue time', async () => {
    await acquireRequestSlot('test-throttled', { maxWaitMs: 0 });
    await acquireRequestSlot('test-throttled', { maxWaitMs: 0 });
    await assert.rejects(acquireRequestSlot('test-throttled', { maxWaitMs: 50 }), { code: AI_ERROR_CODES.THROTTLED });
  });

  it('never lets concurrent callers exceed the limit', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => acquireRequestSlot('test-throttled', { maxWaitMs: 10 })),
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
  });

  it('does not throttle models without a configured limit', async () => {
    for (let i = 0; i < 50; i += 1) {
      await acquireRequestSlot('test-flash', { maxWaitMs: 0 });
    }
  });
});
