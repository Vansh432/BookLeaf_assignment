import mongoose from 'mongoose';
import { ROLES } from '../../config/constants.js';
import AppError from '../../shared/errors/AppError.js';
import { buildPagination, paginationStages } from '../../shared/pagination/pagination.js';
import Book from './book.model.js';

const { ObjectId } = mongoose.Types;

// Pending royalty is derived here rather than stored, so it can never drift from earned and paid.
const royaltyPendingExpression = { $max: [{ $subtract: ['$totalRoyaltyEarned', '$royaltyPaid'] }, 0] };

const BOOK_PROJECTION = {
  _id: 0,
  id: '$_id',
  bookCode: 1,
  title: 1,
  isbn: 1,
  genre: 1,
  publicationDate: 1,
  status: 1,
  mrp: 1,
  authorRoyaltyPerCopy: 1,
  totalCopiesSold: 1,
  totalRoyaltyEarned: 1,
  royaltyPaid: 1,
  royaltyPending: royaltyPendingExpression,
  lastRoyaltyPayoutDate: 1,
  printPartner: 1,
  availableOn: 1,
};

// Admins see books across authors, so they also need to know whose book it is.
const authorLookupStages = [
  {
    $lookup: {
      from: 'users',
      localField: 'author',
      foreignField: '_id',
      pipeline: [{ $project: { _id: 0, id: '$_id', name: 1, email: 1, authorCode: 1 } }],
      as: 'author',
    },
  },
  { $unwind: '$author' },
];

const projectionStagesFor = (user) =>
  user.role === ROLES.ADMIN
    ? [...authorLookupStages, { $project: { ...BOOK_PROJECTION, author: 1 } }]
    : [{ $project: BOOK_PROJECTION }];

const EMPTY_SUMMARY = {
  totalBooks: 0,
  totalCopiesSold: 0,
  totalRoyaltyEarned: 0,
  totalRoyaltyPaid: 0,
  totalRoyaltyPending: 0,
};

const buildListMatch = (user, { status, authorId }) => {
  if (user.role === ROLES.AUTHOR && authorId) {
    throw AppError.forbidden('Authors can only view their own books');
  }

  const authorFilter = user.role === ROLES.AUTHOR ? user.id : authorId;

  return {
    ...(status && { status }),
    ...(authorFilter && { author: new ObjectId(authorFilter) }),
  };
};

// One round trip returns the page of books plus the royalty totals across every matching book.
export const listBooks = async (user, { page, limit, ...filters }) => {
  const [result] = await Book.aggregate([
    { $match: buildListMatch(user, filters) },
    {
      $facet: {
        books: [
          { $sort: { publicationDate: -1, title: 1 } },
          ...paginationStages({ page, limit }),
          ...projectionStagesFor(user),
        ],
        summary: [
          {
            $group: {
              _id: null,
              totalBooks: { $sum: 1 },
              totalCopiesSold: { $sum: '$totalCopiesSold' },
              totalRoyaltyEarned: { $sum: '$totalRoyaltyEarned' },
              totalRoyaltyPaid: { $sum: '$royaltyPaid' },
              totalRoyaltyPending: { $sum: royaltyPendingExpression },
            },
          },
          { $project: { _id: 0 } },
        ],
      },
    },
  ]);

  const summary = result.summary[0] ?? EMPTY_SUMMARY;

  return {
    books: result.books,
    summary,
    pagination: buildPagination({ page, limit, total: summary.totalBooks }),
  };
};

export const getBook = async (user, bookId) => {
  // Authors get a 404 (not 403) for other authors' books, so ids cannot be probed.
  const match = {
    _id: new ObjectId(bookId),
    ...(user.role === ROLES.AUTHOR && { author: new ObjectId(user.id) }),
  };

  const [book] = await Book.aggregate([{ $match: match }, ...projectionStagesFor(user)]);

  if (!book) {
    throw AppError.notFound('Book not found');
  }

  return book;
};
