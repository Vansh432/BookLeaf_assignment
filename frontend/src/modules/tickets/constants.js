// Mirrors the API's ticket enums.
export const TICKET_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed']

export const TICKET_CATEGORIES = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
]

export const TICKET_PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

export const GENERAL_QUERY_LABEL = 'General / Account level'

// Unresolved tickets waiting longer than this are flagged in the queue.
export const STALE_AFTER_HOURS = 48

export const STATUS_STYLES = {
  Open: { badge: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500', accent: 'bg-sky-500' },
  'In Progress': { badge: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', accent: 'bg-amber-500' },
  Resolved: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', accent: 'bg-emerald-500' },
  Closed: { badge: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400', accent: 'bg-slate-300' },
}

export const UNRESOLVED_STATUSES = ['Open', 'In Progress']

export const PRIORITY_DOTS = {
  Critical: 'bg-red-600',
  High: 'bg-orange-500',
  Medium: 'bg-yellow-400',
  Low: 'bg-slate-400',
}

export const PRIORITY_STYLES = {
  Critical: 'bg-red-600 text-white ring-red-600',
  High: 'bg-orange-50 text-orange-700 ring-orange-200',
  Medium: 'bg-yellow-50 text-yellow-800 ring-yellow-200',
  Low: 'bg-slate-50 text-slate-600 ring-slate-200',
}
