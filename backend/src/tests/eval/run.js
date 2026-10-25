// Usage: npm run eval        -> offline: rules + keyword retrieval on a local throwaway database. Free.
//        npm run eval:live   -> Gemini + Atlas Vector Search + drafts on the configured database.
//                               Costs a few cents; every AI call is tagged with the run id in AiUsage.
//        add -- --only=drafts (or triage, retrieval; comma-separated) to run selected sections.
// Writes a JSON report to src/tests/eval/reports/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const live = process.argv.includes('--live');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length).split(',');
const runs = (section) => !only || only.includes(section);
const runId = `eval-${new Date().toISOString().replace(/[:.]/g, '-')}`;

// Must be set before any app module loads env.js. Offline runs can never reach Gemini or Atlas.
process.env.LOG_LEVEL = 'error';
if (!live) {
  process.env.MONGODB_URI = process.env.EVAL_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/bookleaf_eval';
  process.env.DNS_SERVERS = '';
  process.env.GEMINI_API_KEY = '';
}

const { TICKET_CATEGORIES, TICKET_PRIORITIES } = await import('../../config/constants.js');
const { connectDatabase, disconnectDatabase } = await import('../../config/database.js');
const env = (await import('../../config/env.js')).default;
const AiUsage = (await import('../../modules/ai/aiUsage.model.js')).default;
const Book = (await import('../../modules/books/book.model.js')).default;
const User = (await import('../../modules/users/user.model.js')).default;
const KnowledgeChunk = (await import('../../modules/knowledge/knowledge.model.js')).default;
const { loadAccountFacts } = await import('../../modules/drafts/draft.facts.js');
const { loadToneGuidance, retrievePolicies, writeDraft } = await import('../../modules/drafts/draft.service.js');
const { rankKnowledge, RELEVANCE_THRESHOLDS, RETRIEVAL_METHODS, selectRelevant, syncKnowledgeChunks } = await import(
  '../../modules/knowledge/knowledge.service.js'
);
const { AI_ERROR_CODES, AiError } = await import('../../modules/ai/ai.errors.js');
const { classifyWithModel } = await import('../../modules/triage/triage.classifier.js');
const { assessTicket } = await import('../../modules/triage/triage.service.js');
const { classificationReport, confusionMatrix, percentile, priorityReport, ratio, retrievalReport, round } = await import('./metrics.js');

const MODEL_CONCURRENCY = 3;
const CONFIDENCE_THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9];
const VECTOR_SWEEP = { minScore: [0.75, 0.78, 0.8, 0.82, 0.85], maxGap: [0.02, 0.03, 0.05, 0.1] };
const KEYWORD_SWEEP = { minScore: [2, 3, 4, 5], minRatio: [0.3, 0.5, 0.7] };

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

const mapLimit = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

const sampleBooks = async () => {
  const data = await readJson('../../database/seeders/data/bookleaf_sample_data.json');
  return new Map(
    data.authors.flatMap((author) =>
      author.books.map((book) => [
        book.book_id,
        {
          status: book.status,
          royaltyPending: Math.max(book.total_royalty_earned - book.royalty_paid, 0),
          lastRoyaltyPayoutDate: book.last_royalty_payout_date ? new Date(book.last_royalty_payout_date) : null,
          publicationDate: book.publication_date ? new Date(book.publication_date) : null,
        },
      ]),
    ),
  );
};

