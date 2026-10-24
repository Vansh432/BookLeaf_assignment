import mongoose from 'mongoose';
import { BOOK_STATUSES, PRINT_PARTNERS, SALES_PLATFORMS } from '../../config/constants.js';

// Books still in production have no MRP, royalty rate, publication date or print partner yet,
// so those fields are optional and default to null.
const bookSchema = new mongoose.Schema(
  {
    bookCode: { type: String, required: true, unique: true, trim: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    isbn: { type: String, trim: true, default: null },
    genre: { type: String, trim: true },
    publicationDate: { type: Date, default: null },
    status: { type: String, enum: BOOK_STATUSES, required: true },
    mrp: { type: Number, min: 0, default: null },
    authorRoyaltyPerCopy: { type: Number, min: 0, default: null },
    totalCopiesSold: { type: Number, min: 0, default: 0 },
    totalRoyaltyEarned: { type: Number, min: 0, default: 0 },
    royaltyPaid: { type: Number, min: 0, default: 0 },
    lastRoyaltyPayoutDate: { type: Date, default: null },
    printPartner: { type: String, enum: [...PRINT_PARTNERS, null], default: null },
    availableOn: { type: [{ type: String, enum: SALES_PLATFORMS }], default: [] },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false },
  },
);

bookSchema.index({ author: 1, publicationDate: -1 });
bookSchema.index({ isbn: 1 }, { unique: true, partialFilterExpression: { isbn: { $type: 'string' } } });

// royaltyPending is intentionally not stored: book.service derives it as earned - paid.

const Book = mongoose.model('Book', bookSchema);

export default Book;
