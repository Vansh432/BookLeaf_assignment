import { randomUUID } from 'node:crypto';
import env from '../../config/env.js';
import Counter from '../../database/models/counter.model.js';
import AiBudget from './aiBudget.model.js';
import { AI_ERROR_CODES, AiError } from './ai.errors.js';

const DUPLICATE_KEY_CODE = 11000;
const MICRO_USD_PER_USD = 1e6;

// Prices are USD per 1M tokens, which is numerically micro-USD per token.
export const estimateCostMicroUsd = (model, { inputTokens = 0, outputTokens = 0, cachedTokens = 0 }) => {
  const price = env.ai.pricing[model];

  if (!price) {
    throw new AiError(AI_ERROR_CODES.NOT_CONFIGURED, `No AI_PRICING entry for model ${model}`);
  }

  const uncachedInput = Math.max(inputTokens - cachedTokens, 0);
  // Rounded up to whole micro-USD: totals stay integers and estimates err on the high side.
  return Math.ceil(
    uncachedInput * price.input + cachedTokens * (price.cachedInput ?? price.input) + outputTokens * price.output,
  );
};

export const toUsd = (microUsd) => microUsd / MICRO_USD_PER_USD;

export const budgetPeriods = (date = new Date()) => {
  const day = date.toISOString().slice(0, 10);
  return [
    { id: `day:${day}`, limitMicroUsd: env.ai.dailyBudgetUsd * MICRO_USD_PER_USD },
    { id: `month:${day.slice(0, 7)}`, limitMicroUsd: env.ai.monthlyBudgetUsd * MICRO_USD_PER_USD },
  ];
};

// Longer than any single AI call can take (3 attempts x 60s timeout, backoff and up to 60s queueing), so a
// live call's reservation never expires, while one abandoned by a crash or reload stops counting soon after.
export const RESERVATION_TTL_MS = 10 * 60 * 1000;

const ensurePeriod = async (id) => {
  try {
    await AiBudget.updateOne({ _id: id }, { $setOnInsert: { spentMicroUsd: 0, reservations: [] } }, { upsert: true });
  } catch (error) {
    // Two first calls of a period can race to create it; either insert is fine.
    if (error.code !== DUPLICATE_KEY_CODE) {
      throw error;
    }
  }
};

const unexpired = (now) => ({
  $filter: { input: { $ifNull: ['$reservations', []] }, cond: { $gt: ['$$this.expiresAt', now] } },
});

const releaseReservation = (periodIds, reservationId) =>
  AiBudget.updateMany({ _id: { $in: periodIds } }, { $pull: { reservations: { id: reservationId } } });

// Reserves the worst-case cost in every period before the call. Each reservation is one conditional update
// that checks spent + unexpired reservations + this call against the limit and, in the same write, adds
// the reservation and drops expired ones, so concurrent callers can never push a period past its limit.
export const reserveBudget = async (amountMicroUsd) => {
  const now = new Date();
  const reservation = { id: randomUUID(), amountMicroUsd, expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS) };
  const reserved = [];

  for (const period of budgetPeriods(now)) {
    await ensurePeriod(period.id);
    const { modifiedCount } = await AiBudget.updateOne(
      {
        _id: period.id,
        $expr: {
          $lte: [
            { $add: ['$spentMicroUsd', { $sum: { $map: { input: unexpired(now), in: '$$this.amountMicroUsd' } } }, amountMicroUsd] },
            period.limitMicroUsd,
          ],
        },
      },
      [{ $set: { reservations: { $concatArrays: [unexpired(now), [reservation]] } } }],
      { updatePipeline: true },
    );

    if (modifiedCount === 0) {
      if (reserved.length) {
        await releaseReservation(reserved, reservation.id);
      }
      throw new AiError(AI_ERROR_CODES.BUDGET_EXHAUSTED, `AI budget exhausted for ${period.id}`);
    }

    reserved.push(period.id);
  }

  return { periodIds: reserved, reservationId: reservation.id };
};

// Swaps the reservation for the actual estimated cost (0 when the provider was never billed).
export const settleBudget = ({ periodIds, reservationId }, actualMicroUsd) =>
  AiBudget.updateMany(
    { _id: { $in: periodIds } },
    { $pull: { reservations: { id: reservationId } }, $inc: { spentMicroUsd: actualMicroUsd } },
  );

const ticketCounterId = (ticketId) => `ai-calls:${ticketId}`;

// Atomic per-ticket call count, so one noisy ticket cannot drain the shared budget.
export const claimTicketCall = async (ticketId) => {
  const calls = await Counter.next(ticketCounterId(ticketId));

  if (calls > env.ai.maxCallsPerTicket) {
    throw new AiError(AI_ERROR_CODES.TICKET_LIMIT_REACHED, `AI call limit reached for ticket ${ticketId}`);
  }
};

// Gives the claim back when the call is stopped before reaching the provider.
export const releaseTicketCall = (ticketId) =>
  Counter.updateOne({ _id: ticketCounterId(ticketId) }, { $inc: { sequence: -1 } });

const activeReservedMicroUsd = (doc, now) =>
  (doc?.reservations ?? [])
    .filter((reservation) => new Date(reservation.expiresAt) > now)
    .reduce((sum, reservation) => sum + reservation.amountMicroUsd, 0);

export const getBudgetStatus = async () => {
  const now = new Date();
  const periods = budgetPeriods(now);
  const docs = await AiBudget.find({ _id: { $in: periods.map((period) => period.id) } }).lean();
  const byId = Object.fromEntries(docs.map((doc) => [doc._id, doc]));

  return periods.map(({ id, limitMicroUsd }) => ({
    period: id,
    limitUsd: toUsd(limitMicroUsd),
    spentUsd: toUsd(byId[id]?.spentMicroUsd ?? 0),
    // Only unexpired reservations: calls genuinely in flight right now.
    reservedUsd: toUsd(activeReservedMicroUsd(byId[id], now)),
  }));
};
