import mongoose from 'mongoose';
import { BOOK_STATUSES, ROLES, TICKET_STATUSES } from '../../config/constants.js';
import AppError from '../../shared/errors/AppError.js';
import { buildPagination, paginationStages } from '../../shared/pagination/pagination.js';
import { withIds } from '../../shared/utils/serialize.js';
import { royaltyPendingExpression } from '../books/book.service.js';
import User from './user.model.js';

// The last production stage.
const PUBLISHED_STATUS = BOOK_STATUSES.at(-1);
const UNRESOLVED_STATUSES = [TICKET_STATUSES.OPEN, TICKET_STATUSES.IN_PROGRESS];

const DIRECTORY_FIELDS = { name: 1, email: 1, authorCode: 1 };
const PROFILE_FIELDS = { ...DIRECTORY_FIELDS, phone: 1, city: 1, joinedDate: 1, isActive: 1, lastLoginAt: 1 };

const EMPTY_BOOK_STATS = { books: 0, published: 0, copiesSold: 0, royaltyEarned: 0, royaltyPaid: 0, royaltyPending: 0 };
const EMPTY_TICKET_STATS = { total: 0, unresolved: 0 };

// User input is matched literally, never as a regular expression.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSearchMatch = (search) => {
  if (!search) {
    return {};
  }

  const pattern = new RegExp(escapeRegex(search), 'i');
  return { $or: [{ name: pattern }, { email: pattern }, { authorCode: pattern }] };
};

// Per-author totals from their books and tickets. Runs after pagination, so it only touches one page
// of authors; both lookups use the { author } indexes on books and tickets.
const statsStages = (fields) => [
  {
    $lookup: {
      from: 'books',
      localField: '_id',
      foreignField: 'author',
      pipeline: [
        {
          $group: {
            _id: null,
            books: { $sum: 1 },
            published: { $sum: { $cond: [{ $eq: ['$status', PUBLISHED_STATUS] }, 1, 0] } },
            copiesSold: { $sum: '$totalCopiesSold' },
            royaltyEarned: { $sum: '$totalRoyaltyEarned' },
            royaltyPaid: { $sum: '$royaltyPaid' },
            royaltyPending: { $sum: royaltyPendingExpression },
          },
        },
        { $project: { _id: 0 } },
      ],
      as: 'bookStats',
    },
  },
  {
    $lookup: {
      from: 'tickets',
      localField: '_id',
      foreignField: 'author',
      pipeline: [
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unresolved: { $sum: { $cond: [{ $in: ['$status', UNRESOLVED_STATUSES] }, 1, 0] } },
          },
        },
        { $project: { _id: 0 } },
      ],
      as: 'ticketStats',
    },
  },
  {
    $project: {
      ...fields,
      bookStats: { $ifNull: [{ $first: '$bookStats' }, EMPTY_BOOK_STATS] },
      ticketStats: { $ifNull: [{ $first: '$ticketStats' }, EMPTY_TICKET_STATS] },
    },
  },
];

// withStats adds the profile and book/ticket totals for the admin author directory; without it the list
// stays a light name/email/code lookup for filter dropdowns.
export const listAuthors = async ({ page, limit, search, withStats }) => {
  const [result] = await User.aggregate([
    { $match: { role: ROLES.AUTHOR, ...buildSearchMatch(search) } },
    {
      $facet: {
        authors: [
          { $sort: { name: 1 } },
          ...paginationStages({ page, limit }),
          ...(withStats ? statsStages(PROFILE_FIELDS) : [{ $project: DIRECTORY_FIELDS }]),
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  return {
    authors: withIds(result.authors),
    pagination: buildPagination({ page, limit, total: result.total[0]?.count ?? 0 }),
  };
};

export const getAuthor = async (authorId) => {
  const [author] = await User.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(authorId), role: ROLES.AUTHOR } },
    ...statsStages(PROFILE_FIELDS),
  ]);

  if (!author) {
    throw AppError.notFound('Author not found');
  }

  return withIds(author);
};
