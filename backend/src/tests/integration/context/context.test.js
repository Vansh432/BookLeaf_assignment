import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { beforeEach, describe, it, mock } from 'node:test';
import { ApiError } from '@google/genai';
import { getGeminiClient } from '../../../infrastructure/ai/gemini.client.js';
import { geminiCircuit } from '../../../modules/ai/ai.circuitBreaker.js';
import { buildConversationContext, refreshSummary } from '../../../modules/context/context.service.js';
import Ticket from '../../../modules/tickets/ticket.model.js';
import { addMessage } from '../../../modules/tickets/ticket.service.js';
import User from '../../../modules/users/user.model.js';
import { useTestDatabase } from '../../helpers/database.js';

useTestDatabase();

let author;
let admin;

const summaryResponse = (text = 'Author awaits a re-sync of their Amazon listing.') => ({
  text: JSON.stringify({ summary: text, commitments: ['2026-10-20: promised a re-sync within 24-48 hours'], openQuestions: [] }),
  candidates: [{ finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 60 },
});

const stubModel = (handler = async () => summaryResponse()) => mock.method(getGeminiClient().models, 'generateContent', handler);

// Alternating author/team messages, numbered so prompts can be checked for exactly which were sent.
const messages = (count, start = 1) =>
  Array.from({ length: count }, (_, index) => {
    const fromAuthor = (start + index) % 2 === 1;
    return {
      sender: fromAuthor ? author._id : admin._id,
      senderRole: fromAuthor ? 'author' : 'admin',
      body: `message-${start + index}`,
    };
  });

const createTicket = (messageCount, extra = {}) =>
  Ticket.create({
    author: author._id,
    subject: 'Book unavailable on Amazon',
    description: 'My book shows as currently unavailable on Amazon India.',
    messages: messages(messageCount),
    ...extra,
  });

const promptOf = (stub, call = 0) => stub.mock.calls[call].arguments[0].contents;

describe('conversation context', () => {
  beforeEach(async () => {
    geminiCircuit.reset();
    mock.restoreAll();
    author = await User.create({ name: 'Test Author', email: 'author@test.dev', password: 'Password1', role: 'author' });
    admin = await User.create({ name: 'Test Admin', email: 'admin@test.dev', password: 'Password1', role: 'admin' });
  });

  it('passes short conversations verbatim without calling the model', async () => {
    const stub = stubModel();
    const ticket = await createTicket(5);

    const context = await buildConversationContext(ticket._id);

    assert.equal(stub.mock.callCount(), 0);
    assert.equal(context.summary, null);
    assert.equal(context.recentMessages.length, 5);
    assert.equal(context.recentMessages[1].speaker, 'BookLeaf team');
    assert.equal(context.omittedMessageCount, 0);
  });

  it('summarizes older messages, keeps the latest four verbatim, and never reads internal notes', async () => {
    const stub = stubModel();
    const ticket = await createTicket(10, { internalNotes: [{ author: admin._id, body: 'SECRET-NOTE do not share' }] });

    const context = await buildConversationContext(ticket._id);

    const prompt = promptOf(stub);
    assert.match(prompt, /message-1\b/);
    assert.match(prompt, /message-6\b/);
    assert.doesNotMatch(prompt, /message-7\b/);
    assert.doesNotMatch(prompt, /SECRET-NOTE/);
    assert.equal(context.summary.version, 1);
    assert.equal(context.summary.coveredMessageCount, 6);
    assert.deepEqual(context.recentMessages.map((message) => message.body), ['message-7', 'message-8', 'message-9', 'message-10']);
  });

  it('refreshes incrementally, sending only the previous summary and the new messages', async () => {
    const stub = stubModel();
    const ticket = await createTicket(10);
    await refreshSummary(ticket._id);
    await Ticket.updateOne({ _id: ticket._id }, { $push: { messages: { $each: messages(5, 11) } } });

    const summary = await refreshSummary(ticket._id);

    const prompt = promptOf(stub, 1);
    assert.match(prompt, /Previous summary: Author awaits a re-sync/);
    assert.doesNotMatch(prompt, /message-6\b/);
    assert.match(prompt, /message-7\b/);
    assert.match(prompt, /message-11\b/);
    assert.equal(summary.version, 2);
    assert.equal(summary.coveredMessageCount, 11);
  });

  it('folds a large backlog in bounded batches', async () => {
    const stub = stubModel();
    const ticket = await createTicket(30);

    const summary = await refreshSummary(ticket._id);

    assert.equal(stub.mock.callCount(), 2);
    assert.equal(summary.coveredMessageCount, 24);
    assert.equal(summary.version, 2);
  });

  it('lets only one of two concurrent refreshes save', async () => {
    stubModel();
    const ticket = await createTicket(10);

    const results = await Promise.all([refreshSummary(ticket._id), refreshSummary(ticket._id)]);

    assert.equal(results.filter(Boolean).length, 1);
    const saved = await Ticket.findById(ticket._id).lean();
    assert.equal(saved.summary.version, 1);
  });

  it('never overwrites a summary saved while the model was working', async () => {
    const ticket = await createTicket(10);
    stubModel(async () => {
      await Ticket.updateOne(
        { _id: ticket._id },
        { $set: { summary: { text: 'Newer summary', version: 1, coveredMessageCount: 6 } } },
      );
      return summaryResponse('Stale summary');
    });

    assert.equal(await refreshSummary(ticket._id), null);
    const saved = await Ticket.findById(ticket._id).lean();
    assert.equal(saved.summary.text, 'Newer summary');
  });

  it('falls back to the newest messages, reporting omissions, when the model is unavailable', async () => {
    stubModel(async () => {
      throw new ApiError({ message: 'invalid key', status: 403 });
    });
    const ticket = await createTicket(12);

    const context = await buildConversationContext(ticket._id);

    assert.equal(context.summary, null);
    assert.equal(context.recentMessages.length, 8);
    assert.equal(context.recentMessages[0].body, 'message-5');
    assert.equal(context.omittedMessageCount, 4);
  });

  it('refreshes in the background once a new message makes the conversation long enough', async () => {
    stubModel();
    const ticket = await createTicket(8);
    const authorUser = { id: String(author._id), role: 'author' };

    await addMessage(authorUser, String(ticket._id), { body: 'message-9' });

    for (let i = 0; i < 50; i += 1) {
      const saved = await Ticket.findById(ticket._id).lean();
      if (saved.summary?.version === 1) {
        assert.equal(saved.summary.coveredMessageCount, 5);
        return;
      }
      await sleep(20);
    }
    assert.fail('Summary was not refreshed in the background');
  });
});
