import { createHash } from 'node:crypto';
import Book from '../books/book.model.js';
import User from '../users/user.model.js';

// Royalty policy: calculated quarterly, paid within 45 days of quarter end, ₹1,000 minimum payout.
// Quarters are taken to be calendar quarters (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec).
const PAYOUT_DAYS_AFTER_QUARTER = 45;
const MIN_PAYOUT = 1000;
const MAX_ACCOUNT_BOOKS = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const BOOK_FIELDS =
  'bookCode title isbn status publicationDate mrp authorRoyaltyPerCopy totalCopiesSold totalRoyaltyEarned royaltyPaid lastRoyaltyPayoutDate printPartner availableOn';

export const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const formatInr = (amount) => `₹${amount.toLocaleString('en-IN')}`;

const quarterEnd = (year, quarter) => new Date(Date.UTC(year, quarter * 3 + 3, 0));

// The next payout the policy promises: the previous quarter's, while its 45-day window is open,
// otherwise the current quarter's.
export const nextPayout = (now) => {
  const year = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3);
  const previousEnd = quarter === 0 ? quarterEnd(year - 1, 3) : quarterEnd(year, quarter - 1);
  const due = (end) => new Date(end.getTime() + PAYOUT_DAYS_AFTER_QUARTER * MS_PER_DAY);

  const end = now <= due(previousEnd) ? previousEnd : quarterEnd(year, quarter);
  return { quarterEnd: end, dueBy: due(end) };
};

// One quarter plus the 45-day payout window: no payout for longer than this, with at least the minimum
// pending, means a payout cycle was missed. Stated explicitly so the reply treats it as overdue (and
// escalates, per policy) instead of quoting the next routine payout date.
const PAYOUT_CYCLE_DAYS = 90 + PAYOUT_DAYS_AFTER_QUARTER;

const overdueRoyalty = (book, pending, now) => {
  const since = book.lastRoyaltyPayoutDate ?? book.publicationDate;
  if (pending < MIN_PAYOUT || !since) {
    return null;
  }
  const days = Math.floor((now - new Date(since)) / MS_PER_DAY);
  return days > PAYOUT_CYCLE_DAYS
    ? `royalty payout is overdue: ${formatInr(pending)} is pending and there has been no payout for ${days} days, longer than one quarterly payout cycle`
    : null;
};

const describeBook = (book, now) => {
  const pending = Math.max(book.totalRoyaltyEarned - book.royaltyPaid, 0);
  const parts = [
    `status ${book.status}`,
    `ISBN ${book.isbn ?? 'not assigned yet'}`,
    book.publicationDate ? `published ${formatDate(book.publicationDate)}` : 'not published yet',
    book.mrp != null ? `MRP ${formatInr(book.mrp)}` : 'MRP not set yet',
    book.authorRoyaltyPerCopy != null && `author royalty ${formatInr(book.authorRoyaltyPerCopy)} per copy`,
    `${book.totalCopiesSold} copies sold`,
    `royalty earned ${formatInr(book.totalRoyaltyEarned)}, paid ${formatInr(book.royaltyPaid)}, pending ${formatInr(pending)}`,
    pending > 0 && pending < MIN_PAYOUT && `pending amount is below the ${formatInr(MIN_PAYOUT)} payout threshold, so it rolls over to the next quarter`,
    book.lastRoyaltyPayoutDate ? `last royalty payout ${formatDate(book.lastRoyaltyPayoutDate)}` : 'no royalty payout yet',
    overdueRoyalty(book, pending, now),
    book.availableOn.length ? `available on ${book.availableOn.join(', ')}` : 'not listed on any platform yet',
    book.printPartner && `printed by ${book.printPartner}`,
  ];
  return `Book "${book.title}" (${book.bookCode}): ${parts.filter(Boolean).join('; ')}.`;
};

/**
 * Verified facts for the draft, read from the database records the ticket is linked to (the author's
 * own book, or all their books for account-level queries). Returns the prompt text and its hash, which
 * marks a cached draft stale when any of these facts change.
 */
export const loadAccountFacts = async (ticket, now = new Date()) => {
  const [author, books] = await Promise.all([
    User.findById(ticket.author).select('name authorCode joinedDate').lean(),
    ticket.book
      ? Book.find({ _id: ticket.book, author: ticket.author }).select(BOOK_FIELDS).lean()
      : Book.find({ author: ticket.author }).sort({ publicationDate: -1 }).limit(MAX_ACCOUNT_BOOKS).select(BOOK_FIELDS).lean(),
  ]);
  const payout = nextPayout(now);

  const lines = [
    `Author: ${author.name}${author.authorCode ? `, author code ${author.authorCode}` : ''}${
      author.joinedDate ? `, with BookLeaf since ${formatDate(author.joinedDate)}` : ''
    }.`,
    ticket.book ? 'The query is about this book:' : "The query is about the author's account in general. Their books:",
    ...(books.length ? books.map((book) => describeBook(book, now)) : ['No books on record.']),
    `Royalty payout schedule: royalties for the quarter ending ${formatDate(payout.quarterEnd)} are paid by ${formatDate(payout.dueBy)}.`,
  ];
  const text = lines.join('\n');

  return { text, hash: createHash('sha256').update(text).digest('hex'), firstName: author.name.split(' ')[0] };
};
