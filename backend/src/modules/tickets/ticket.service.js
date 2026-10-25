import mongoose from 'mongoose';
import { ROLES, TICKET_PRIORITIES, TICKET_STATUSES } from '../../config/constants.js';
import AppError from '../../shared/errors/AppError.js';
import { buildPagination, paginationStages } from '../../shared/pagination/pagination.js';
import { withIds } from '../../shared/utils/serialize.js';
import Book from '../books/book.model.js';
import { getBook } from '../books/book.service.js';
import { scheduleSummaryRefresh } from '../context/context.service.js';
import { enqueueTriage } from '../triage/triage.jobs.js';
import { publishTicketChange, TICKET_ACTIONS } from './ticket.events.js';
import Ticket from './ticket.model.js';

const { ObjectId } = mongoose.Types;
const { OPEN, IN_PROGRESS, RESOLVED, CLOSED } = TICKET_STATUSES;

// Closed is final except for an explicit reopen by the team.
const ALLOWED_TRANSITIONS = {
  [OPEN]: [IN_PROGRESS, RESOLVED, CLOSED],
  [IN_PROGRESS]: [OPEN, RESOLVED, CLOSED],
  [RESOLVED]: [OPEN, IN_PROGRESS, CLOSED],
  [CLOSED]: [OPEN],
};

const UNRESOLVED_STATUSES = [OPEN, IN_PROGRESS];

// Unclassified tickets sort with High until triage assigns a priority, so they are never buried.
const UNCLASSIFIED_PRIORITY = 'High';

// Authors never see internal notes, AI output, priority or assignment.
const AUTHOR_DETAIL_FIELDS =
  'ticketNumber subject description status category book attachments messages lastActivityAt resolvedAt createdAt updatedAt';
const ADMIN_DETAIL_FIELDS = '-aiDraft -__v';

const AUTHOR_POPULATE = [
  { path: 'book', select: 'title bookCode status' },
  { path: 'messages.sender', select: 'name role' },
];

const ADMIN_POPULATE = [
  { path: 'author', select: 'name email authorCode phone city joinedDate' },
  { path: 'assignedTo', select: 'name email' },
  { path: 'messages.sender', select: 'name role' },
  { path: 'internalNotes.author', select: 'name' },
];

const isAdmin = (user) => user.role === ROLES.ADMIN;

// Authors get a 404 (not 403) for other authors' tickets, so ids cannot be probed.
const ownershipFilter = (user, ticketId) => ({
  _id: ticketId,
  ...(!isAdmin(user) && { author: user.id }),
});

const findTicketOrThrow = async (user, ticketId, fields) => {
  const ticket = await Ticket.findOne(ownershipFilter(user, ticketId)).select(fields).lean();

  if (!ticket) {
    throw AppError.notFound('Ticket not found');
  }

  return ticket;
};

const assertTransition = (from, to) => {
  if (from !== to && !ALLOWED_TRANSITIONS[from].includes(to)) {
    throw AppError.badRequest(`A ${from} ticket cannot be moved to ${to}`);
  }
};

const statusChange = (ticket, nextStatus, now) => {
  if (nextStatus === ticket.status) {
    return {};
  }

  const isNowResolved = [RESOLVED, CLOSED].includes(nextStatus);
  return {
    status: nextStatus,
    // Resolved -> Closed keeps the original resolution time; reopening clears it.
    resolvedAt: isNowResolved ? (ticket.resolvedAt ?? now) : null,
  };
};

// Conditioned on the status read earlier, so two admins acting at once cannot overwrite each other.
const applyUpdate = async (ticket, update) => {
  const { matchedCount } = await Ticket.updateOne({ _id: ticket._id, status: ticket.status }, update);

  if (matchedCount === 0) {
    throw AppError.conflict('This ticket was just updated by someone else. Refresh and try again.');
  }
};

export const getTicket = async (user, ticketId) => {
  const admin = isAdmin(user);
  const ticket = await Ticket.findOne(ownershipFilter(user, ticketId))
    .select(admin ? ADMIN_DETAIL_FIELDS : AUTHOR_DETAIL_FIELDS)
    .populate(admin ? ADMIN_POPULATE : AUTHOR_POPULATE)
    .lean();

  if (!ticket) {
    throw AppError.notFound('Ticket not found');
  }

  // Admins answer from the book's live figures (royalties, status), so they get the full record.
  if (admin && ticket.book) {
    ticket.book = await getBook(user, ticket.book);
  }

  return withIds(ticket);
};

