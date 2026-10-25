import { sendSuccess } from '../../shared/responses/apiResponse.js';
import * as draftService from './draft.service.js';

export const getDraft = async (req, res) => {
  const draft = await draftService.getDraft(req.validated.params.id);
  sendSuccess(res, { message: draft ? 'Draft fetched successfully' : 'No draft yet', data: { draft } });
};

// Always 200: an unavailable or policy-less draft is a normal state the UI shows, not a request error.
export const requestDraft = async (req, res) => {
  const draft = await draftService.requestDraft(req.validated.params.id, {
    regenerate: req.validated.body.regenerate,
    correlationId: req.id,
  });
  sendSuccess(res, { message: 'Draft ready', data: { draft } });
};
