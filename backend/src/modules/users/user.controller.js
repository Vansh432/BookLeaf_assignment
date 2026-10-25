import { sendSuccess } from '../../shared/responses/apiResponse.js';
import * as userService from './user.service.js';

export const listAuthors = async (req, res) => {
  const data = await userService.listAuthors(req.validated.query);
  sendSuccess(res, { message: 'Authors fetched successfully', data });
};

export const getAuthor = async (req, res) => {
  const author = await userService.getAuthor(req.validated.params.id);
  sendSuccess(res, { message: 'Author fetched successfully', data: { author } });
};
