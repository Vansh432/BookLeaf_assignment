import { AI_CALL_STATUSES, CLASSIFICATION_SOURCES, DRAFT_STATUSES } from '../../config/constants.js';
import env from '../../config/env.js';
import { isAiConfigured } from '../../infrastructure/ai/gemini.client.js';
import Ticket from '../tickets/ticket.model.js';
import AiUsage from './aiUsage.model.js';
import { getBudgetStatus, toUsd } from './ai.budget.js';
import { geminiCircuit } from './ai.circuitBreaker.js';

// Correlation ids of evaluation runs (npm run eval:live).
const EVALUATION_RUN = /^eval-/;

const countStatus = (status) => ({ $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } });

// Time spent in the provider call itself: queue time (rate limiting) is reported separately, and rejected
// calls never reach the provider, so their near-zero latency would distort the percentiles.
const providerLatency = {
  $cond: [
    { $eq: ['$status', AI_CALL_STATUSES.REJECTED] },
    null,
    { $subtract: ['$latencyMs', { $ifNull: ['$queuedMs', 0] }] },
  ],
};

const ratio = (part, whole) => (whole ? Number((part / whole).toFixed(4)) : 0);

const toOperationSummary = ({ _id, latency, queueWait, costMicroUsd, ...totals }) => ({
  operation: _id.operation,
  model: _id.model,
  ...totals,
  errorRate: ratio(totals.failed, totals.calls),
  rejectionRate: ratio(totals.rejected, totals.calls),
  estimatedCostUsd: toUsd(costMicroUsd),
  estimatedCostPerSuccessUsd: totals.success ? toUsd(costMicroUsd / totals.success) : 0,
  latencyMs: { p50: latency?.[0] ?? null, p95: latency?.[1] ?? null },
  queueWaitMs: { p95: queueWait?.[0] ?? null },
});

const overriddenField = (field) => ({
  $sum: { $cond: [{ $in: [field, { $ifNull: ['$classification.overrides.field', []] }] }, 1, 0] },
});

// Production triage quality: how often admins had to correct a suggestion is the live counterpart of the
// offline accuracy measured by npm run eval.
const getTriageStats = async ({ from, to }) => {
  const [stats] = await Ticket.aggregate([
    { $match: { 'classification.classifiedAt': { $gte: from, $lt: to } } },
    {
      $group: {
        _id: null,
        classified: { $sum: 1 },
        decidedByRules: { $sum: { $cond: [{ $eq: ['$classification.source', CLASSIFICATION_SOURCES.RULES] }, 1, 0] } },
        decidedByAi: { $sum: { $cond: [{ $eq: ['$classification.source', CLASSIFICATION_SOURCES.AI] }, 1, 0] } },
        aiFallbacks: { $sum: { $cond: [{ $eq: ['$classification.source', CLASSIFICATION_SOURCES.FALLBACK] }, 1, 0] } },
        flaggedForReview: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$classification.reviewReasons', []] } }, 0] }, 1, 0] } },
        // Flagged and not yet confirmed or corrected by an admin.
        awaitingReview: { $sum: { $cond: ['$classification.needsReview', 1, 0] } },
        categoryOverridden: overriddenField('category'),
        priorityOverridden: overriddenField('priority'),
      },
    },
  ]);

  if (!stats) {
    return { classified: 0 };
  }

  const { _id, classified, ...counts } = stats;
  return {
    classified,
    ...counts,
    categoryOverrideRate: ratio(counts.categoryOverridden, classified),
    priorityOverrideRate: ratio(counts.priorityOverridden, classified),
    aiFallbackRate: ratio(counts.aiFallbacks, classified),
  };
};

const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

// Quality of the AI drafts generated in the window, from each ticket's latest draft (earlier drafts on the
// same ticket are replaced, so this counts the drafts admins actually worked from).
const getDraftStats = async ({ from, to }) => {
  const [stats] = await Ticket.aggregate([
    { $match: { 'aiDraft.generatedAt': { $gte: from, $lt: to } } },
    {
      $group: {
        _id: null,
        drafts: { $sum: 1 },
        ready: countIf({ $eq: ['$aiDraft.status', DRAFT_STATUSES.READY] }),
        noPolicy: countIf({ $eq: ['$aiDraft.status', DRAFT_STATUSES.NO_POLICY] }),
        unavailable: countIf({ $eq: ['$aiDraft.status', DRAFT_STATUSES.UNAVAILABLE] }),
        withWarnings: countIf({ $gt: [{ $size: { $ifNull: ['$aiDraft.warnings', []] } }, 0] }),
        sent: countIf({ $ne: [{ $ifNull: ['$aiDraft.sent', null] }, null] }),
        sentAsDrafted: countIf({ $eq: ['$aiDraft.sent.edited', false] }),
        sentWithEdits: countIf({ $eq: ['$aiDraft.sent.edited', true] }),
      },
    },
  ]);

  if (!stats) {
    return { drafts: 0 };
  }

  const { _id, ...counts } = stats;
  return {
    ...counts,
    // Drafts that reached the author at all, and how often admins had to change them first.
    adoptionRate: ratio(counts.sent, counts.ready),
    editRate: ratio(counts.sentWithEdits, counts.sent),
    unsupportedClaimRate: ratio(counts.withWarnings, counts.ready),
    noPolicyRate: ratio(counts.noPolicy, counts.drafts),
  };
};

