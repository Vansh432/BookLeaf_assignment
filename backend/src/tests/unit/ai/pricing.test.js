import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { budgetPeriods, estimateCostMicroUsd } from '../../../modules/ai/ai.budget.js';
import { AI_ERROR_CODES } from '../../../modules/ai/ai.errors.js';
import { retryDelayMs } from '../../../modules/ai/ai.gateway.js';

// Test pricing (setup.js): test-flash input 1, output 4, cachedInput 0.1 USD per 1M tokens.
describe('estimateCostMicroUsd', () => {
  it('prices input and output tokens per million', () => {
    assert.equal(estimateCostMicroUsd('test-flash', { inputTokens: 1000, outputTokens: 500 }), 3000);
  });

  it('prices cached input tokens at the cached rate and rounds up', () => {
    assert.equal(estimateCostMicroUsd('test-flash', { inputTokens: 1000, cachedTokens: 5 }), 996);
  });

  it('refuses models without configured pricing', () => {
    assert.throws(() => estimateCostMicroUsd('unknown-model', { inputTokens: 1 }), { code: AI_ERROR_CODES.NOT_CONFIGURED });
  });
});

describe('budgetPeriods', () => {
  it('derives UTC day and month periods with limits in micro-USD', () => {
    const periods = budgetPeriods(new Date('2026-10-24T23:30:00Z'));
    assert.deepEqual(periods, [
      { id: 'day:2026-10-24', limitMicroUsd: 1_000_000 },
      { id: 'month:2026-10', limitMicroUsd: 5_000_000 },
    ]);
  });
});

describe('retryDelayMs', () => {
  it('never waits less than the provider Retry-After', () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      assert.ok(retryDelayMs(attempt, 2000, 100) >= 2000);
    }
  });

  it('caps exponential backoff', () => {
    for (let i = 0; i < 50; i += 1) {
      assert.ok(retryDelayMs(20, 0, 1000) <= 8000);
    }
  });
});
