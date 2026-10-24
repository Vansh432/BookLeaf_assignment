import { Link, useSearchParams } from 'react-router'
import EmptyState from '../../../shared/components/feedback/EmptyState.jsx'
import ErrorState from '../../../shared/components/feedback/ErrorState.jsx'
import PageLoader from '../../../shared/components/feedback/PageLoader.jsx'
import { buttonClass } from '../../../shared/components/ui/buttonStyles.js'
import Icon from '../../../shared/components/ui/Icon.jsx'
import Pagination from '../../../shared/components/ui/Pagination.jsx'
import useApiQuery from '../../../shared/hooks/useApiQuery.js'
import { ROLES } from '../../../shared/constants/app.js'
import { formatRelativeTime } from '../../../shared/utils/format.js'
import { CategoryBadge, StatusBadge } from '../components/TicketBadges.jsx'
import { GENERAL_QUERY_LABEL, STATUS_STYLES, TICKET_STATUSES, UNRESOLVED_STATUSES } from '../constants.js'
import useTicketChanges from '../hooks/useTicketChanges.js'
import { getTickets } from '../services/ticket.service.js'

const PAGE_SIZE = 10

function StatusTabs({ counts, activeStatus, onSelect }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const tabs = [
    { label: 'All', value: '', count: total },
    ...TICKET_STATUSES.map((status) => ({ label: status, value: status, count: counts[status], dot: STATUS_STYLES[status].dot })),
  ]

  return (
    <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-card ring-1 ring-slate-200/70 sm:inline-flex" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.value === activeStatus
        return (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.value)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.dot && <span className={`size-2 rounded-full ${tab.dot}`} />}
            {tab.label}
            <span className={`rounded-md px-1.5 text-xs ${isActive ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>
          </button>
        )
      })}
    </div>
  )
}

// Who the conversation is waiting on, so authors can see at a glance where action is needed.
function ConversationState({ ticket }) {
  if (ticket.latestMessageRole === ROLES.ADMIN) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
        <Icon name="message" className="size-3.5" />
        BookLeaf replied {formatRelativeTime(ticket.latestMessageAt)}
      </span>
    )
  }

  if (UNRESOLVED_STATUSES.includes(ticket.status)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        <Icon name="clock" className="size-3.5" />
        Awaiting BookLeaf
      </span>
    )
  }

  return null
}

function TicketRow({ ticket }) {
  return (
    <li>
      <Link
        to={`/tickets/${ticket.id}`}
        className="group flex overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover"
      >
        <span className={`w-1.5 shrink-0 ${STATUS_STYLES[ticket.status].accent}`} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="hidden size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 sm:grid">
            <Icon name={ticket.book ? 'book' : 'ticket'} className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700">{ticket.ticketNumber}</span>
              <span className="truncate">{ticket.book?.title ?? GENERAL_QUERY_LABEL}</span>
            </div>
            <h2 className="mt-1.5 truncate text-base font-bold text-slate-900 group-hover:text-brand-700">{ticket.subject}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ConversationState ticket={ticket} />
              {ticket.category && <CategoryBadge category={ticket.category} />}
              {ticket.messagesCount > 0 && (
                <span className="text-xs text-slate-400">
                  {ticket.messagesCount} {ticket.messagesCount === 1 ? 'reply' : 'replies'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
            <StatusBadge status={ticket.status} />
            <span className="text-xs text-slate-500">Updated {formatRelativeTime(ticket.lastActivityAt)}</span>
          </div>
          <Icon
            name="chevronRight"
            className="hidden size-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 sm:block"
          />
        </div>
      </Link>
    </li>
  )
}

function MyTicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const { data, error, isLoading, reload } = useApiQuery(
    () => getTickets({ page, limit: PAGE_SIZE, ...(status && { status }) }),
    `my-tickets:${status}:${page}`,
  )
  useTicketChanges(() => reload())

  const updateParams = (next) => {
    const params = Object.fromEntries(Object.entries(next).filter(([, value]) => value))
    setSearchParams(params)
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">My Tickets</h1>
          <p className="mt-1 text-sm text-slate-500">Follow your queries and every reply from the BookLeaf team.</p>
        </div>
        <Link to="/tickets/new" className={buttonClass('primary')}>
          <Icon name="plus" className="size-4" />
          Raise a query
        </Link>
      </header>

      {data && <StatusTabs counts={data.statusCounts} activeStatus={status} onSelect={(value) => updateParams({ status: value })} />}

      {!data && isLoading && <PageLoader fullScreen={false} />}
      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && data.tickets.length === 0 && (
        <EmptyState
          icon="ticket"
          title={status ? `No ${status.toLowerCase()} tickets` : 'No queries yet'}
          description={
            status
              ? 'Try another status to see the rest of your tickets.'
              : 'Questions about royalties, your ISBN, printing or your book’s progress? We are here to help.'
          }
          action={
            !status && (
              <Link to="/tickets/new" className={buttonClass('primary')}>
                <Icon name="plus" className="size-4" />
                Raise your first query
              </Link>
            )
          }
        />
      )}

      {data && data.tickets.length > 0 && (
        <div className={`space-y-3 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
          <ul className="space-y-3">
            {data.tickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </ul>
          <Pagination pagination={data.pagination} onPageChange={(nextPage) => updateParams({ status, page: nextPage })} />
        </div>
      )}
    </section>
  )
}

export default MyTicketsPage
