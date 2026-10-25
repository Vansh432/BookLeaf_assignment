import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { ApiError } from '@google/genai';
import { getGeminiClient } from '../../../infrastructure/ai/gemini.client.js';
import { geminiCircuit } from '../../../modules/ai/ai.circuitBreaker.js';
import Book from '../../../modules/books/book.model.js';
import { getDraft, requestDraft } from '../../../modules/drafts/draft.service.js';
import KnowledgeChunk from '../../../modules/knowledge/knowledge.model.js';
import { syncKnowledgeChunks } from '../../../modules/knowledge/knowledge.service.js';
import Ticket from '../../../modules/tickets/ticket.model.js';
import { addMessage } from '../../../modules/tickets/ticket.service.js';
import User from '../../../modules/users/user.model.js';
import { useTestDatabase } from '../../helpers/database.js';

useTestDatabase();

const CHUNKS = [
  {
    chunkId: 'royalty-payout-schedule',
    section: 'Royalty Policy',
    title: 'Royalty payout cycle',
    category: 'Royalty & Payments',
    keywords: ['royalty', 'payout', 'not received'],
    content: 'Royalties are calculated quarterly and paid within 45 days of the quarter ending. Minimum payout threshold: ₹1,000.',
  },
  {
    chunkId: 'communication-tone',
    section: 'Communication Tone Guidelines',
    title: 'Tone',
    category: null,
    keywords: ['tone'],
    content: 'Be empathetic. Give clear timelines such as within 48 hours.',
  },
];

const REPLY = {
  paragraphs: [
    'Thank you for raising this.',
    'You have ₹5,280 pending, and royalties are paid within 45 days of the quarter ending.',
  ],
  citedPolicyIds: ['royalty-payout-schedule'],
  reviewNotes: ['Confirm bank details are linked'],
};

