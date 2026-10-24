import { PRIORITY_STYLES, STATUS_STYLES } from '../constants.js'

const BADGE_CLASS = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1'

export function StatusBadge({ status }) {
  const styles = STATUS_STYLES[status]

  return (
    <span className={`${BADGE_CLASS} ${styles.badge}`}>
      <span className={`size-1.5 rounded-full ${styles.dot}`} />
      {status}
    </span>
  )
}

export function PriorityBadge({ priority }) {
  if (!priority) {
    return <span className={`${BADGE_CLASS} bg-violet-50 text-violet-700 ring-violet-200`}>Triage pending</span>
  }

  return <span className={`${BADGE_CLASS} ${PRIORITY_STYLES[priority]}`}>{priority}</span>
}

export function CategoryBadge({ category }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {category ?? 'Uncategorised'}
    </span>
  )
}
