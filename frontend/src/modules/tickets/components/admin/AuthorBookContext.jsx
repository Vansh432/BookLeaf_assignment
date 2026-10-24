import { formatCurrency, formatDate, getInitials } from '../../../../shared/utils/format.js'
import { BookStatusBadge } from '../../../books/index.js'
import { GENERAL_QUERY_LABEL } from '../../constants.js'

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  )
}

// The facts an admin needs to answer accurately, without leaving the ticket.
function AuthorBookContext({ author, book }) {
  return (
    <section className="space-y-5 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-linear-to-br from-brand-300 to-brand-500 text-sm font-bold text-brand-950">
          {getInitials(author.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{author.name}</p>
          <p className="truncate text-xs text-slate-500">
            {author.authorCode} · {author.email}
          </p>
        </div>
      </div>
      <dl className="divide-y divide-slate-100">
        <Row label="Phone">{author.phone ?? '—'}</Row>
        <Row label="City">{author.city ?? '—'}</Row>
        <Row label="Author since">{formatDate(author.joinedDate)}</Row>
      </dl>

      <div className="border-t border-slate-100 pt-4">
        {book ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Book</p>
                <p className="font-bold text-slate-900">{book.title}</p>
              </div>
            </div>
            <div className="mt-2">
              <BookStatusBadge status={book.status} />
            </div>
            <dl className="mt-3 divide-y divide-slate-100">
              <Row label="ISBN">{book.isbn ?? 'Not assigned'}</Row>
              <Row label="Published">{formatDate(book.publicationDate)}</Row>
              <Row label="Copies sold">{book.totalCopiesSold}</Row>
              <Row label="Royalty earned">{formatCurrency(book.totalRoyaltyEarned)}</Row>
              <Row label="Royalty paid">{formatCurrency(book.royaltyPaid)}</Row>
              <Row label="Royalty pending">
                <span className={book.royaltyPending > 0 ? 'text-brand-700' : ''}>{formatCurrency(book.royaltyPending)}</span>
              </Row>
              <Row label="Last payout">{book.lastRoyaltyPayoutDate ? formatDate(book.lastRoyaltyPayoutDate) : 'Never paid'}</Row>
              <Row label="Print partner">{book.printPartner ?? '—'}</Row>
              <Row label="Available on">{book.availableOn.length ? book.availableOn.join(', ') : '—'}</Row>
            </dl>
          </>
        ) : (
          <p className="text-sm text-slate-500">{GENERAL_QUERY_LABEL} query — not linked to a specific book.</p>
        )}
      </div>
    </section>
  )
}

export default AuthorBookContext