const modelResponse = (body = REPLY) => ({
  text: JSON.stringify(body),
  candidates: [{ finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 200 },
});

let author;
let admin;
let book;

const stubModel = (handler = async () => modelResponse()) => mock.method(getGeminiClient().models, 'generateContent', handler);

const createTicket = (fields = {}) =>
  Ticket.create({
    author: author._id,
    book: book._id,
    subject: 'Royalty not received',
    description: 'I have not received my royalty payout for Code & Karma.',
    category: 'Royalty & Payments',
    internalNotes: [{ author: admin._id, body: 'SECRET-NOTE: author is difficult' }],
    ...fields,
  });

describe('AI drafted replies', () => {
  beforeEach(async () => {
    geminiCircuit.reset();
    mock.restoreAll();
    // Query embedding succeeds, but local MongoDB has no Atlas Search, so retrieval falls back to keywords.
    mock.method(getGeminiClient().models, 'embedContent', async () => ({ embeddings: [{ values: [0.1, 0.2, 0.3, 0.4] }] }));
    author = await User.create({ name: 'Rohit Kapoor', email: 'rohit@test.dev', password: 'Password1', role: 'author' });
    admin = await User.create({ name: 'Admin', email: 'admin@test.dev', password: 'Password1', role: 'admin' });
    book = await Book.create({
      bookCode: 'BK003',
      author: author._id,
      title: 'Code & Karma',
      status: 'Published & Live',
      totalCopiesSold: 876,
      totalRoyaltyEarned: 26280,
      royaltyPaid: 21000,
    });
    await syncKnowledgeChunks({ source: 'test', chunks: CHUNKS });
  });

  it('drafts from retrieved policies and verified facts, never internal notes, and records policy versions', async () => {
    const stub = stubModel();
    const ticket = await createTicket();

    const draft = await requestDraft(ticket._id);

    assert.equal(draft.status, 'ready');
    assert.match(draft.content, /^Hi Rohit,\n\nThank you/);
    assert.match(draft.content, /₹5,280 pending/);
    assert.match(draft.content, /\n\nWarm regards,\nTeam BookLeaf$/);
    assert.deepEqual(draft.citedPolicyIds, ['royalty-payout-schedule']);
    assert.deepEqual(draft.reviewNotes, ['Confirm bank details are linked']);
    assert.deepEqual(draft.warnings, []);
    assert.deepEqual(
      draft.policies.map(({ chunkId, version }) => [chunkId, version]),
      [['royalty-payout-schedule', 1], ['communication-tone', 1]],
    );
    assert.equal(draft.stale, false);

    const { contents, config } = stub.mock.calls[0].arguments[0];
    assert.match(contents, /pending ₹5,280/);
    assert.match(contents, /\[policy:royalty-payout-schedule\]/);
    assert.doesNotMatch(contents, /SECRET-NOTE/);
    assert.match(config.systemInstruction, /within 48 hours/);
  });

  it('states an overdue royalty explicitly when the book record proves a missed payout cycle', async () => {
    const stub = stubModel();
    await Book.updateOne({ _id: book._id }, { lastRoyaltyPayoutDate: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000) });
    const ticket = await createTicket();

    await requestDraft(ticket._id);

    assert.match(stub.mock.calls[0].arguments[0].contents, /royalty payout is overdue: ₹5,280 is pending and there has been no payout for 300 days/);
  });

  it('flags figures the sources do not support', async () => {
    stubModel(async () => modelResponse({ ...REPLY, paragraphs: [...REPLY.paragraphs, 'We will also add a ₹2,500 bonus.'] }));
    const ticket = await createTicket();

    const draft = await requestDraft(ticket._id);

    assert.equal(draft.warnings.length, 1);
    assert.match(draft.warnings[0], /"2500"/);
  });

  it('reuses a current draft and regenerates once new messages make it stale', async () => {
    const stub = stubModel();
    const ticket = await createTicket();

    const first = await requestDraft(ticket._id);
    const again = await requestDraft(ticket._id);
    assert.equal(again.id, first.id);
    assert.equal(stub.mock.callCount(), 1);

    await addMessage({ id: String(author._id), role: 'author' }, String(ticket._id), { body: 'Any update on my royalty?' });
    const stale = await getDraft(ticket._id);
    assert.equal(stale.stale, true);
    assert.match(stale.staleReasons[0], /New messages/);

    const fresh = await requestDraft(ticket._id);
    assert.notEqual(fresh.id, first.id);
    assert.equal(fresh.stale, false);
    assert.equal(stub.mock.callCount(), 2);
  });

  it('marks a draft stale when a policy it used is updated', async () => {
    stubModel();
    const ticket = await createTicket();
    await requestDraft(ticket._id);

    await syncKnowledgeChunks({
      source: 'test',
      chunks: [{ ...CHUNKS[0], content: `${CHUNKS[0].content} Updated wording.` }, CHUNKS[1]],
    });

    const draft = await getDraft(ticket._id);
    assert.equal(draft.stale, true);
    assert.match(draft.staleReasons.join(' '), /policy/);
  });

  it('does not call the model when no policy is relevant', async () => {
    const stub = stubModel();
    const ticket = await createTicket({ book: null, category: null, subject: 'Hello', description: 'Just wanted to say thank you to everyone.' });

    const draft = await requestDraft(ticket._id);

    assert.equal(draft.status, 'no_policy');
    assert.equal(draft.content, null);
    assert.match(draft.notice, /write it manually/);
    assert.equal(stub.mock.callCount(), 0);
  });

  it('reports AI failures as an unavailable draft and retries on the next request', async () => {
    stubModel(async () => {
      throw new ApiError({ message: 'invalid key', status: 403 });
    });
    const ticket = await createTicket();

    const failed = await requestDraft(ticket._id);
    assert.equal(failed.status, 'unavailable');
    assert.match(failed.notice, /write the reply manually/);

    mock.restoreAll();
    mock.method(getGeminiClient().models, 'embedContent', async () => ({ embeddings: [{ values: [0.1, 0.2, 0.3, 0.4] }] }));
    stubModel();
    const retried = await requestDraft(ticket._id);
    assert.equal(retried.status, 'ready');
  });

  it('shares one generation between concurrent requests', async () => {
    const stub = stubModel();
    const ticket = await createTicket();

    const [a, b] = await Promise.all([requestDraft(ticket._id, { regenerate: true }), requestDraft(ticket._id, { regenerate: true })]);

    assert.equal(a.id, b.id);
    assert.equal(stub.mock.callCount(), 1);
  });

  it('records whether the admin sent the draft as-is or edited', async () => {
    stubModel();
    const ticket = await createTicket();
    const adminUser = { id: String(admin._id), role: 'admin' };

    const draft = await requestDraft(ticket._id);
    await addMessage(adminUser, String(ticket._id), { body: draft.content, draftId: draft.id });
    assert.equal((await Ticket.findById(ticket._id).lean()).aiDraft.sent.edited, false);

    const next = await requestDraft(ticket._id, { regenerate: true });
    await addMessage(adminUser, String(ticket._id), { body: `${next.content}\nP.S. Added note.`, draftId: next.id });
    const saved = await Ticket.findById(ticket._id).lean();
    assert.equal(saved.aiDraft.sent.edited, true);
    assert.equal(String(saved.aiDraft.sent.by), String(admin._id));
  });

  it('does not let authors attach a draft to their messages', async () => {
    const ticket = await createTicket();
    await assert.rejects(
      addMessage({ id: String(author._id), role: 'author' }, String(ticket._id), { body: 'Hi', draftId: crypto.randomUUID() }),
      { statusCode: 403 },
    );
  });

  it('keeps knowledge chunks it did not use out of the draft record', async () => {
    stubModel();
    await KnowledgeChunk.create({
      chunkId: 'isbn-errors',
      section: 'ISBN Policy',
      title: 'ISBN errors',
      category: 'ISBN & Metadata Issues',
      keywords: ['isbn'],
      content: 'ISBN errors are high priority.',
      source: 'test',
      contentHash: 'x',
    });
    const ticket = await createTicket();

    const draft = await requestDraft(ticket._id);

    assert.ok(!draft.policies.some((policy) => policy.chunkId === 'isbn-errors'));
  });
});
