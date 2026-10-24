import { ROLES } from '../../config/constants.js';
import { buildPagination, paginationStages } from '../../shared/pagination/pagination.js';
import { withIds } from '../../shared/utils/serialize.js';
import User from './user.model.js';

// User input is matched literally, never as a regular expression.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSearchMatch = (search) => {
  if (!search) {
    return {};
  }

  const pattern = new RegExp(escapeRegex(search), 'i');
  return { $or: [{ name: pattern }, { email: pattern }, { authorCode: pattern }] };
};

export const listAuthors = async ({ page, limit, search }) => {
  const [result] = await User.aggregate([
    { $match: { role: ROLES.AUTHOR, ...buildSearchMatch(search) } },
    {
      $facet: {
        authors: [
          { $sort: { name: 1 } },
          ...paginationStages({ page, limit }),
          { $project: { name: 1, email: 1, authorCode: 1 } },
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
