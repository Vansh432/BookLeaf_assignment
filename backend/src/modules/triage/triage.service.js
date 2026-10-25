import {
  CLASSIFICATION_SOURCES,
  CLASSIFICATION_STATUSES,
  PRIORITY_SOURCES,
} from '../../config/constants.js';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { AiError } from '../ai/ai.errors.js';
import Book from '../books/book.model.js';
import { publishTicketChange, SYSTEM_ACTOR, TICKET_ACTIONS } from '../tickets/ticket.events.js';
import Ticket from '../tickets/ticket.model.js';
import { classifyWithModel } from './triage.classifier.js';
import {
  assessPriorityByRules,
  classifyCategoryByRules,
  higherPriority,
  looksLikeInjection,
  normalizeTicketText,
  TRIAGE_RULES_VERSION,
} from './triage.rules.js';

// Model answers below this go to review. Calibration on the labeled set (npm run eval:live, 2026-10-25):
// the model reports >= 0.8 on 92% of tickets, so confidence separates poorly; 0.9 would split accuracy
// 97% above vs 87% below but flag ~40% of tickets. Every wrong category was already flagged by the
// ambiguity and rule-conflict checks, so 0.7 is kept to avoid review fatigue.
const MIN_MODEL_CONFIDENCE = 0.7;
// A rule signal this strong that disagrees with the model is treated as a conflict.
const CONFLICTING_RULE_SCORE = 3;

// Must outlast one AI call with all retries (3 x 60s timeout plus backoff).
const LEASE_MS = 5 * 60 * 1000;
export const MAX_TRIAGE_ATTEMPTS = 3;

const FALLBACK_CATEGORY = 'General Inquiry';
const MAX_REASONING_LENGTH = 500;

const decideCategory = (categoryRules, model, modelError) => {
  if (categoryRules.strong) {
    return { suggestedCategory: categoryRules.category, source: CLASSIFICATION_SOURCES.RULES, confidence: null, reviewReasons: [] };
  }

  if (!model) {
    return {
      suggestedCategory: categoryRules.category ?? FALLBACK_CATEGORY,
      source: CLASSIFICATION_SOURCES.FALLBACK,
      confidence: null,
      reviewReasons: [`AI unavailable (${modelError}); category is a keyword-rule guess`],
    };
  }

  const reviewReasons = [];
  if (model.confidence < MIN_MODEL_CONFIDENCE) {
    reviewReasons.push(`Low AI confidence (${model.confidence.toFixed(2)})`);
  }
  if (model.ambiguous) {
    reviewReasons.push(`Ambiguous: could also be ${model.alternativeCategory ?? 'another category'}`);
  }
  if (categoryRules.category !== model.category && categoryRules.score >= CONFLICTING_RULE_SCORE) {
    reviewReasons.push(`Keyword rules suggested ${categoryRules.category}`);
  }

  return { suggestedCategory: model.category, source: CLASSIFICATION_SOURCES.AI, confidence: model.confidence, reviewReasons };
};

// Rules set the priority whenever they match. The model fills in when no rule matched, and may raise
// (never lower) a rule-based priority; a raise is flagged, since ticket text could push for it.
const decidePriority = (priorityRules, model) => {
  if (!model) {
    return { suggestedPriority: priorityRules.priority, prioritySource: PRIORITY_SOURCES.RULES, reasoning: priorityRules.reason, reviewReasons: [] };
  }

  if (!priorityRules.matched) {
    return { suggestedPriority: model.priority, prioritySource: PRIORITY_SOURCES.AI, reasoning: model.reason, reviewReasons: [] };
  }

  if (higherPriority(model.priority, priorityRules.priority) !== priorityRules.priority) {
    return {
      suggestedPriority: model.priority,
      prioritySource: PRIORITY_SOURCES.AI,
      reasoning: `${model.reason} (rules said ${priorityRules.priority}: ${priorityRules.reason})`,
      reviewReasons: [`AI raised priority above the rules' ${priorityRules.priority}`],
    };
  }

  return { suggestedPriority: priorityRules.priority, prioritySource: PRIORITY_SOURCES.RULES, reasoning: priorityRules.reason, reviewReasons: [] };
};

// Combines rule results with the model's answer (or its failure) into the stored suggestion.
// Suspected injection means the keyword rules may have been steered, so they never decide alone.
export const decideTriage = ({ categoryRules, priorityRules, model = null, modelError = null, suspectedInjection = false }) => {
  const trustedRules = suspectedInjection ? { ...categoryRules, strong: false } : categoryRules;
  const category = decideCategory(trustedRules, model, modelError);
  const priority = decidePriority(priorityRules, model);
  const reviewReasons = [
    ...(suspectedInjection ? ['Ticket text contains instructions aimed at the system (possible prompt injection)'] : []),
    ...category.reviewReasons,
    ...priority.reviewReasons,
  ];

  return {
    status: CLASSIFICATION_STATUSES.COMPLETED,
    source: category.source,
    suggestedCategory: category.suggestedCategory,
    confidence: category.confidence,
    suggestedPriority: priority.suggestedPriority,
    prioritySource: priority.prioritySource,
    reasoning: priority.reasoning.slice(0, MAX_REASONING_LENGTH),
    signals: [...categoryRules.signals, ...priorityRules.signals],
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    model: model ? env.ai.generationModel : null,
    rulesVersion: TRIAGE_RULES_VERSION,
  };
};