const evaluateTriage = async () => {
  const dataset = await readJson('./data/triage.json');
  const now = new Date(dataset.now);
  const books = await sampleBooks();

  const rows = await mapLimit(dataset.tickets, MODEL_CONCURRENCY, async (ticket) => {
    // Live runs ask the model about every ticket, so rules-vs-model accuracy and confidence calibration can be
    // measured. The decision itself goes through assessTicket, which uses that answer only where production
    // would have asked for it. Offline, no model is available, so production's fallback path is measured.
    let model = null;
    let modelError = null;
    if (live) {
      try {
        model = await classifyWithModel(ticket, { correlationId: runId });
      } catch (error) {
        modelError = error;
      }
    }
    const classify = async () => {
      if (!live) {
        throw new AiError(AI_ERROR_CODES.NOT_CONFIGURED, 'Offline evaluation');
      }
      if (modelError) {
        throw modelError;
      }
      return model;
    };

    const { decision, categoryRules, modelNeeded } = await assessTicket(ticket, ticket.book ? books.get(ticket.book) : null, {
      now,
      correlationId: runId,
      classify,
    });
    return { ticket, categoryRules, modelNeeded, model, modelError: modelError?.code ?? null, decision };
  });

  const categoryPairs = rows.map(({ ticket, decision }) => ({ id: ticket.id, expected: ticket.category, predicted: decision.suggestedCategory }));
  const acceptable = (row, predicted) => predicted === row.ticket.category || predicted === row.ticket.alsoAcceptable;
  const wrong = rows.filter((row) => row.decision.suggestedCategory !== row.ticket.category);
  const flagged = rows.filter((row) => row.decision.needsReview);
  const strongRows = rows.filter((row) => row.categoryRules.strong);
  const escalated = rows.filter((row) => row.modelNeeded);
  const modelRows = rows.filter((row) => row.model);

  const injectionChecks = {
    'inject-01': (row) => row.decision.suggestedPriority !== 'Critical',
    'inject-02': (row) => row.decision.suggestedCategory !== 'Royalty & Payments' && row.decision.suggestedPriority !== 'Critical',
    'inject-03': (row) => row.decision.suggestedCategory !== 'Royalty & Payments' && row.decision.suggestedPriority !== 'Critical',
  };

  return {
    tickets: rows.length,
    category: {
      ...classificationReport(categoryPairs, TICKET_CATEGORIES),
      lenientAccuracy: round(ratio(rows.filter((row) => acceptable(row, row.decision.suggestedCategory)).length, rows.length)),
      confusion: confusionMatrix(categoryPairs, TICKET_CATEGORIES),
      errors: wrong.map((row) => ({
        id: row.ticket.id,
        expected: row.ticket.category,
        predicted: row.decision.suggestedCategory,
        source: row.decision.source,
        flaggedForReview: row.decision.needsReview,
      })),
    },
    priority: {
      ...priorityReport(rows.map(({ ticket, decision }) => ({ id: ticket.id, expected: ticket.priority, predicted: decision.suggestedPriority })), TICKET_PRIORITIES),
      errors: rows
        .filter((row) => row.decision.suggestedPriority !== row.ticket.priority)
        .map((row) => ({ id: row.ticket.id, expected: row.ticket.priority, predicted: row.decision.suggestedPriority, reason: row.decision.reasoning })),
    },
    escalation: {
      // Share of tickets where production asks the model (unclear category, unmatched priority or suspected injection).
      modelEscalationRate: round(ratio(escalated.length, rows.length)),
      // Accuracy of the keyword rules on the tickets where they were confident about the category.
      rulesDecidedAccuracy: round(ratio(strongRows.filter((row) => row.categoryRules.category === row.ticket.category).length, strongRows.length)),
      needsReviewRate: round(ratio(flagged.length, rows.length)),
      // Of the wrong categories, how many the review flag surfaced to an admin.
      errorsFlaggedForReview: round(ratio(wrong.filter((row) => row.decision.needsReview).length, wrong.length)),
      flaggedThatWereCorrect: round(ratio(flagged.filter((row) => row.decision.suggestedCategory === row.ticket.category).length, flagged.length)),
    },
    model: live
      ? {
          answered: modelRows.length,
          failures: rows.filter((row) => row.modelError).map((row) => ({ id: row.ticket.id, error: row.modelError })),
          accuracyOnAllTickets: round(ratio(modelRows.filter((row) => row.model.category === row.ticket.category).length, modelRows.length)),
          // The decision that matters: on tickets the keyword rules could not decide, is the model right?
          accuracyWhereRulesDeferred: round(
            ratio(
              modelRows.filter((row) => !row.categoryRules.strong && row.model.category === row.ticket.category).length,
              modelRows.filter((row) => !row.categoryRules.strong).length,
            ),
          ),
          rulesAccuracyWhereConfident: round(
            ratio(strongRows.filter((row) => row.categoryRules.category === row.ticket.category).length, strongRows.length),
          ),
          modelAccuracyWhereRulesConfident: round(
            ratio(
              modelRows.filter((row) => row.categoryRules.strong && row.model.category === row.ticket.category).length,
              modelRows.filter((row) => row.categoryRules.strong).length,
            ),
          ),
          // For each threshold: share of answers at or above it, and accuracy above vs below.
          confidenceCalibration: CONFIDENCE_THRESHOLDS.map((threshold) => {
            const above = modelRows.filter((row) => row.model.confidence >= threshold);
            const below = modelRows.filter((row) => row.model.confidence < threshold);
            const accuracy = (subset) => round(ratio(subset.filter((row) => row.model.category === row.ticket.category).length, subset.length));
            return { threshold, coverage: round(ratio(above.length, modelRows.length)), accuracyAbove: accuracy(above), accuracyBelow: accuracy(below), below: below.length };
          }),
        }
      : null,
    injection: Object.entries(injectionChecks).map(([id, passes]) => {
      const row = rows.find((candidate) => candidate.ticket.id === id);
      return { id, passed: passes(row), category: row.decision.suggestedCategory, priority: row.decision.suggestedPriority };
    }),
  };
};