export const createTicket = async (user, { bookId, subject, description }, { correlationId } = {}) => {
  if (bookId && !(await Book.exists({ _id: bookId, author: user.id }))) {
    throw AppError.badRequest('Validation failed', [
      { location: 'body', field: 'bookId', message: 'Select one of your own books' },
    ]);
  }

  const ticket = await Ticket.create({ author: user.id, book: bookId, subject, description });
  publishTicketChange({ ticket, action: TICKET_ACTIONS.CREATED, actor: user });
  // Runs in the background: the ticket is already saved, so triage (or AI) failures cannot affect it.
  enqueueTriage(ticket._id, { correlationId });
  return getTicket(user, ticket._id);
};

const buildBaseMatch = (user, { category, priority, assigned, authorId, from, to }) => {
  if (!isAdmin(user) && (priority || assigned || authorId)) {
    throw AppError.forbidden('Priority, assignment and author filters are available to the BookLeaf team only');
  }

  const authorFilter = isAdmin(user) ? authorId : user.id;

  return {
    ...(authorFilter && { author: new ObjectId(authorFilter) }),
    ...(category && { category }),
    ...(priority && { priority }),
    ...(assigned === 'me' && { assignedTo: new ObjectId(user.id) }),
    ...(assigned === 'unassigned' && { assignedTo: null }),
    ...((from || to) && { createdAt: { ...(from && { $gte: from }), ...(to && { $lt: to }) } }),
  };
};

const lookupOne = (from, field, project) => [
  { $lookup: { from, localField: field, foreignField: '_id', pipeline: [{ $project: project }], as: field } },
  { $unwind: { path: `$${field}`, preserveNullAndEmptyArrays: true } },
];

const SUMMARY_PROJECTION = {
  ticketNumber: 1,
  subject: 1,
  status: 1,
  category: 1,
  book: 1,
  messagesCount: { $size: '$messages' },
  latestMessageRole: { $arrayElemAt: ['$messages.senderRole', -1] },
  latestMessageAt: { $arrayElemAt: ['$messages.createdAt', -1] },
  lastActivityAt: 1,
  resolvedAt: 1,
  createdAt: 1,
};

// Admin queue: unresolved first, then most urgent, then oldest, so nothing waits unnoticed.
const ADMIN_LIST_STAGES = [
  {
    $addFields: {
      resolvedRank: { $cond: [{ $in: ['$status', UNRESOLVED_STATUSES] }, 0, 1] },
      priorityRank: { $indexOfArray: [TICKET_PRIORITIES, { $ifNull: ['$priority', UNCLASSIFIED_PRIORITY] }] },
    },
  },
  { $sort: { resolvedRank: 1, priorityRank: 1, createdAt: 1 } },
];

const adminProjectionStages = [
  ...lookupOne('users', 'author', { name: 1, authorCode: 1 }),
  ...lookupOne('users', 'assignedTo', { name: 1 }),
  {
    $project: {
      ...SUMMARY_PROJECTION,
      author: 1,
      assignedTo: 1,
      priority: 1,
      classificationStatus: '$classification.status',
      needsReview: '$classification.needsReview',
      firstRespondedAt: 1,
    },
  },
];

const toStatusCounts = (groups) => ({
  ...Object.fromEntries(Object.values(TICKET_STATUSES).map((status) => [status, 0])),
  ...Object.fromEntries(groups.map(({ _id, count }) => [_id, count])),
});

export const listTickets = async (user, { page, limit, status, ...filters }) => {
  const admin = isAdmin(user);
  const statusStages = status ? [{ $match: { status } }] : [];

  // Status counts ignore the status filter so the UI can show a count on every status tab.
  const [result] = await Ticket.aggregate([
    { $match: buildBaseMatch(user, filters) },
    {
      $facet: {
        tickets: [
          ...statusStages,
          ...(admin ? ADMIN_LIST_STAGES : [{ $sort: { lastActivityAt: -1 } }]),
          ...paginationStages({ page, limit }),
          ...lookupOne('books', 'book', { title: 1, bookCode: 1 }),
          ...(admin ? adminProjectionStages : [{ $project: SUMMARY_PROJECTION }]),
        ],
        total: [...statusStages, { $count: 'count' }],
        statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
      },
    },
  ]);

  return {
    tickets: withIds(result.tickets),
    statusCounts: toStatusCounts(result.statusCounts),
    pagination: buildPagination({ page, limit, total: result.total[0]?.count ?? 0 }),
  };
};

// Records that the admin sent the current AI draft, and whether they changed it first.
// A draftId that no longer matches (a newer draft was generated) is ignored rather than misattributed.
const draftUsage = (ticket, draftId, body, user, now) =>
  draftId && ticket.aiDraft?.id === draftId
    ? { 'aiDraft.sent': { at: now, by: user.id, edited: body.trim() !== (ticket.aiDraft.content ?? '').trim() } }
    : {};

