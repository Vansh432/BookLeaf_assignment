import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planSummaryRefresh } from '../../../modules/context/context.service.js';

describe('planSummaryRefresh', () => {
  it('does not summarize short conversations', () => {
    assert.equal(planSummaryRefresh({ messageCount: 8, coveredMessageCount: 0 }), null);
  });

  it('folds everything except the latest four messages once past the verbatim limit', () => {
    assert.deepEqual(planSummaryRefresh({ messageCount: 9, coveredMessageCount: 0 }), { from: 0, to: 5 });
  });

  it('waits for enough new material before refreshing again', () => {
    assert.equal(planSummaryRefresh({ messageCount: 13, coveredMessageCount: 5 }), null);
    assert.deepEqual(planSummaryRefresh({ messageCount: 14, coveredMessageCount: 5 }), { from: 5, to: 10 });
  });

  it('folds a large backlog in bounded batches', () => {
    assert.deepEqual(planSummaryRefresh({ messageCount: 30, coveredMessageCount: 0 }), { from: 0, to: 12 });
  });
});