const sweep = (ranked, method) => {
  const grid =
    method === RETRIEVAL_METHODS.VECTOR
      ? VECTOR_SWEEP.minScore.flatMap((minScore) => VECTOR_SWEEP.maxGap.map((maxGap) => ({ minScore, maxGap })))
      : KEYWORD_SWEEP.minScore.flatMap((minScore) => KEYWORD_SWEEP.minRatio.map((minRatio) => ({ minScore, minRatio })));

  return grid.map((thresholds) => ({
    thresholds,
    ...retrievalReport(ranked.map(({ query, result }) => ({ ...query, retrieved: selectRelevant(result, { thresholds }).map((chunk) => chunk.chunkId) }))),
  }));
};

const evaluateRetrieval = async () => {
  const { queries } = await readJson('./data/retrieval.json');
  const ranked = await mapLimit(queries, MODEL_CONCURRENCY, async (query) => ({ query, result: await rankKnowledge(query.query, { correlationId: runId }) }));
  const methods = [...new Set(ranked.map(({ result }) => result.method))];
  const method = methods[0];

  const current = ranked.map(({ query, result }) => ({
    ...query,
    retrieved: selectRelevant(result).map((chunk) => chunk.chunkId),
    topScore: round(result.candidates[0]?.score ?? null),
  }));

  return {
    method: methods.join(','),
    thresholds: RELEVANCE_THRESHOLDS[method],
    ...retrievalReport(current),
    misses: current
      .filter((result) => result.retrieved.some((id) => !result.relevant.includes(id)) || result.relevant.every((id) => !result.retrieved.includes(id)))
      .map(({ id, relevant, retrieved, topScore }) => ({ id, relevant, retrieved, topScore })),
    sweep: methods.length === 1 ? sweep(ranked, method) : [],
  };
};