// Aggregated AI usage for a time window in one round trip. Costs are estimates from AI_PRICING, not invoices.
export const getUsageSummary = async ({ from, to, includeEvaluation = false }) => {
  const [result] = await AiUsage.aggregate([
    {
      $match: {
        createdAt: { $gte: from, $lt: to },
        ...(!includeEvaluation && { correlationId: { $not: EVALUATION_RUN } }),
      },
    },
    {
      $facet: {
        daily: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              calls: { $sum: 1 },
              failed: countStatus(AI_CALL_STATUSES.FAILED),
              rejected: countStatus(AI_CALL_STATUSES.REJECTED),
              costMicroUsd: { $sum: '$costMicroUsd' },
            },
          },
          { $sort: { _id: 1 } },
        ],
        operations: [
          {
            $group: {
              _id: { operation: '$operation', model: '$model' },
              calls: { $sum: 1 },
              success: countStatus(AI_CALL_STATUSES.SUCCESS),
              failed: countStatus(AI_CALL_STATUSES.FAILED),
              rejected: countStatus(AI_CALL_STATUSES.REJECTED),
              retriedCalls: { $sum: { $cond: [{ $gt: ['$attempts', 1] }, 1, 0] } },
              inputTokens: { $sum: '$inputTokens' },
              outputTokens: { $sum: '$outputTokens' },
              cachedTokens: { $sum: '$cachedTokens' },
              costMicroUsd: { $sum: '$costMicroUsd' },
              latency: { $percentile: { input: providerLatency, p: [0.5, 0.95], method: 'approximate' } },
              queueWait: { $percentile: { input: { $ifNull: ['$queuedMs', 0] }, p: [0.95], method: 'approximate' } },
            },
          },
          { $sort: { '_id.operation': 1, '_id.model': 1 } },
        ],
        failureReasons: [
          { $match: { failureReason: { $ne: null } } },
          { $group: { _id: '$failureReason', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        tickets: [
          { $match: { ticket: { $ne: null } } },
          { $group: { _id: '$ticket', costMicroUsd: { $sum: '$costMicroUsd' } } },
          { $group: { _id: null, tickets: { $sum: 1 }, costMicroUsd: { $sum: '$costMicroUsd' } } },
        ],
      },
    },
  ]);

  const operations = result.operations.map(toOperationSummary);
  const ticketTotals = result.tickets[0];

  return {
    window: { from, to, includeEvaluation },
    totals: {
      calls: operations.reduce((sum, operation) => sum + operation.calls, 0),
      estimatedCostUsd: toUsd(result.operations.reduce((sum, operation) => sum + operation.costMicroUsd, 0)),
      ticketsWithAiCalls: ticketTotals?.tickets ?? 0,
      estimatedCostPerTicketUsd: ticketTotals ? toUsd(ticketTotals.costMicroUsd / ticketTotals.tickets) : 0,
    },
    operations,
    // UTC days with at least one call; days without calls are left out.
    daily: result.daily.map(({ _id, costMicroUsd, ...counts }) => ({ date: _id, ...counts, estimatedCostUsd: toUsd(costMicroUsd) })),
    failureReasons: result.failureReasons.map(({ _id, count }) => ({ reason: _id, count })),
    triage: await getTriageStats({ from, to }),
    drafts: await getDraftStats({ from, to }),
    budgets: await getBudgetStatus(),
    circuit: geminiCircuit.status,
    // The settings behind these numbers; never includes credentials.
    config: {
      aiEnabled: isAiConfigured(),
      generationModel: env.ai.generationModel,
      draftModel: env.ai.draftModel,
      embeddingModel: env.ai.embeddingModel,
      requestsPerMinute: env.ai.requestsPerMinute,
      maxCallsPerTicket: env.ai.maxCallsPerTicket,
    },
  };
};
