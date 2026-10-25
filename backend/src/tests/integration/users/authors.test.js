import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import Book from '../../../modules/books/book.model.js';
import Ticket from '../../../modules/tickets/ticket.model.js';
import User from '../../../modules/users/user.model.js';
import { getAuthor, listAuthors } from '../../../modules/users/user.service.js';
import { useTestDatabase } from '../../helpers/database.js';

useTestDatabase();

let rohit;
let admin;

describe('author directory', () => {
  beforeEach(async () => {
    [rohit, , admin] = await User.create([
      { name: 'Rohit Kapoor', email: 'rohit@test.dev', password: 'Password1', role: 'author', authorCode: 'AUTH002', city: 'Delhi' },
      { name: 'Meera Nair', email: 'meera@test.dev', password: 'Password1', role: 'author', authorCode: 'AUTH005' },
      { name: 'Admin', email: 'admin@test.dev', password: 'Password1', role: 'admin' },
    ]);
    await Book.create([
      { bookCode: 'BK003', author: rohit._id, title: 'Code & Karma', status: 'Published & Live', totalCopiesSold: 876, totalRoyaltyEarned: 26280, royaltyPaid: 21000 },
      { bookCode: 'BK004', author: rohit._id, title: 'Startup Sutra', status: 'In Production - Printing', totalRoyaltyEarned: 100, royaltyPaid: 300 },
    ]);
    await Ticket.create([
      { author: rohit._id, subject: 'Royalty question', description: 'A ticket that is still open for testing.' },
      { author: rohit._id, subject: 'Old question', description: 'A ticket that has been resolved already.', status: 'Resolved' },
    ]);
  });

  it('adds profile details and book and ticket totals when asked for stats', async () => {
    const { authors, pagination } = await listAuthors({ page: 1, limit: 20, withStats: true });

    assert.equal(pagination.total, 2, 'admins are not listed as authors');
    const [first, second] = authors;
    assert.equal(first.name, 'Meera Nair');
    assert.deepEqual(first.bookStats, { books: 0, published: 0, copiesSold: 0, royaltyEarned: 0, royaltyPaid: 0, royaltyPending: 0 });
    assert.equal(second.city, 'Delhi');
    assert.deepEqual(second.bookStats, {
      books: 2,
      published: 1,
      copiesSold: 876,
      royaltyEarned: 26380,
      royaltyPaid: 21300,
      // Over-paid books never count as negative pending.
      royaltyPending: 5280,
    });
    assert.deepEqual(second.ticketStats, { total: 2, unresolved: 1 });
  });

  it('keeps the plain list light for dropdowns', async () => {
    const { authors } = await listAuthors({ page: 1, limit: 20, withStats: false, search: 'auth002' });
    assert.deepEqual(Object.keys(authors[0]).sort(), ['authorCode', 'email', 'id', 'name']);
  });

  it('returns one author with stats, and 404 for unknown ids or non-authors', async () => {
    const author = await getAuthor(String(rohit._id));
    assert.equal(author.authorCode, 'AUTH002');
    assert.equal(author.bookStats.books, 2);
    assert.equal('password' in author, false);

    await assert.rejects(getAuthor(String(admin._id)), { statusCode: 404 });
    await assert.rejects(getAuthor(String(new mongoose.Types.ObjectId())), { statusCode: 404 });
  });
});
