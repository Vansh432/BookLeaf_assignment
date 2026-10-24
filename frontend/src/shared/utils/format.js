const EMPTY_VALUE = '—'

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('en-IN')

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const RELATIVE_UNITS = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

const isMissing = (value) => value === null || value === undefined

export const formatCurrency = (value) => (isMissing(value) ? EMPTY_VALUE : currencyFormatter.format(value))

export const formatNumber = (value) => (isMissing(value) ? EMPTY_VALUE : numberFormatter.format(value))

export const formatDate = (value) => (isMissing(value) ? EMPTY_VALUE : dateFormatter.format(new Date(value)))

export const formatDateTime = (value) => (isMissing(value) ? EMPTY_VALUE : dateTimeFormatter.format(new Date(value)))

export const hoursSince = (value) => (Date.now() - new Date(value).getTime()) / (60 * 60 * 1000)

// Compact elapsed time between two moments: "12 min", "5 h", "3 d".
export const formatDuration = (from, to = Date.now()) => {
  const minutes = Math.max(Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000), 0)

  if (minutes < 60) {
    return `${minutes} min`
  }

  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`
}

// "Today", "Yesterday" or a date, for separating a conversation by day.
export const formatDayLabel = (value) => {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)

  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  }

  return date.toDateString() === yesterday.toDateString() ? 'Yesterday' : formatDate(value)
}

// "3 hours ago", "yesterday", "just now".
export const formatRelativeTime = (value) => {
  if (isMissing(value)) {
    return EMPTY_VALUE
  }

  const secondsAgo = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  const unit = RELATIVE_UNITS.find(([, seconds]) => secondsAgo >= seconds)

  return unit ? relativeTimeFormatter.format(-Math.floor(secondsAgo / unit[1]), unit[0]) : 'just now'
}

export const getInitials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