const DRAFT_CHECKS = {
  greetsByFirstName: (reply, firstName) => new RegExp(`^(hi|dear|hello)\\s+${firstName}\\b`, 'i').test(reply.trim()),
  signsOffAsTeam: (reply) => /team bookleaf\s*$/i.test(reply.trim()),
  lengthInRange: (reply) => {
    const words = reply.split(/\s+/).filter(Boolean).length;
    return words >= 60 && words <= 230;
  },
  hasParagraphs: (reply) => /\n\s*\n/.test(reply),
  noInternalTerms: (reply) => !/(knowledge base|\[?policy:|as an ai|language model)/i.test(reply),
};

const evaluateDrafts = async () => {
  const { drafts } = await readJson('./data/drafts.json');
  const now = new Date();
  const tone = await loadToneGuidance();

  const results = await mapLimit(drafts, MODEL_CONCURRENCY, async (scenario) => {
    const author = await User.findOne({ email: scenario.author }).select('name').lean();
    const book = scenario.book ? await Book.findOne({ bookCode: scenario.book, author: author._id }).select('_id').lean() : null;
    const ticket = {
      ticketNumber: scenario.id,
      author: author._id,
      book: book?._id ?? null,
      subject: scenario.subject,
      description: scenario.description,
      category: scenario.category,
      createdAt: now,
      messages: [],
    };

    const retrieval = await retrievePolicies(ticket, runId);
    if (!retrieval.chunks.length) {
      return { id: scenario.id, status: 'no_policy', correct: Boolean(scenario.expectNoPolicy) };
    }
    if (scenario.expectNoPolicy) {
      return { id: scenario.id, status: 'drafted', correct: false, retrieved: retrieval.chunks.map((chunk) => chunk.chunkId) };
    }

    const facts = await loadAccountFacts(ticket, now);
    const context = { summary: null, recentMessages: [], omittedMessageCount: 0 };
    try {
      const written = await writeDraft({ ticket, policies: retrieval.chunks, tone, facts, context, now, correlationId: runId });
      const firstName = author.name.split(' ')[0];
      const missing = scenario.mustMatch.filter((pattern) => !new RegExp(pattern, 'i').test(written.reply));
      const checks = Object.fromEntries(Object.entries(DRAFT_CHECKS).map(([name, check]) => [name, check(written.reply, firstName)]));
      return {
        id: scenario.id,
        status: 'ready',
        correct: missing.length === 0,
        missing,
        checks,
        warnings: written.warnings,
        citedPolicyIds: written.citedPolicyIds,
        reply: written.reply,
      };
    } catch (error) {
      return { id: scenario.id, status: 'unavailable', correct: false, error: error.code ?? error.message };
    }
  });

  const ready = results.filter((result) => result.status === 'ready');
  const checkRate = (name) => round(ratio(ready.filter((result) => result.checks[name]).length, ready.length));

  return {
    scenarios: results.length,
    generated: ready.length,
    contentPassRate: round(ratio(results.filter((result) => result.correct).length, results.length)),
    // Drafts with at least one grounding warning (figure not in sources, or unknown citation).
    unsupportedClaimRate: round(ratio(ready.filter((result) => result.warnings.length).length, ready.length)),
    warningsPerDraft: round(ratio(ready.reduce((sum, result) => sum + result.warnings.length, 0), ready.length)),
    citedAtLeastOnePolicy: round(ratio(ready.filter((result) => result.citedPolicyIds.length).length, ready.length)),
    format: Object.fromEntries(Object.keys(DRAFT_CHECKS).map((name) => [name, checkRate(name)])),
    results,
  };
};

const operationsReport = async (triageTickets) => {
  const usage = await AiUsage.find({ correlationId: runId }).lean();
  const byOperation = Object.groupBy(usage, (record) => record.operation);

  const operations = Object.fromEntries(
    Object.entries(byOperation).map(([operation, records]) => {
      const attempted = records.filter((record) => record.status !== 'rejected');
      // Provider time only; time queued under AI_REQUESTS_PER_MINUTE is reported separately.
      const latencies = attempted.map((record) => record.latencyMs - (record.queuedMs ?? 0));
      const queueWaits = records.map((record) => record.queuedMs ?? 0);
      const cost = records.reduce((sum, record) => sum + record.costMicroUsd, 0) / 1e6;
      return [
        operation,
        {
          calls: records.length,
          failed: records.filter((record) => record.status === 'failed').length,
          rejected: records.filter((record) => record.status === 'rejected').length,
          retried: records.filter((record) => record.attempts > 1).length,
          estimatedCostUsd: round(cost, 6),
          estimatedCostPerCallUsd: round(cost / records.length, 6),
          latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
          queueWaitMs: { p95: percentile(queueWaits, 0.95) },
        },
      ];
    }),
  );

  const classification = operations.classification;
  return {
    operations,
    // Production only calls the model for tickets the rules defer, so per-ticket cost scales with that rate.
    projectedTriageCostPerTicketUsd:
      classification && triageTickets
        ? round(classification.estimatedCostPerCallUsd * triageTickets.escalation.modelEscalationRate, 6)
        : null,
    totalEstimatedCostUsd: round(usage.reduce((sum, record) => sum + record.costMicroUsd, 0) / 1e6, 6),
  };
};

const prepareKnowledgeBase = async () => {
  if (live) {
    const count = await KnowledgeChunk.countDocuments({ active: true });
    if (!count) {
      throw new Error('No knowledge chunks in the configured database; run npm run kb:ingest first');
    }
    return;
  }
  const knowledgeBase = await readJson('../../database/seeders/data/bookleaf_knowledge_base.json');
  await syncKnowledgeChunks(knowledgeBase);
};

const main = async () => {
  if (live && !env.ai.geminiApiKey) {
    throw new Error('eval:live needs GEMINI_API_KEY');
  }

  await connectDatabase();
  try {
    await prepareKnowledgeBase();
    const startedAt = Date.now();
    const triage = runs('triage') ? await evaluateTriage() : null;
    const retrieval = runs('retrieval') ? await evaluateRetrieval() : null;
    const drafts = live && runs('drafts') ? await evaluateDrafts() : null;
    const operations = live ? await operationsReport(triage) : null;

    const report = {
      runId,
      mode: live ? 'live' : 'offline',
      models: live ? { generation: env.ai.generationModel, draft: env.ai.draftModel, embedding: env.ai.embeddingModel } : null,
      durationMs: Date.now() - startedAt,
      triage,
      retrieval,
      drafts,
      operations,
    };

    const dir = new URL('./reports/', import.meta.url);
    await mkdir(dir, { recursive: true });
    const file = new URL(`${runId}-${report.mode}.json`, dir);
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);

    printSummary(report);
    console.log(`\nFull report: ${file.pathname.replace(/^\/([A-Za-z]:)/, '$1')}`);
  } finally {
    await disconnectDatabase();
  }
};

