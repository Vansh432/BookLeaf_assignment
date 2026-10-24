import mongoose from 'mongoose';
import {
  CLASSIFICATION_SOURCES,
  CLASSIFICATION_STATUSES,
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

// The model's original suggestion. The ticket's top-level category and priority hold the
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
    suggestedPriority: { type: String, enum: [...TICKET_PRIORITIES, null], default: null },
    reasoning: { type: String, maxlength: 500 },
    model: { type: String },
    classifiedAt: { type: Date },
  },
  { _id: false },
);

// Cached AI draft, so reopening a ticket does not pay for another generation.
// basedOnMessageCount marks it stale once the author adds a follow-up.
const aiDraftSchema = new mongoose.Schema(
  {
    content: { type: String },
    model: { type: String },
    generatedAt: { type: Date },
    basedOnMessageCount: { type: Number },
    inputTokens: { type: Number },
    outputTokens: { type: Number },
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

ticketSchema.pre('save', async function assignTicketNumber() {
  if (this.isNew && !this.ticketNumber) {
    const sequence = await Counter.next('ticket');
    this.ticketNumber = `${TICKET_NUMBER_PREFIX}${TICKET_NUMBER_START + sequence}`;
  }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

export default Ticket;
