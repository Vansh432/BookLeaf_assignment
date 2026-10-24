import { sendSuccess } from '../../shared/responses/apiResponse.js';
import * as bookService from './book.service.js';

export const listBooks = async (req, res) => {
  const data = await bookService.listBooks(req.user, req.validated.query);
  sendSuccess(res, { message: 'Books fetched successfully', data });
};

export const getBook = async (req, res) => {
  const book = await bookService.getBook(req.user, req.validated.params.id);
  sendSuccess(res, { message: 'Book fetched successfully', data: { book } });
};