export const addMessage = async (user, ticketId, { body, status, draftId }, { correlationId } = {}) => {
  const admin = isAdmin(user);

  if (!admin && (status || draftId)) {
    throw AppError.forbidden('Only the BookLeaf team can change a ticket status or send AI drafts');
  }

  const ticket = await findTicketOrThrow(
    user,
    ticketId,
    'ticketNumber author status resolvedAt firstRespondedAt aiDraft.id aiDraft.content',
  );
  let nextStatus = ticket.status;

  if (admin) {
    assertTransition(ticket.status, status ?? ticket.status);
    // Replying to a new ticket means the team has picked it up.
    nextStatus = status ?? (ticket.status === OPEN ? IN_PROGRESS : ticket.status);
  } else if (ticket.status === CLOSED) {
    throw AppError.conflict('This ticket is closed. Please raise a new query if you need more help.');
  } else if (ticket.status === RESOLVED) {
    // A follow-up on a resolved ticket means the issue is not actually solved.
    nextStatus = OPEN;
  }

  const now = new Date();
  await applyUpdate(ticket, {
    $push: { messages: { sender: user.id, senderRole: user.role, body } },
    $set: {
      lastActivityAt: now,
      ...statusChange(ticket, nextStatus, now),
      ...(admin && !ticket.firstRespondedAt && { firstRespondedAt: now }),
      ...draftUsage(ticket, draftId, body, user, now),
    },
  });

  publishTicketChange({ ticket, action: TICKET_ACTIONS.MESSAGE, actor: user });
  // Background and best-effort: the message is saved whether or not the summary can be refreshed.
  scheduleSummaryRefresh(ticketId, { correlationId });
  return getTicket(user, ticketId);
};

const SUGGESTION_FIELDS = { category: 'suggestedCategory', priority: 'suggestedPriority' };

// Records each changed category/priority with what triage had suggested, for auditing and accuracy metrics.
const overrideEntries = (ticket, changes, user, now) =>
  Object.entries(changes)
    .filter(([field, value]) => value && value !== ticket[field])
    .map(([field, value]) => ({
      field,
      from: ticket[field],
      to: value,
      suggested: ticket.classification?.[SUGGESTION_FIELDS[field]] ?? null,
      by: user.id,
      at: now,
    }));

export const updateTicket = async (user, ticketId, { status, category, priority, reviewed }) => {
  const ticket = await findTicketOrThrow(
    user,
    ticketId,
    'ticketNumber author status resolvedAt category priority classification.suggestedCategory classification.suggestedPriority',
  );
  const now = new Date();
  const statusUpdate = status ? statusChange(ticket, status, now) : {};
  const overrides = overrideEntries(ticket, { category, priority }, user, now);

  if (status) {
    assertTransition(ticket.status, status);
  }

  await applyUpdate(ticket, {
    $set: {
      // Overrides only change the effective values; the original suggestion stays in `classification`.
      ...(category && { category }),
      ...(priority && { priority }),
      // An admin who sets the category or priority, or confirms them, has reviewed the triage.
      ...((overrides.length || reviewed) && { 'classification.needsReview': false }),
      ...statusUpdate,
      // Status changes are visible to the author, so they count as activity on the ticket.
      ...(statusUpdate.status && { lastActivityAt: now }),
    },
    ...(overrides.length && { $push: { 'classification.overrides': { $each: overrides } } }),
  });

  // Authors see status and category only, so priority or review changes are announced to admins alone.
  publishTicketChange({ ticket, action: TICKET_ACTIONS.UPDATED, actor: user, adminOnly: !status && !category });
  return getTicket(user, ticketId);
};

// Assignment and notes are internal, so only admins are notified.
const applyAdminOnlyChange = async (user, ticketId, update, action) => {
  const ticket = await Ticket.findOneAndUpdate({ _id: ticketId }, update, {
    projection: 'ticketNumber author',
    lean: true,
  });

  if (!ticket) {
    throw AppError.notFound('Ticket not found');
  }

  publishTicketChange({ ticket, action, actor: user, adminOnly: true });
  return getTicket(user, ticketId);
};

export const assignToSelf = (user, ticketId) =>
  applyAdminOnlyChange(user, ticketId, { assignedTo: user.id }, TICKET_ACTIONS.ASSIGNED);

export const addInternalNote = (user, ticketId, { body }) =>
  applyAdminOnlyChange(user, ticketId, { $push: { internalNotes: { author: user.id, body } } }, TICKET_ACTIONS.NOTE);
