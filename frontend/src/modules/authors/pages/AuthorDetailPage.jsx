import { Link, useParams } from 'react-router'
import EmptyState from '../../../shared/components/feedback/EmptyState.jsx'
import ErrorState from '../../../shared/components/feedback/ErrorState.jsx'
import PageLoader from '../../../shared/components/feedback/PageLoader.jsx'
import { buttonClass } from '../../../shared/components/ui/buttonStyles.js'
import Icon from '../../../shared/components/ui/Icon.jsx'
import useApiQuery from '../../../shared/hooks/useApiQuery.js'
import { formatDate, formatDateTime, formatRelativeTime, getInitials } from '../../../shared/utils/format.js'
import { BookCard, getBooks, RoyaltySummary } from '../../books/index.js'
import { getTickets, PriorityBadge, StatusBadge } from '../../tickets/index.js'
import { getAuthor } from '../../users/index.js'

// The API's maximum page size; authors have a handful of books.
const BOOKS_LIMIT = 100
const RECENT_TICKETS = 5

function ProfileRow({ icon, label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <dt className="flex items-center gap-2 text-slate-500">
        <Icon name={icon} className="size-4 text-slate-400" />
        {label}
      </dt>
      <dd className="text-right font-medium break-all text-slate-800">{children}</dd>
    </div>
  )
}

function ProfileCard({ author }) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <h2 className="font-bold text-slate-900">Profile</h2>
      <dl className="mt-3 divide-y divide-slate-100">
        <ProfileRow icon="mail" label="Email">
          <a href={`mailto:${author.email}`} className="text-brand-700 hover:underline">
            {author.email}
          </a>
        </ProfileRow>
        <ProfileRow icon="message" label="Phone">{author.phone ?? '—'}</ProfileRow>
        <ProfileRow icon="globe" label="City">{author.city ?? '—'}</ProfileRow>
        <ProfileRow icon="calendar" label="Author since">{formatDate(author.joinedDate)}</ProfileRow>
        <ProfileRow icon="clock" label="Last sign-in">{author.lastLoginAt ? formatDateTime(author.lastLoginAt) : 'Never'}</ProfileRow>
        <ProfileRow icon="book" label="Books">
          {author.bookStats.books} ({author.bookStats.published} live)
        </ProfileRow>
      </dl>
    </section>
  )
}

function RecentTickets({ author }) {
  const { data, error } = useApiQuery(
    () => getTickets({ authorId: author.id, limit: RECENT_TICKETS }),
    `author-tickets:${author.id}`,
  )

  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold text-slate-900">Tickets</h2>
        <span className="text-xs text-slate-500">
          {author.ticketStats.unresolved} open · {author.ticketStats.total} total
        </span>
      </div>
      {author.ticketStats.total > 0 && <p className="mt-0.5 text-xs text-slate-400">Unresolved and most urgent first</p>}

      {error && <p className="mt-3 text-sm text-red-600">{error.message}</p>}
      {data && data.tickets.length === 0 && <p className="mt-3 text-sm text-slate-500">No support tickets yet.</p>}
      {data && data.tickets.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {data.tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link to={`/admin/tickets/${ticket.id}`} className="block py-3 transition hover:bg-slate-50/80">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-500">{ticket.ticketNumber}</span>
                  <span className="text-xs text-slate-400">{formatRelativeTime(ticket.createdAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{ticket.subject}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <PriorityBadge priority={ticket.priority} />
                  <StatusBadge status={ticket.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {author.ticketStats.total > 0 && (
        <Link
          to={`/admin/tickets?authorId=${author.id}`}
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          View all in the ticket queue
          <Icon name="chevronRight" className="size-4" />
        </Link>
      )}
    </section>
  )
}

function AuthorDetailPage() {
  const { authorId } = useParams()
  const author = useApiQuery(() => getAuthor(authorId), `author:${authorId}`)
  const books = useApiQuery(() => getBooks({ authorId, limit: BOOKS_LIMIT }), `author-books:${authorId}`)

  if (!author.data && author.isLoading) {
    return <PageLoader fullScreen={false} />
  }

  if (!author.data) {
    return <ErrorState message={author.error?.message ?? 'Author not found'} onRetry={author.reload} />
  }

  const profile = author.data

  return (
    <section className="space-y-6">
      <Link to="/admin/authors" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <Icon name="arrowLeft" className="size-4" />
        Authors
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-linear-to-br from-brand-300 to-brand-500 text-lg font-bold text-brand-950">
            {getInitials(profile.name)}
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{profile.name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="font-mono">{profile.authorCode}</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                  profile.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
                }`}
              >
                <Icon name={profile.isActive ? 'checkCircle' : 'lock'} className="size-3.5" />
                {profile.isActive ? 'Active' : 'Disabled'}
              </span>
            </p>
          </div>
        </div>
        {profile.ticketStats.total > 0 && (
          <Link to={`/admin/tickets?authorId=${profile.id}`} className={buttonClass('secondary')}>
            <Icon name="inbox" className="size-4" />
            Tickets ({profile.ticketStats.unresolved} open)
          </Link>
        )}
      </header>

      {books.data && books.data.books.length > 0 && (
        <RoyaltySummary summary={books.data.summary} paidCaption="Transferred to the author's bank" />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">Books</h2>
          {!books.data && books.isLoading && <PageLoader fullScreen={false} />}
          {books.error && <ErrorState message={books.error.message} onRetry={books.reload} />}
          {books.data && books.data.books.length === 0 && (
            <EmptyState icon="book" title="No books yet" description="This author has no books on record." />
          )}
          {books.data?.books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>

        <aside className="space-y-6">
          <ProfileCard author={profile} />
          <RecentTickets author={profile} />
        </aside>
      </div>
    </section>
  )
}

export default AuthorDetailPage
