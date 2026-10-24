import Icon from '../../../shared/components/ui/Icon.jsx'
import { formatCurrency, formatDate, formatNumber } from '../../../shared/utils/format.js'
import { PUBLISHED_STATUS } from '../constants.js'
import BookCover from './BookCover.jsx'
import BookStatusBadge from './BookStatusBadge.jsx'
import ProductionProgress from './ProductionProgress.jsx'

function MetaItem({ icon, label, children }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon name={icon} className="size-4 shrink-0 text-slate-400" />
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{children}</span>
    </div>
  )
}

function Metric({ label, value, valueClass = 'text-slate-900' }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${valueClass}`}>{value}</p>
    </div>
  )
}

function RoyaltyDetails({ book }) {
  const paidPercent = book.totalRoyaltyEarned > 0 ? Math.round((book.royaltyPaid / book.totalRoyaltyEarned) * 100) : 0
  const hasPayout = Boolean(book.lastRoyaltyPayoutDate)

  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Copies sold" value={formatNumber(book.totalCopiesSold)} />
        <Metric label="Royalty earned" value={formatCurrency(book.totalRoyaltyEarned)} />
        <Metric label="Royalty paid" value={formatCurrency(book.royaltyPaid)} valueClass="text-emerald-700" />
        <Metric
          label="Royalty pending"
          value={formatCurrency(book.royaltyPending)}
          valueClass={book.royaltyPending > 0 ? 'text-brand-700' : 'text-slate-400'}
        />
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-linear-to-r from-emerald-500 to-brand-500 transition-all"
            style={{ width: `${paidPercent}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>{paidPercent}% of earned royalty paid</span>
          <span className="font-medium">
            {hasPayout ? `Last payout ${formatDate(book.lastRoyaltyPayoutDate)}` : 'No payouts yet'}
          </span>
        </div>
      </div>
    </div>
  )
}

function BookCard({ book }) {
  const isPublished = book.status === PUBLISHED_STATUS

  return (
    <article className="animate-fade-in rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card transition hover:shadow-card-hover sm:p-6">
      <div className="flex gap-5">
        <div className="hidden sm:block">
          <BookCover title={book.title} />
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{book.title}</h2>
              <p className="text-sm text-slate-500">{book.genre}</p>
            </div>
            <BookStatusBadge status={book.status} />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <MetaItem icon="hash" label="ISBN">{book.isbn ?? 'Not assigned yet'}</MetaItem>
            <MetaItem icon="calendar" label="Published">{formatDate(book.publicationDate)}</MetaItem>
            <MetaItem icon="tag" label="MRP">{formatCurrency(book.mrp)}</MetaItem>
          </div>

          {book.availableOn.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Icon name="globe" className="size-4 text-slate-400" />
              {book.availableOn.map((platform) => (
                <span key={platform} className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {platform}
                </span>
              ))}
            </div>
          )}

          {isPublished ? <RoyaltyDetails book={book} /> : <ProductionProgress status={book.status} />}
        </div>
      </div>
    </article>
  )
}

export default BookCard
