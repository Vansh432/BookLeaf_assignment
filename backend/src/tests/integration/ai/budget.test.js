import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mongoose from 'mongoose';
import {
  budgetPeriods,
  claimTicketCall,
  getBudgetStatus,
  releaseTicketCall,
  reserveBudget,
  settleBudget,
} from '../../../modules/ai/ai.budget.js';
import AiBudget from '../../../modules/ai/aiBudget.model.js';
import { AI_ERROR_CODES } from '../../../modules/ai/ai.errors.js';
import { useTestDatabase } from '../../helpers/database.js';

useTestDatabase();

const [day, month] = budgetPeriods().map((period) => period.id);

const reservedIn = async (id) =>
  ((await AiBudget.findById(id).lean())?.reservations ?? []).reduce((sum, reservation) => sum + reservation.amountMicroUsd, 0);

describe('reserveBudget', () => {
  it('never lets concurrent reservations exceed the daily limit', async () => {
    // Daily limit is 1 USD = 1,000,000 micro-USD; 25 concurrent 100,000 reservations can fit only 10.
    const results = await Promise.allSettled(Array.from({ length: 25 }, () => reserveBudget(100_000)));

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 10);
    for (const rejected of results.filter((result) => result.status === 'rejected')) {
      assert.equal(rejected.reason.code, AI_ERROR_CODES.BUDGET_EXHAUSTED);
    }

    assert.equal(await reservedIn(day), 1_000_000);
  });

  it('settles the reservation into actual spend', async () => {
    const reservation = await reserveBudget(50_000);
    await settleBudget(reservation, 1_234);

    for (const id of [day, month]) {
      const doc = await AiBudget.findById(id).lean();
      assert.equal(doc.reservations.length, 0);
      assert.equal(doc.spentMicroUsd, 1_234);
    }
  });

  it('releases the daily reservation when the monthly budget is exhausted', async () => {
    await AiBudget.create({ _id: month, spentMicroUsd: 4_990_000 });

    await assert.rejects(reserveBudget(50_000), { code: AI_ERROR_CODES.BUDGET_EXHAUSTED });

    assert.equal(await reservedIn(day), 0);
  });

  it('stops counting a reservation abandoned by a crash once it expires, and prunes it', async () => {
    // A call that reserved most of the budget and never settled (process killed mid-call).
    await AiBudget.create({
      _id: day,
      spentMicroUsd: 0,
      reservations: [{ id: 'abandoned', amountMicroUsd: 950_000, expiresAt: new Date(Date.now() - 1000) }],
    });

    await assert.doesNotReject(reserveBudget(100_000));

    const doc = await AiBudget.findById(day).lean();
    assert.deepEqual(doc.reservations.map((reservation) => reservation.id).includes('abandoned'), false);
    const [today] = await getBudgetStatus();
    assert.equal(today.reservedUsd, 0.1);
  });

  it('still counts reservations of calls in flight', async () => {
    await AiBudget.create({
      _id: day,
      spentMicroUsd: 0,
      reservations: [{ id: 'in-flight', amountMicroUsd: 950_000, expiresAt: new Date(Date.now() + 60_000) }],
    });

    await assert.rejects(reserveBudget(100_000), { code: AI_ERROR_CODES.BUDGET_EXHAUSTED });
  });
});

describe('claimTicketCall', () => {
  it('enforces the per-ticket limit atomically and can give a claim back', async () => {
    const ticketId = new mongoose.Types.ObjectId();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => claimTicketCall(ticketId)));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 3);

    await releaseTicketCall(ticketId);
    await releaseTicketCall(ticketId);
    await releaseTicketCall(ticketId);
    await assert.doesNotReject(claimTicketCall(ticketId));
  });
});
