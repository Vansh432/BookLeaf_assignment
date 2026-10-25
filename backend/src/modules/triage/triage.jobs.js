import { CLASSIFICATION_STATUSES } from '../../config/constants.js';
import logger from '../../config/logger.js';
import Ticket from '../tickets/ticket.model.js';
import { triageTicket } from './triage.service.js';

// Triage runs in the API process: volume is a handful of tickets a minute and each job is one rules pass
// plus at most one model call, so Redis/BullMQ would add infrastructure without benefit. Durability comes
// from MongoDB: a ticket stays "pending" until triaged, and the sweep picks up anything missed (a crash,
// a restart, a failed run) once its lease expires.
const MAX_CONCURRENT_JOBS = 2;
const SWEEP_INTERVAL_MS = 60 * 1000;
const SWEEP_BATCH_SIZE = 20;

const queue = [];
const queuedIds = new Set();
let running = 0;
let sweepTimer = null;

const drain = () => {
  while (running < MAX_CONCURRENT_JOBS && queue.length) {
    const { ticketId, correlationId } = queue.shift();
    running += 1;

    triageTicket(ticketId, { correlationId })
      .catch((error) => logger.error('Ticket triage failed', { ticketId, correlationId, error: error.message }))
      .finally(() => {
        running -= 1;
        queuedIds.delete(ticketId);
        drain();
      });
  }
};

// Fire-and-forget: ticket creation never waits for (or fails because of) triage.
export const enqueueTriage = (ticketId, { correlationId } = {}) => {
  const id = String(ticketId);
  if (queuedIds.has(id)) {
    return;
  }

  queuedIds.add(id);
  queue.push({ ticketId: id, correlationId });
  drain();
};

const sweep = async () => {
  try {
    const pending = await Ticket.find({
      'classification.status': CLASSIFICATION_STATUSES.PENDING,
      $or: [{ 'classification.lockedUntil': null }, { 'classification.lockedUntil': { $lte: new Date() } }],
    })
      .sort({ createdAt: 1 })
      .limit(SWEEP_BATCH_SIZE)
      .select('_id')
      .lean();

    pending.forEach(({ _id }) => enqueueTriage(_id, { correlationId: `triage-sweep-${_id}` }));
  } catch (error) {
    logger.error('Triage sweep failed', { error: error.message });
  }
};

export const startTriageWorker = () => {
  if (sweepTimer) {
    return;
  }
  sweep();
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  sweepTimer.unref();
};

export const stopTriageWorker = () => {
  clearInterval(sweepTimer);
  sweepTimer = null;
};
