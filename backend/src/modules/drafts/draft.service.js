import { randomUUID } from 'node:crypto';
import { AI_OPERATIONS, DRAFT_STATUSES } from '../../config/constants.js';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import AppError from '../../shared/errors/AppError.js';
import { AiError } from '../ai/ai.errors.js';
import { generateStructured, ThinkingLevel } from '../ai/ai.generation.js';
import { buildConversationContext } from '../context/context.service.js';
import { getActiveChunks, searchKnowledge } from '../knowledge/knowledge.service.js';
import Ticket from '../tickets/ticket.model.js';
import { loadAccountFacts } from './draft.facts.js';
import { checkGrounding } from './draft.grounding.js';
import { buildDraftPrompt, buildSystemInstruction, draftSchema, tidyDraft } from './draft.prompt.js';

// Always included as writing guidance; it is not counted as a retrieved policy.
const TONE_CHUNK_ID = 'communication-tone';
const MAX_POLICIES = 4;
const MAX_QUERY_CHARS = 2000;
// Policies (~600) + facts (~400) + query (~1,700) + summary + 8 messages (older ones clipped).
const MAX_INPUT_TOKENS = 12000;
const MAX_OUTPUT_TOKENS = 2048;

// Safe, actionable text for the admin UI; never includes provider error details.
const NOTICES = {
  [DRAFT_STATUSES.NO_POLICY]: 'No BookLeaf policy matches this query closely enough to draft a reply. Please write it manually.',
  [DRAFT_STATUSES.UNAVAILABLE]: 'AI drafting is unavailable right now. Please write the reply manually or try again later.',
};

const TICKET_FIELDS = 'ticketNumber author book subject description category createdAt messages.senderRole messages.body aiDraft';

const loadTicket = async (ticketId) => {
  const ticket = await Ticket.findById(ticketId).select(TICKET_FIELDS).lean();
  if (!ticket) {
    throw AppError.notFound('Ticket not found');
  }
  return ticket;
};

// What the author is asking now: the original query plus their latest message.
const retrievalQuery = (ticket) => {
  const latestAuthorMessage = ticket.messages.findLast((message) => message.senderRole === 'author');
  return [ticket.subject, ticket.description, latestAuthorMessage?.body].filter(Boolean).join('\n').slice(0, MAX_QUERY_CHARS);
};

// Searches within the ticket's category first; a misclassified ticket still gets a chance across all policies.
export const retrievePolicies = async (ticket, correlationId) => {
  const query = retrievalQuery(ticket);
  const options = { limit: MAX_POLICIES, correlationId };
  const search = async (category) => {
    const result = await searchKnowledge(query, { ...options, category });
    // Tone guidance is added separately, so it never takes a policy slot.
    return { ...result, chunks: result.chunks.filter((chunk) => chunk.chunkId !== TONE_CHUNK_ID) };
  };

  const scoped = await search(ticket.category);
  return scoped.chunks.length || !ticket.category ? scoped : search(null);
};

const toPolicyRecord = ({ chunkId, version, title, score }) => ({ chunkId, version, title, score: score ?? null });

export const loadToneGuidance = async () => (await getActiveChunks([TONE_CHUNK_ID]))[0] ?? null;

/**
 * Asks the model for a reply grounded in the given policies, facts and conversation, then runs the
 * grounding checks. Throws AiError when the model is unavailable. Shared by the draft endpoint and the
 * evaluation, so both measure the same prompt.
 */
export const writeDraft = async ({ ticket, policies, tone, facts, context, now, ticketId, correlationId }) => {
  const prompt = buildDraftPrompt({ ticket, policies, facts: facts.text, context, now });
  const result = tidyDraft(
    await generateStructured({
      operation: AI_OPERATIONS.DRAFT,
      model: env.ai.draftModel,
      systemInstruction: buildSystemInstruction(tone?.content),
      prompt,
      schema: draftSchema,
      maxInputTokens: MAX_INPUT_TOKENS,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingLevel: ThinkingLevel.LOW,
      ticketId,
      correlationId,
    }),
    { firstName: facts.firstName },
  );

  const grounding = checkGrounding({
    reply: result.reply,
    citedPolicyIds: result.citedPolicyIds,
    policyIds: policies.map((chunk) => chunk.chunkId),
    // The tone guidance (with its own timelines, e.g. 48 hours) is part of what the model was given.
    sourceText: `${prompt}\n${tone?.content ?? ''}`,
  });

  return { ...result, ...grounding };
};

