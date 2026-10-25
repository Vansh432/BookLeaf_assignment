import { sendSuccess } from '../../shared/responses/apiResponse.js';
import { getUsageSummary } from './ai.usage.js';

export const getUsage = async (req, res) => {
  const usage = await getUsageSummary(req.validated.query);
  sendSuccess(res, { message: 'AI usage fetched successfully', data: { usage } });
};
