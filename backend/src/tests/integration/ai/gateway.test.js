import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { ApiError } from '@google/genai';
import mongoose from 'mongoose';
import { AI_CALL_STATUSES, AI_OPERATIONS } from '../../../config/constants.js';
import AiBudget from '../../../modules/ai/aiBudget.model.js';
import { geminiCircuit } from '../../../modules/ai/ai.circuitBreaker.js';
import { AI_ERROR_CODES, AiError } from '../../../modules/ai/ai.errors.js';
import { runAiCall } from '../../../modules/ai/ai.gateway.js';
import AiUsage from '../../../modules/ai/aiUsage.model.js';
import { budgetPeriods } from '../../../modules/ai/ai.budget.js';
import { useTestDatabase } from '../../helpers/database.js';

useTestDatabase();

const USAGE = { inputTokens: 1000, outputTokens: 200, cachedTokens: 0, estimated: false };

const call = (overrides = {}) =>
  runAiCall({
    operation: AI_OPERATIONS.CLASSIFICATION,
    model: 'test-flash',
    estimatedInputTokens: 1000,
    maxInputTokens: 4000,
    maxOutputTokens: 500,
    correlationId: 'test-correlation',
    execute: async () => ({ value: 'ok', usage: USAGE }),
    ...overrides,
  });

// Simulates the SDK: the request goes through the per-attempt fetch, then a non-ok response raises ApiError.
const failingExecute = (status, headers = {}) => {
  const execute = mock.fn(async ({ httpOptions }) => {
    await httpOptions.fetch('https://provider.test', {});
    throw new ApiError({ message: 'provider error', status });
  });
  return { execute, fetchStub: () => new Response('{}', { status, headers }) };
};

const lastUsage = () => AiUsage.findOne().sort({ createdAt: -1 }).lean();

describe('runAiCall', () => {
  beforeEach(() => {
    geminiCircuit.reset();
    mock.restoreAll();
  });

  it('records usage, latency and estimated cost for a successful call', async () => {
    assert.equal(await call(), 'ok');

    const usage = await lastUsage();
    assert.equal(usage.status, AI_CALL_STATUSES.SUCCESS);
    assert.equal(usage.attempts, 1);
    assert.equal(usage.inputTokens, 1000);
    assert.equal(usage.outputTokens, 200);
    // 1000 * 1 + 200 * 4 micro-USD
    assert.equal(usage.costMicroUsd, 1800);
    assert.equal(usage.correlationId, 'test-correlation');

    const day = await AiBudget.findById(budgetPeriods()[0].id).lean();
    assert.equal(day.reservations.length, 0);
    assert.equal(day.spentMicroUsd, 1800);
  });

  it('retries transient failures, honouring Retry-After', async () => {
    const { execute, fetchStub } = failingExecute(429, { 'retry-after': '0.05' });
    mock.method(globalThis, 'fetch', async () => fetchStub());
    const startedAt = Date.now();

    await assert.rejects(call({ execute }), { code: AI_ERROR_CODES.RATE_LIMITED });

    assert.equal(execute.mock.callCount(), 3);
    assert.ok(Date.now() - startedAt >= 100, 'waited at least Retry-After between each attempt');
    const usage = await lastUsage();
    assert.equal(usage.status, AI_CALL_STATUSES.FAILED);
    assert.equal(usage.attempts, 3);
    assert.equal(usage.costMicroUsd, 0);
  });

  it('gives up immediately when Retry-After is too long to wait for', async () => {
    const { execute, fetchStub } = failingExecute(429, { 'retry-after': '120' });
    mock.method(globalThis, 'fetch', async () => fetchStub());

    await assert.rejects(call({ execute }), { code: AI_ERROR_CODES.RATE_LIMITED });
    assert.equal(execute.mock.callCount(), 1);
  });

  it('does not retry permanent errors such as an invalid key', async () => {
    const { execute, fetchStub } = failingExecute(403);
    mock.method(globalThis, 'fetch', async () => fetchStub());

    await assert.rejects(call({ execute }), { code: AI_ERROR_CODES.PROVIDER_REJECTED });
    assert.equal(execute.mock.callCount(), 1);
  });

  it('succeeds after a transient failure', async () => {
    let calls = 0;
    const execute = async () => {
      calls += 1;
      if (calls === 1) {
        throw new ApiError({ message: 'unavailable', status: 503 });
      }
      return { value: 'recovered', usage: USAGE };
    };

    assert.equal(await call({ execute }), 'recovered');
    assert.equal((await lastUsage()).attempts, 2);
  });

  it('opens the circuit after repeated provider failures and stops calling the provider', async () => {
    const execute = mock.fn(async () => {
      throw new ApiError({ message: 'down', status: 500 });
    });

    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(call({ execute, maxAttempts: 1 }), { code: AI_ERROR_CODES.PROVIDER_UNAVAILABLE });
    }
    await assert.rejects(call({ execute }), { code: AI_ERROR_CODES.CIRCUIT_OPEN });

    assert.equal(execute.mock.callCount(), 5);
    assert.equal((await lastUsage()).status, AI_CALL_STATUSES.REJECTED);
  });

  it('rejects oversized input before contacting the provider', async () => {
    const execute = mock.fn(async () => ({ value: 'ok', usage: USAGE }));

    await assert.rejects(call({ execute, estimatedInputTokens: 5000 }), { code: AI_ERROR_CODES.INPUT_TOO_LARGE });
    assert.equal(execute.mock.callCount(), 0);
  });

  it('rejects calls once the budget is exhausted, without contacting the provider', async () => {
    await AiBudget.create({ _id: budgetPeriods()[0].id, spentMicroUsd: 999_000 });
    const execute = mock.fn(async () => ({ value: 'ok', usage: USAGE }));

    await assert.rejects(call({ execute }), { code: AI_ERROR_CODES.BUDGET_EXHAUSTED });
    assert.equal(execute.mock.callCount(), 0);
    assert.equal((await lastUsage()).status, AI_CALL_STATUSES.REJECTED);
  });

  it('enforces the per-ticket call limit', async () => {
    const ticketId = new mongoose.Types.ObjectId();

    for (let i = 0; i < 3; i += 1) {
      await call({ ticketId });
    }
    await assert.rejects(call({ ticketId }), { code: AI_ERROR_CODES.TICKET_LIMIT_REACHED });
    assert.equal(await AiUsage.countDocuments({ ticket: ticketId, status: AI_CALL_STATUSES.SUCCESS }), 3);
  });

  it('records the cost of a billed call whose output fails validation', async () => {
    const validate = () => {
      throw new AiError(AI_ERROR_CODES.INVALID_OUTPUT, 'bad output');
    };

    await assert.rejects(call({ validate }), { code: AI_ERROR_CODES.INVALID_OUTPUT });

    const usage = await lastUsage();
    assert.equal(usage.status, AI_CALL_STATUSES.FAILED);
    assert.equal(usage.failureReason, AI_ERROR_CODES.INVALID_OUTPUT);
    assert.equal(usage.costMicroUsd, 1800);
    assert.equal(geminiCircuit.status.state, 'closed');
  });
});