/**
 * Rules first; the model is asked only when they leave something open: the category is unclear, no
 * priority rule matched, or the text looks like an injection attempt. AI failures fall back to the rules.
 * Shared by the triage job and the evaluation (which passes `classify` to reuse answers it already has).
 */
export const assessTicket = async (ticket, book, { now = new Date(), correlationId, classify = classifyWithModel } = {}) => {
  const text = normalizeTicketText(ticket);
  const categoryRules = classifyCategoryByRules(text);
  const priorityRules = assessPriorityByRules(text, book, now);
  const suspectedInjection = looksLikeInjection(text);
  const modelNeeded = !categoryRules.strong || !priorityRules.matched || suspectedInjection;

  let model = null;
  let modelError = null;
  if (modelNeeded) {
    try {
      model = await classify(ticket, { correlationId });
    } catch (error) {
      if (!(error instanceof AiError)) {
        throw error;
      }
      modelError = error.code;
    }
  }

  return {
    decision: decideTriage({ categoryRules, priorityRules, model, modelError, suspectedInjection }),
    categoryRules,
    modelNeeded,
  };
};

// Takes the ticket's lease, so concurrent workers (or a re-run after a crash) never triage it twice.
const claimTicket = (ticketId, now) =>
  Ticket.findOneAndUpdate(
    {
      _id: ticketId,
      'classification.status': CLASSIFICATION_STATUSES.PENDING,
      $or: [{ 'classification.lockedUntil': null }, { 'classification.lockedUntil': { $lte: now } }],
    },
    { $set: { 'classification.lockedUntil': new Date(now.getTime() + LEASE_MS) }, $inc: { 'classification.attempts': 1 } },
    { projection: 'ticketNumber author book subject description classification.attempts', returnDocument: 'after', lean: true },
  );

const loadBookFacts = async (bookId) => {
  if (!bookId) {
    return null;
  }

  const book = await Book.findById(bookId)
    .select('status publicationDate totalRoyaltyEarned royaltyPaid lastRoyaltyPayoutDate')
    .lean();

  return book && { ...book, royaltyPending: Math.max(book.totalRoyaltyEarned - book.royaltyPaid, 0) };
};

// Writes the suggestion. Effective category and priority are only filled when still empty, so a value
// an admin set while triage was running is never overwritten. $literal keeps text such as "$5" from
// being read as a field path.
const saveDecision = (ticketId, decision, now) =>
  Ticket.updateOne({ _id: ticketId, 'classification.status': CLASSIFICATION_STATUSES.PENDING }, [
    {
      $set: {
        classification: {
          $mergeObjects: ['$classification', { $literal: { ...decision, classifiedAt: now, lockedUntil: null } }],
        },
        category: { $ifNull: ['$category', { $literal: decision.suggestedCategory }] },
        priority: { $ifNull: ['$priority', { $literal: decision.suggestedPriority }] },
      },
    },
  ], { updatePipeline: true });

const markFailed = (ticketId) =>
  Ticket.updateOne(
    { _id: ticketId, 'classification.status': CLASSIFICATION_STATUSES.PENDING },
    {
      $set: {
        'classification.status': CLASSIFICATION_STATUSES.FAILED,
        'classification.needsReview': true,
        'classification.reviewReasons': ['Automatic triage failed repeatedly; set category and priority manually'],
        'classification.lockedUntil': null,
      },
    },
  );

/**
 * Suggests a category and priority for a ticket (see assessTicket for when the model is asked).
 * Any AI failure falls back to the rules, so triage always completes unless
 * the database itself fails (then the lease expires and the worker retries). Returns null when the
 * ticket is already triaged or another worker holds it.
 */
export const triageTicket = async (ticketId, { correlationId } = {}) => {
  const now = new Date();
  const ticket = await claimTicket(ticketId, now);

  if (!ticket) {
    return null;
  }

  if (ticket.classification.attempts > MAX_TRIAGE_ATTEMPTS) {
    await markFailed(ticketId);
    publishTicketChange({ ticket, action: TICKET_ACTIONS.CLASSIFIED, actor: SYSTEM_ACTOR, adminOnly: true });
    logger.error('Ticket triage abandoned after repeated failures', { ticketId: String(ticketId), correlationId });
    return null;
  }

  const { decision } = await assessTicket(ticket, await loadBookFacts(ticket.book), { now, correlationId });
  await saveDecision(ticketId, decision, now);

  publishTicketChange({ ticket, action: TICKET_ACTIONS.CLASSIFIED, actor: SYSTEM_ACTOR, adminOnly: true });
  logger.info('Ticket triaged', {
    ticketNumber: ticket.ticketNumber,
    correlationId,
    source: decision.source,
    prioritySource: decision.prioritySource,
    needsReview: decision.needsReview,
  });

  return decision;
};
