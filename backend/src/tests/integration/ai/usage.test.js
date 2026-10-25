import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mongoose from 'mongoose';
import { getUsageSummary } from '../../../modules/ai/ai.usage.js';
import AiUsage from '../../../modules/ai/aiUsage.model.js';
import Ticket from '../../../modules/tickets/ticket.model.js';
import { useTestDatabase } from '../../helpers/database.js';

useTestDatabase();

const author = new mongoose.Types.ObjectId();
const admin = new mongoose.Types.ObjectId();

const classified = (source, overrides = [], reviewReasons = []) => ({
  author,
  subject: 'Test ticket',
  description: 'A ticket used to test the usage summary.',
  classification: { status: 'completed', source, classifiedAt: new Date(), overrides, reviewReasons },
});

describe('getUsageSummary', () => {
  it('reports AI calls by operation and production triage quality, including admin override rates', async () => {
    await AiUsage.create([
      { operation: 'classification', provider: 'gemini', model: 'test-flash', status: 'success', costMicroUsd: 300, latencyMs: 2000, correlationId: 'a' },
      { operation: 'classification', provider: 'gemini', model: 'test-flash', status: 'failed', failureReason: 'timeout', latencyMs: 4000, correlationId: 'b' },
      { operation: 'draft', provider: 'gemini', model: 'test-flash', status: 'rejected', failureReason: 'budget_exhausted', latencyMs: 5, correlationId: 'c' },
      // An evaluation run: excluded unless explicitly requested.
      { operation: 'classification', provider: 'gemini', model: 'test-flash', status: 'success', costMicroUsd: 999, latencyMs: 1000, correlationId: 'eval-2026-10-25' },
    ]);
    const draft = (status, extra = {}) => ({ id: crypto.randomUUID(), status, generatedAt: new Date(), ...extra });
    await Ticket.create([
      { ...classified('rules'), aiDraft: draft('ready', { sent: { at: new Date(), by: admin, edited: false } }) },
      {
        ...classified('ai', [{ field: 'category', from: 'General Inquiry', to: 'Royalty & Payments', suggested: 'General Inquiry', by: admin }]),
        aiDraft: draft('ready', { warnings: ['"9999" is not in the sources'], sent: { at: new Date(), by: admin, edited: true } }),
      },
      {
        ...classified('fallback', [{ field: 'priority', from: 'Medium', to: 'High', suggested: 'Medium', by: admin }], ['AI unavailable']),
        aiDraft: draft('unavailable'),
      },
      { ...classified('ai'), aiDraft: draft('no_policy') },
    ]);
    await Ticket.updateOne({ 'classification.source': 'fallback' }, { 'classification.needsReview': true });
    const window = { from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) };

    const summary = await getUsageSummary(window);

    const classification = summary.operations.find((operation) => operation.operation === 'classification');
    assert.equal(classification.calls, 2, 'evaluation calls are excluded by default');
    assert.equal(classification.errorRate, 0.5);
    assert.equal(summary.failureReasons.length, 2);
    assert.equal(summary.daily.length, 1);
    assert.equal(summary.daily[0].calls, 3);
    assert.deepEqual(
      { ...summary.triage },
      {
        classified: 4,
        decidedByRules: 1,
        decidedByAi: 2,
        aiFallbacks: 1,
        flaggedForReview: 1,
        awaitingReview: 1,
        categoryOverridden: 1,
        priorityOverridden: 1,
        categoryOverrideRate: 0.25,
        priorityOverrideRate: 0.25,
        aiFallbackRate: 0.25,
      },
    );
    assert.deepEqual(
      { ...summary.drafts },
      {
        drafts: 4,
        ready: 2,
        noPolicy: 1,
        unavailable: 1,
        withWarnings: 1,
        sent: 2,
        sentAsDrafted: 1,
        sentWithEdits: 1,
        adoptionRate: 1,
        editRate: 0.5,
        unsupportedClaimRate: 0.5,
        noPolicyRate: 0.25,
      },
    );
    assert.equal(summary.config.generationModel, 'test-flash');
    assert.equal(JSON.stringify(summary.config).includes('test-key'), false, 'the API key is never exposed');

    const withEvaluation = await getUsageSummary({ ...window, includeEvaluation: true });
    assert.equal(withEvaluation.operations.find((operation) => operation.operation === 'classification').calls, 3);
  });
});
