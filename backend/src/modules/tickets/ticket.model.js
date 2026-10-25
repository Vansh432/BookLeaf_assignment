import mongoose from 'mongoose';
import {
  CLASSIFICATION_SOURCES,
  CLASSIFICATION_STATUSES,
  DRAFT_STATUSES,
  PRIORITY_SOURCES,
  ROLES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '../../config/constants.js';
import Counter from '../../database/models/counter.model.js';

const { ObjectId } = mongoose.Schema.Types;

const TICKET_NUMBER_PREFIX = 'BL-';
const TICKET_NUMBER_START = 1000;

// Conversation visible to the author: their follow-ups and the team's replies.
const messageSchema = new mongoose.Schema(
  {
    sender: { type: ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: Object.values(ROLES), required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Visible to admins only; never included in author-facing responses.
const internalNoteSchema = new mongoose.Schema(
  {
    author: { type: ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const attachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
);

// An admin correction of a suggested value, kept for auditing and for measuring triage accuracy.
const overrideSchema = new mongoose.Schema(
  {
    field: { type: String, enum: ['category', 'priority'], required: true },
    from: { type: String, default: null },
    to: { type: String, required: true },
    // What triage had suggested at the time, so overrides can be scored against predictions.
    suggested: { type: String, default: null },
    by: { type: ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Triage's original suggestion. The ticket's top-level category and priority hold the
// effective values, so an admin override is visible by comparing the two.
const classificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: Object.values(CLASSIFICATION_STATUSES),
      default: CLASSIFICATION_STATUSES.PENDING,
    },
    source: { type: String, enum: [...Object.values(CLASSIFICATION_SOURCES), null], default: null },
    suggestedCategory: { type: String, enum: [...TICKET_CATEGORIES, null], default: null },
    // Model-reported probability; an uncalibrated estimate. null when rules decided.
    confidence: { type: Number, min: 0, max: 1, default: null },
    suggestedPriority: { type: String, enum: [...TICKET_PRIORITIES, null], default: null },
    prioritySource: { type: String, enum: [...Object.values(PRIORITY_SOURCES), null], default: null },
    // Auditable explanation for the suggested priority.
    reasoning: { type: String, maxlength: 500 },
    // Rule signals that matched, e.g. "category:isbn", "priority:isbn-error".
    signals: { type: [String], default: [] },
    needsReview: { type: Boolean, default: false },
    reviewReasons: { type: [String], default: [] },
    model: { type: String },
    rulesVersion: { type: Number },
    classifiedAt: { type: Date },
    overrides: { type: [overrideSchema], default: [] },
    // Job bookkeeping: a lease stops two workers processing the same ticket at once.
    attempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { _id: false },
);

// Rolling summary of the older part of the conversation, so AI prompts carry this plus the latest
// messages instead of the full history. coveredMessageCount is the watermark: messages[0..count) are
// folded in. version increases on every save and guards against concurrent overwrites.
// Built from author-visible messages only; internal notes are never summarized.
const summarySchema = new mongoose.Schema(
  {
    text: { type: String, maxlength: 2000 },
    commitments: { type: [String], default: [] },
    openQuestions: { type: [String], default: [] },
    version: { type: Number, default: 0 },
    coveredMessageCount: { type: Number, default: 0 },
    model: { type: String },
    updatedAt: { type: Date },
  },
  { _id: false },
);

// A knowledge-base chunk a draft was grounded in, with the exact version used.
const draftPolicySchema = new mongoose.Schema(
  {
    chunkId: { type: String, required: true },
    version: { type: Number, required: true },
    title: { type: String },
    // Retrieval score; null for guidance that is always included (communication tone).
    score: { type: Number, default: null },
  },
  { _id: false },
);

// Latest AI draft, cached so reopening a ticket does not pay for another generation. It is stale once
// new messages arrive (basedOnMessageCount), the book/account facts change (factsHash) or a policy it
// used changes version. Drafts are never sent automatically: `sent` records an admin sending it.
const aiDraftSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    status: { type: String, enum: Object.values(DRAFT_STATUSES), required: true },
    // AI error code when status is unavailable.
    failureReason: { type: String, default: null },
    content: { type: String },
    reviewNotes: { type: [String], default: [] },
    // Grounding check results: possible unsupported claims for the reviewer to confirm.
    warnings: { type: [String], default: [] },
    citedPolicyIds: { type: [String], default: [] },
    policies: { type: [draftPolicySchema], default: [] },
    retrievalMethod: { type: String },
    model: { type: String },
    generatedAt: { type: Date },
    basedOnMessageCount: { type: Number },
    summaryVersion: { type: Number, default: null },
    factsHash: { type: String },
    correlationId: { type: String },
    sent: {
      type: new mongoose.Schema(
        {
          at: { type: Date, required: true },
          by: { type: ObjectId, ref: 'User', required: true },
          // False when the admin sent the draft unchanged.
          edited: { type: Boolean, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { _id: false },
);

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true },
    author: { type: ObjectId, ref: 'User', required: true },
    // null means the query is "General / Account Level".
    book: { type: ObjectId, ref: 'Book', default: null },
    subject: { type: String, required: true, trim: true, minlength: 5, maxlength: 150 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 5000 },
    attachments: { type: [attachmentSchema], default: [] },
    status: { type: String, enum: Object.values(TICKET_STATUSES), default: TICKET_STATUSES.OPEN },
    // null until classification finishes.
    category: { type: String, enum: [...TICKET_CATEGORIES, null], default: null },
    priority: { type: String, enum: [...TICKET_PRIORITIES, null], default: null },
    classification: { type: classificationSchema, default: () => ({}) },
    summary: { type: summarySchema, default: () => ({}) },
    aiDraft: { type: aiDraftSchema, default: null },
    messages: { type: [messageSchema], default: [] },
    internalNotes: { type: [internalNoteSchema], default: [] },
    assignedTo: { type: ObjectId, ref: 'User', default: null },
    lastActivityAt: { type: Date, default: Date.now },
    firstRespondedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false },
  },
);

// Author's "My Tickets" list.
ticketSchema.index({ author: 1, lastActivityAt: -1 });
// Admin queue: filter by status/priority/category, oldest first.
ticketSchema.index({ status: 1, priority: 1, createdAt: 1 });
ticketSchema.index({ category: 1, createdAt: 1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
// Triage worker sweep: pending classifications whose lease has expired.
ticketSchema.index(
  { 'classification.lockedUntil': 1 },
  { partialFilterExpression: { 'classification.status': CLASSIFICATION_STATUSES.PENDING } },
);

ticketSchema.pre('save', async function assignTicketNumber() {
  if (this.isNew && !this.ticketNumber) {
    const sequence = await Counter.next('ticket');
    this.ticketNumber = `${TICKET_NUMBER_PREFIX}${TICKET_NUMBER_START + sequence}`;
  }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

export default Ticket;
