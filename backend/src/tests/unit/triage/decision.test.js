import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideTriage } from '../../../modules/triage/triage.service.js';

const strongRules = { category: 'Printing & Quality', strong: true, score: 6, signals: ['category:defect'] };
const weakRules = { category: 'Royalty & Payments', strong: false, score: 3, signals: ['category:royalty'] };
const noRules = { category: null, strong: false, score: 0, signals: [] };
const priorityMatched = { matched: true, priority: 'High', reason: 'ISBN error reported', signals: ['priority:isbn-error'] };
const priorityDefault = { matched: false, priority: 'Medium', reason: 'No urgency signals found; default priority', signals: [] };

const model = (overrides = {}) => ({
  category: 'Royalty & Payments',
  alternativeCategory: null,
  ambiguous: false,
  confidence: 0.92,
  priority: 'Medium',
  reason: 'Author asks about a royalty statement.',
  ...overrides,
});

describe('decideTriage', () => {
  it('uses confident rules without a model', () => {
    const decision = decideTriage({ categoryRules: strongRules, priorityRules: priorityMatched });
    assert.equal(decision.source, 'rules');
    assert.equal(decision.suggestedCategory, 'Printing & Quality');
    assert.equal(decision.confidence, null);
    assert.equal(decision.model, null);
    assert.equal(decision.needsReview, false);
  });

  it('takes a confident model answer without review', () => {
    const decision = decideTriage({ categoryRules: weakRules, priorityRules: priorityDefault, model: model() });
    assert.equal(decision.source, 'ai');
    assert.equal(decision.suggestedPriority, 'Medium');
    assert.equal(decision.prioritySource, 'ai');
    assert.equal(decision.needsReview, false);
  });

  it('flags low confidence, ambiguity and rule conflicts for review', () => {
    const decision = decideTriage({
      categoryRules: weakRules,
      priorityRules: priorityDefault,
      model: model({ category: 'General Inquiry', confidence: 0.4, ambiguous: true, alternativeCategory: 'Royalty & Payments' }),
    });
    assert.equal(decision.needsReview, true);
    assert.equal(decision.reviewReasons.length, 3);
  });

  it('falls back to the rules and flags review when the model is unavailable', () => {
    const decision = decideTriage({ categoryRules: weakRules, priorityRules: priorityMatched, modelError: 'rate_limited' });
    assert.equal(decision.source, 'fallback');
    assert.equal(decision.suggestedCategory, 'Royalty & Payments');
    assert.equal(decision.suggestedPriority, 'High');
    assert.equal(decision.needsReview, true);
    assert.match(decision.reviewReasons[0], /rate_limited/);
  });

  it('uses General Inquiry when neither rules nor model can decide', () => {
    const decision = decideTriage({ categoryRules: noRules, priorityRules: priorityDefault, modelError: 'circuit_open' });
    assert.equal(decision.suggestedCategory, 'General Inquiry');
    assert.equal(decision.suggestedPriority, 'Medium');
  });

  it('never lets the model lower a rule-based priority', () => {
    const decision = decideTriage({ categoryRules: weakRules, priorityRules: priorityMatched, model: model({ priority: 'Low' }) });
    assert.equal(decision.suggestedPriority, 'High');
    assert.equal(decision.prioritySource, 'rules');
  });

  it('does not let keyword rules decide alone when the text looks like an injection attempt', () => {
    const decision = decideTriage({
      categoryRules: strongRules,
      priorityRules: priorityMatched,
      model: model({ category: 'General Inquiry' }),
      suspectedInjection: true,
    });
    assert.equal(decision.suggestedCategory, 'General Inquiry');
    assert.equal(decision.source, 'ai');
    assert.equal(decision.needsReview, true);
    assert.match(decision.reviewReasons[0], /prompt injection/);
  });

  it('lets the model raise a rule-based priority, flagged for review', () => {
    const decision = decideTriage({ categoryRules: weakRules, priorityRules: priorityMatched, model: model({ priority: 'Critical' }) });
    assert.equal(decision.suggestedPriority, 'Critical');
    assert.equal(decision.needsReview, true);
    assert.match(decision.reasoning, /rules said High/);
  });
});
