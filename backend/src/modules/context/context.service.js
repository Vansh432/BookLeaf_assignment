import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { AiError } from '../ai/ai.errors.js';
import Ticket from '../tickets/ticket.model.js';
import { speakerLabel, summarizeConversation } from './context.summarizer.js';

// Conversations up to this many messages beyond the summary go to prompts word for word, so most
// tickets are never summarized. Past it, all but the latest RECENT_MESSAGES are folded into the summary,
// which therefore refreshes about every five messages rather than on every request.
export const MAX_VERBATIM_MESSAGES = 8;
export const RECENT_MESSAGES = 4;
const MAX_FOLD_BATCH = 12;
const MAX_REFRESH_ROUNDS = 3;

// Only author-visible messages are read: internal notes are not even loaded.
const CONTEXT_FIELDS = 'subject description createdAt summary messages.senderRole messages.body messages.createdAt';

const loadTicket = (ticketId) => Ticket.findById(ticketId).select(CONTEXT_FIELDS).lean();

// Which messages (by index) to fold into the summary next, or null when it is current enough.
export const planSummaryRefresh = ({ messageCount, coveredMessageCount }) => {
  if (messageCount - coveredMessageCount <= MAX_VERBATIM_MESSAGES) {
    return null;
  }
  return {
    from: coveredMessageCount,
    to: Math.min(messageCount - RECENT_MESSAGES, coveredMessageCount + MAX_FOLD_BATCH),
  };
};

// Tickets created before summaries existed have no version field; null matches those.
const versionFilter = (version) => ({ 'summary.version': version === 0 ? { $in: [0, null] } : version });

/**
 * Brings the ticket's summary up to date, folding at most MAX_FOLD_BATCH messages per model call.
 * Each save is conditioned on the version it was built from, so a slower concurrent refresh can never
 * overwrite a newer summary; the loser just stops. Throws AiError when the model is unavailable.
 * Returns the current summary, or null when another refresh won the race.
 */
export const refreshSummary = async (ticketId, { correlationId } = {}) => {
  let ticket = await loadTicket(ticketId);
  if (!ticket) {
    return null;
  }

  for (let round = 0; round < MAX_REFRESH_ROUNDS; round += 1) {
    const previous = ticket.summary ?? {};
    const version = previous.version ?? 0;
    const plan = planSummaryRefresh({
      messageCount: ticket.messages.length,
      coveredMessageCount: previous.coveredMessageCount ?? 0,
    });

    if (!plan) {
      break;
    }

    const next = await summarizeConversation({
      ticket,
      previous,
      messages: ticket.messages.slice(plan.from, plan.to),
      correlationId,
    });
    const summary = {
      ...next,
      version: version + 1,
      coveredMessageCount: plan.to,
      model: env.ai.generationModel,
      updatedAt: new Date(),
    };

    const { modifiedCount } = await Ticket.updateOne({ _id: ticketId, ...versionFilter(version) }, { $set: { summary } });
    if (!modifiedCount) {
      logger.info('Ticket summary changed concurrently; kept the newer version', { ticketId: String(ticketId), correlationId });
      return null;
    }

    ticket = { ...ticket, summary };
  }

  return ticket.summary;
};

const refreshing = new Set();

// Fire-and-forget refresh after a new message. Cheap when nothing is due (one read, no model call);
// duplicate triggers for the same ticket in this process are skipped.
export const scheduleSummaryRefresh = (ticketId, { correlationId } = {}) => {
  const id = String(ticketId);
  if (refreshing.has(id)) {
    return;
  }

  refreshing.add(id);
  refreshSummary(id, { correlationId })
    .catch((error) => {
      const log = error instanceof AiError ? logger.warn : logger.error;
      log('Ticket summary refresh failed', { ticketId: id, correlationId, error: error.message });
    })
    .finally(() => refreshing.delete(id));
};

const toPromptMessage = ({ senderRole, body, createdAt }) => ({ speaker: speakerLabel(senderRole), senderRole, body, createdAt });

/**
 * Compact, author-visible context for a follow-up prompt: the original query, the summary of older
 * messages, and the newest messages verbatim. Refreshes the summary first when it is due; if that
 * fails, the newest MAX_VERBATIM_MESSAGES are kept and omittedMessageCount says how many were left out.
 */
export const buildConversationContext = async (ticketId, { correlationId } = {}) => {
  let ticket = await loadTicket(ticketId);
  if (!ticket) {
    return null;
  }

  const due = planSummaryRefresh({
    messageCount: ticket.messages.length,
    coveredMessageCount: ticket.summary?.coveredMessageCount ?? 0,
  });

  if (due) {
    try {
      await refreshSummary(ticketId, { correlationId });
      ticket = await loadTicket(ticketId);
    } catch (error) {
      if (!(error instanceof AiError)) {
        throw error;
      }
      logger.warn('Using unsummarized context', { ticketId: String(ticketId), correlationId, reason: error.code });
    }
  }

  const covered = ticket.summary?.coveredMessageCount ?? 0;
  const uncovered = ticket.messages.slice(covered);
  const recent = uncovered.slice(-MAX_VERBATIM_MESSAGES);
  const { text, commitments, openQuestions, version } = ticket.summary ?? {};

  return {
    subject: ticket.subject,
    description: ticket.description,
    createdAt: ticket.createdAt,
    summary: text ? { text, commitments, openQuestions, version, coveredMessageCount: covered } : null,
    recentMessages: recent.map(toPromptMessage),
    omittedMessageCount: uncovered.length - recent.length,
    messageCount: ticket.messages.length,
  };
};