// Saves only if no other draft was saved since this one started, so a slow generation cannot replace a newer draft.
const saveDraft = async (ticket, draft) => {
  const { modifiedCount } = await Ticket.updateOne(
    { _id: ticket._id, 'aiDraft.id': ticket.aiDraft?.id ?? null },
    { $set: { aiDraft: draft } },
  );

  if (!modifiedCount) {
    logger.info('A newer draft was saved concurrently; keeping it', { ticketId: String(ticket._id) });
    return (await loadTicket(ticket._id)).aiDraft;
  }
  return draft;
};

const generateDraft = async (ticketId, { correlationId }) => {
  const now = new Date();
  const ticket = await loadTicket(ticketId);
  const facts = await loadAccountFacts(ticket, now);
  const retrieval = await retrievePolicies(ticket, correlationId);

  const base = {
    id: randomUUID(),
    generatedAt: now,
    basedOnMessageCount: ticket.messages.length,
    factsHash: facts.hash,
    retrievalMethod: retrieval.method,
    policies: retrieval.chunks.map(toPolicyRecord),
    correlationId,
  };

  if (!retrieval.chunks.length) {
    return saveDraft(ticket, { ...base, status: DRAFT_STATUSES.NO_POLICY });
  }

  const tone = await loadToneGuidance();
  const context = await buildConversationContext(ticketId, { correlationId });
  const policies = [...base.policies, ...(tone ? [toPolicyRecord(tone)] : [])];

  let written;
  try {
    written = await writeDraft({ ticket, policies: retrieval.chunks, tone, facts, context, now, ticketId, correlationId });
  } catch (error) {
    if (!(error instanceof AiError)) {
      throw error;
    }
    return saveDraft(ticket, { ...base, policies, status: DRAFT_STATUSES.UNAVAILABLE, failureReason: error.code });
  }

  logger.info('Draft generated', {
    ticketNumber: ticket.ticketNumber,
    correlationId,
    policies: retrieval.chunks.length,
    unsupportedClaims: written.unsupportedClaimCount,
  });

  return saveDraft(ticket, {
    ...base,
    policies,
    status: DRAFT_STATUSES.READY,
    content: written.reply,
    reviewNotes: written.reviewNotes,
    warnings: written.warnings,
    citedPolicyIds: written.citedPolicyIds,
    model: env.ai.draftModel,
    summaryVersion: context.summary?.version ?? null,
  });
};

const staleReasons = async (ticket, draft) => {
  const reasons = [];

  if (ticket.messages.length !== draft.basedOnMessageCount) {
    reasons.push('New messages were added after this draft was written');
  }

  const [facts, current] = await Promise.all([
    loadAccountFacts(ticket),
    getActiveChunks(draft.policies.map((policy) => policy.chunkId)),
  ]);

  if (facts.hash !== draft.factsHash) {
    reasons.push('Book or account details have changed');
  }

  const currentVersions = new Map(current.map((chunk) => [chunk.chunkId, chunk.version]));
  if (draft.policies.some((policy) => currentVersions.get(policy.chunkId) !== policy.version)) {
    reasons.push('A BookLeaf policy used by this draft has been updated');
  }

  return reasons;
};

const toView = async (ticket, draft) => {
  const reasons = await staleReasons(ticket, draft);
  return {
    id: draft.id,
    status: draft.status,
    content: draft.content ?? null,
    reviewNotes: draft.reviewNotes ?? [],
    warnings: draft.warnings ?? [],
    citedPolicyIds: draft.citedPolicyIds ?? [],
    policies: draft.policies ?? [],
    retrievalMethod: draft.retrievalMethod ?? null,
    model: draft.model ?? null,
    generatedAt: draft.generatedAt,
    notice: NOTICES[draft.status] ?? null,
    stale: reasons.length > 0,
    staleReasons: reasons,
    sent: draft.sent ?? null,
  };
};

export const getDraft = async (ticketId) => {
  const ticket = await loadTicket(ticketId);
  return ticket.aiDraft ? toView(ticket, ticket.aiDraft) : null;
};

const inFlight = new Map();

/**
 * Returns the cached draft when it is still current; otherwise generates one. Unavailable drafts are
 * always retried. Concurrent requests for the same ticket share one generation, so opening a ticket in
 * two tabs does not pay twice. Generation is never automatic: nothing is sent until an admin sends it.
 */
export const requestDraft = async (ticketId, { regenerate = false, correlationId } = {}) => {
  if (!regenerate) {
    const cached = await getDraft(ticketId);
    if (cached && !cached.stale && cached.status !== DRAFT_STATUSES.UNAVAILABLE) {
      return cached;
    }
  }

  const id = String(ticketId);
  if (!inFlight.has(id)) {
    inFlight.set(
      id,
      generateDraft(id, { correlationId }).finally(() => inFlight.delete(id)),
    );
  }

  const draft = await inFlight.get(id);
  return toView(await loadTicket(id), draft);
};