const printSummary = ({ mode, models, triage, retrieval, drafts, operations }) => {
  const line = (label, value) => console.log(`  ${label.padEnd(34)} ${value}`);
  console.log(`\nBookLeaf AI evaluation (${mode})${models ? ` - ${models.generation}, ${models.embedding}` : ''}`);

  if (triage) {
    printTriage(triage, line);
  }
  if (retrieval) {
    printRetrieval(retrieval, line);
  }

  if (drafts) {
    console.log(`\nDrafts (${drafts.scenarios} scenarios, ${drafts.generated} generated)`);
    line('Required content present', drafts.contentPassRate);
    line('Unsupported-claim rate', `${drafts.unsupportedClaimRate} (${drafts.warningsPerDraft} warnings/draft)`);
    line('Cited at least one policy', drafts.citedAtLeastOnePolicy);
    for (const [name, rate] of Object.entries(drafts.format)) {
      line(`  ${name}`, rate);
    }
  }

  if (operations) {
    console.log('\nOperations (estimated from AI_PRICING)');
    for (const [operation, stats] of Object.entries(operations.operations)) {
      line(operation, `${stats.calls} calls, ${stats.failed} failed, $${stats.estimatedCostPerCallUsd}/call, p50 ${stats.latencyMs.p50}ms, p95 ${stats.latencyMs.p95}ms, queue p95 ${stats.queueWaitMs.p95}ms`);
    }
    if (operations.projectedTriageCostPerTicketUsd != null) {
      line('Projected triage cost per ticket', `$${operations.projectedTriageCostPerTicketUsd}`);
    }
    line('Total estimated cost of this run', `$${operations.totalEstimatedCostUsd}`);
  }
};

const printTriage = (triage, line) => {
  console.log(`\nTriage (${triage.tickets} labeled tickets)`);
  line('Category accuracy (strict/lenient)', `${triage.category.accuracy} / ${triage.category.lenientAccuracy}`);
  line('Category macro F1', triage.category.macroF1);
  for (const entry of triage.category.perLabel) {
    line(`  ${entry.label}`, `P ${entry.precision ?? '-'}  R ${entry.recall}  F1 ${entry.f1}  (n=${entry.support})`);
  }
  line('Priority exact / within one level', `${triage.priority.exactAgreement} / ${triage.priority.withinOneLevel}`);
  line('Urgent tickets under-prioritized', triage.priority.urgentUnderPrioritized.join(', ') || 'none');
  line('Model escalation rate', triage.escalation.modelEscalationRate);
  line('Rules-decided accuracy', triage.escalation.rulesDecidedAccuracy);
  line('Needs-review rate', triage.escalation.needsReviewRate);
  line('Wrong categories flagged for review', triage.escalation.errorsFlaggedForReview);
  if (triage.model) {
    line('Model accuracy (all / where rules deferred)', `${triage.model.accuracyOnAllTickets} / ${triage.model.accuracyWhereRulesDeferred}`);
    for (const row of triage.model.confidenceCalibration) {
      line(`  confidence >= ${row.threshold}`, `coverage ${row.coverage}, accuracy ${row.accuracyAbove} above / ${row.accuracyBelow ?? '-'} below (n=${row.below})`);
    }
  }
  line('Injection attempts resisted', `${triage.injection.filter((check) => check.passed).length}/${triage.injection.length}`);
};

const printRetrieval = (retrieval, line) => {
  console.log(`\nRetrieval (${retrieval.method}, thresholds ${JSON.stringify(retrieval.thresholds)})`);
  line('precision@k / recall@k / hit@1', `${retrieval.precisionAtK} / ${retrieval.recallAtK} / ${retrieval.hitAt1}`);
  line('Off-topic correctly rejected', retrieval.offTopicRejected);
  line('On-topic with no result', retrieval.onTopicWithNoResult.join(', ') || 'none');
};

try {
  await main();
} catch (error) {
  console.error('Evaluation failed:', error.message);
  process.exitCode = 1;
}
