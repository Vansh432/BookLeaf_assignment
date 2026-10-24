import { getStageLabel, PUBLISHED_STATUS } from '../constants.js'

function BookStatusBadge({ status }) {
  const isPublished = status === PUBLISHED_STATUS

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
        isPublished ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'
      }`}
    >
      <span className={`size-1.5 rounded-full ${isPublished ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'}`} />
      {isPublished ? 'Published & Live' : `In production · ${getStageLabel(status)}`}
    </span>
  )
}

export default BookStatusBadge
