import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { TICKET_PRIORITIES } from '../../../config/constants.js';
import { assessPriorityByRules, classifyCategoryByRules, normalizeTicketText } from '../../../modules/triage/triage.rules.js';

// Regression guard over the labeled evaluation set (no model, no network). The full measurement,
// including the model, is `npm run eval` / `npm run eval:live`.
const dataset = JSON.parse(await readFile(new URL('../../eval/data/triage.json', import.meta.url), 'utf8'));
const now = new Date(dataset.now);
const rank = (priority) => TICKET_PRIORITIES.indexOf(priority);

const rows = dataset.tickets.map((ticket) => {
  const text = normalizeTicketText(ticket);
  return { ticket, category: classifyCategoryByRules(text), priority: assessPriorityByRules(text, null, now) };
});

describe('triage rules on the labeled dataset', () => {
  it('are at least 90% accurate on the categories they are confident about', () => {
    const confident = rows.filter((row) => row.category.strong);
    const correct = confident.filter((row) => row.category.category === row.ticket.category);
    assert.ok(correct.length / confident.length >= 0.9, `${correct.length}/${confident.length} correct`);
  });

  it('never rank a High or Critical ticket lower when a priority rule fires', () => {
    // Book-record evidence is excluded here, so tickets labeled from it are skipped.
    const underRanked = rows.filter(
      (row) =>
        !row.ticket.book &&
        row.priority.matched &&
        rank(row.ticket.priority) <= rank('High') &&
        rank(row.priority.priority) > rank(row.ticket.priority),
    );
    assert.deepEqual(underRanked.map((row) => row.ticket.id), []);
  });
});
