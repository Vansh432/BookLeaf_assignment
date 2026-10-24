import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { BOOK_STATUSES, PRINT_PARTNERS, ROLES, SALES_PLATFORMS } from '../../config/constants.js';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import Book from '../../modules/books/book.model.js';
import Ticket from '../../modules/tickets/ticket.model.js';
import User from '../../modules/users/user.model.js';
import Counter from '../models/counter.model.js';

// Usage: npm run seed        -> upserts authors, books and admins (safe to re-run; keeps tickets)
//        npm run seed:fresh  -> wipes users, books, tickets and counters first

const DATA_FILE = new URL('./data/bookleaf_sample_data.json', import.meta.url);

const ADMINS = [
  { name: 'BookLeaf Admin', email: 'admin@bookleaf.com' },
  { name: 'Support Agent', email: 'support@bookleaf.com' },
];

const bookSchema = z.object({
  book_id: z.string(),
  title: z.string(),
  isbn: z.string().nullable(),
  genre: z.string(),
  publication_date: z.iso.date().nullable(),
  status: z.enum(BOOK_STATUSES),
  mrp: z.number().nonnegative().nullable(),
  author_royalty_per_copy: z.number().nonnegative().nullable(),
  total_copies_sold: z.number().int().nonnegative(),
  total_royalty_earned: z.number().nonnegative(),
  royalty_paid: z.number().nonnegative(),
  royalty_pending: z.number().nonnegative(),
  last_royalty_payout_date: z.iso.date().nullable(),
  print_partner: z.enum(PRINT_PARTNERS).nullable(),
  available_on: z.array(z.enum(SALES_PLATFORMS)),
});

const datasetSchema = z.object({
  authors: z.array(
    z.object({
      author_id: z.string(),
      name: z.string(),
      email: z.email(),
      phone: z.string(),
      city: z.string(),
      joined_date: z.iso.date(),
      books: z.array(bookSchema),
    }),
  ),
});

const toDate = (value) => (value ? new Date(value) : null);

const loadDataset = async () => {
  const dataset = datasetSchema.parse(JSON.parse(await readFile(DATA_FILE, 'utf8')));

  // royaltyPending is derived from earned - paid, so flag any record where the source disagrees.
  for (const book of dataset.authors.flatMap((author) => author.books)) {
    if (book.total_royalty_earned - book.royalty_paid !== book.royalty_pending) {
      logger.warn(`Royalty mismatch for ${book.book_id}: pending will be derived as earned - paid`);
    }
  }

  return dataset;
};

// Saving through documents (not bulk writes) so the password-hashing hook runs.
const upsertUser = async (filter, fields, password) => {
  const user = (await User.findOne(filter)) ?? new User();
  user.set({ ...fields, password, isActive: true });
  await user.save();
  return user;
};

const seedAdmins = () =>
  Promise.all(
    ADMINS.map((admin) =>
      upsertUser({ email: admin.email }, { ...admin, role: ROLES.ADMIN }, env.seedAdminPassword),
    ),
  );

const seedAuthor = async (author) => {
  const user = await upsertUser(
    { authorCode: author.author_id },
    {
      name: author.name,
      email: author.email,
      role: ROLES.AUTHOR,
      authorCode: author.author_id,
      phone: author.phone,
      city: author.city,
      joinedDate: toDate(author.joined_date),
    },
    env.seedAuthorPassword,
  );

  const bookOperations = author.books.map((book) => ({
    updateOne: {
      filter: { bookCode: book.book_id },
      update: {
        $set: {
          author: user._id,
          title: book.title,
          isbn: book.isbn,
          genre: book.genre,
          publicationDate: toDate(book.publication_date),
          status: book.status,
          mrp: book.mrp,
          authorRoyaltyPerCopy: book.author_royalty_per_copy,
          totalCopiesSold: book.total_copies_sold,
          totalRoyaltyEarned: book.total_royalty_earned,
          royaltyPaid: book.royalty_paid,
          lastRoyaltyPayoutDate: toDate(book.last_royalty_payout_date),
          printPartner: book.print_partner,
          availableOn: book.available_on,
        },
      },
      upsert: true,
    },
  }));

  if (bookOperations.length) {
    await Book.bulkWrite(bookOperations);
  }

  return bookOperations.length;
};

const seed = async () => {
  const isFresh = process.argv.includes('--fresh');
  const dataset = await loadDataset();

  await connectDatabase();

  if (isFresh) {
    await Promise.all([User, Book, Ticket, Counter].map((model) => model.deleteMany({})));
    logger.info('Cleared users, books, tickets and counters');
  }

  // Unique indexes must exist before upserting, otherwise duplicates could slip in on a new database.
  await Promise.all([User, Book, Ticket].map((model) => model.createIndexes()));

  const admins = await seedAdmins();
  let bookCount = 0;
  for (const author of dataset.authors) {
    bookCount += await seedAuthor(author);
  }

  logger.info(`Seeded ${admins.length} admins, ${dataset.authors.length} authors, ${bookCount} books`);
};

try {
  await seed();
} catch (error) {
  logger.error('Seeding failed', { error: error.message });
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
