import { useNavigate, useSearchParams } from 'react-router'
import EmptyState from '../../../shared/components/feedback/EmptyState.jsx'
import ErrorState from '../../../shared/components/feedback/ErrorState.jsx'
import PageLoader from '../../../shared/components/feedback/PageLoader.jsx'
import { INPUT_CLASS } from '../../../shared/components/forms/fieldStyles.js'
import SelectMenu from '../../../shared/components/forms/SelectMenu.jsx'
import Icon from '../../../shared/components/ui/Icon.jsx'
import Pagination from '../../../shared/components/ui/Pagination.jsx'
import useApiQuery from '../../../shared/hooks/useApiQuery.js'
import { formatRelativeTime, hoursSince } from '../../../shared/utils/format.js'
import { getAuthors } from '../../users/index.js'
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/TicketBadges.jsx'
import {
  GENERAL_QUERY_LABEL,
  PRIORITY_DOTS,
  STALE_AFTER_HOURS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from '../constants.js'
import useTicketChanges from '../hooks/useTicketChanges.js'
import { getTickets } from '../services/ticket.service.js'

const PAGE_SIZE = 20
// The API's maximum page size; enough for the author dropdown in this dataset.
const AUTHOR_OPTIONS_LIMIT = 100
const FILTER_KEYS = ['status', 'authorId', 'category', 'priority', 'assigned', 'from', 'to']
const UNRESOLVED = ['Open', 'In Progress']

const CATEGORY_OPTIONS = TICKET_CATEGORIES.map((category) => ({ value: category, label: category }))
const PRIORITY_OPTIONS = TICKET_PRIORITIES.map((priority) => ({ value: priority, label: priority, dot: PRIORITY_DOTS[priority] }))
const ASSIGNMENT_OPTIONS = [
  { value: 'me', label: 'Assigned to me' },
  { value: 'unassigned', label: 'Unassigned' },
]

const STAT_TILES = [
  { status: 'Open', icon: 'inbox', tone: 'text-sky-600 bg-sky-50' },
  { status: 'In Progress', icon: 'clock', tone: 'text-amber-600 bg-amber-50' },
  { status: 'Resolved', icon: 'checkCircle', tone: 'text-emerald-600 bg-emerald-50' },
  { status: 'Closed', icon: 'lock', tone: 'text-slate-600 bg-slate-100' },
]

function StatTiles({ counts, activeStatus, onSelect }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STAT_TILES.map((tile) => {
        const isActive = activeStatus === tile.status
        return (
          <button
            key={tile.status}
            type="button"
            onClick={() => onSelect(isActive ? '' : tile.status)}
            aria-pressed={isActive}
            className={`flex items-center gap-4 rounded-2xl border bg-white p-4 text-left shadow-card transition hover:shadow-card-hover ${
              isActive ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200/70'
            }`}
          >
            <span className={`grid size-11 place-items-center rounded-xl ${tile.tone}`}>
              <Icon name={tile.icon} />
            </span>
            <span>
              <span className="block text-2xl font-extrabold text-slate-900">{counts[tile.status]}</span>
              <span className="text-sm font-medium text-slate-500">{tile.status}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FilterBar({ filters, onChange, onClear }) {
  const { data: authorsData } = useApiQuery(() => getAuthors({ limit: AUTHOR_OPTIONS_LIMIT }), 'queue-authors')
  const authorOptions = (authorsData?.authors ?? []).map((author) => ({
    value: author.id,
    label: author.name,
    description: `${author.authorCode} · ${author.email}`,
    avatar: true,
  }))
  const hasFilters = FILTER_KEYS.some((key) => key !== 'status' && filters[key])

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-card">
      <Icon name="filter" className="ml-1 size-5 text-slate-400" />
      <SelectMenu
        label="Author"
        placeholder="All authors"
        value={filters.authorId}
        options={authorOptions}
        onChange={(value) => onChange('authorId', value)}
        searchable
        searchPlaceholder="Search name, code or email"
      />
      <SelectMenu
        label="Category"
        placeholder="All categories"
        value={filters.category}
        options={CATEGORY_OPTIONS}
        onChange={(value) => onChange('category', value)}
      />
      <SelectMenu
        label="Priority"
        placeholder="All priorities"
        value={filters.priority}
        options={PRIORITY_OPTIONS}
        onChange={(value) => onChange('priority', value)}
      />
      <SelectMenu
        label="Assignee"
        placeholder="Anyone"
        value={filters.assigned}
        options={ASSIGNMENT_OPTIONS}
        onChange={(value) => onChange('assigned', value)}
      />
      <label className="flex items-center gap-2 text-sm text-slate-500">
        From
        <input type="date" value={filters.from ?? ''} onChange={(event) => onChange('from', event.target.value)} className={INPUT_CLASS} />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-500">
        To
        <input type="date" value={filters.to ?? ''} onChange={(event) => onChange('to', event.target.value)} className={INPUT_CLASS} />
      </label>
      {hasFilters && (
        <button type="button" onClick={onClear} className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          Clear filters
        </button>
      )}
    </div>
  )
}

function WaitingTime({ ticket }) {
  const isWaiting = UNRESOLVED.includes(ticket.status)
  const isStale = isWaiting && hoursSince(ticket.createdAt) > STALE_AFTER_HOURS

  return (
    <span className={`text-xs font-medium ${isStale ? 'text-red-600' : 'text-slate-500'}`}>
      {isStale && <Icon name="alert" className="mr-1 inline size-3.5 align-[-2px]" />}
      {formatRelativeTime(ticket.createdAt)}
    </span>
  )
}

function QueueTable({ tickets, onOpen }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Ticket</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Raised</th>
              <th className="px-4 py-3">Assignee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                onClick={() => onOpen(ticket.id)}
                onKeyDown={(event) => event.key === 'Enter' && onOpen(ticket.id)}
                tabIndex={0}
                className={`cursor-pointer transition hover:bg-brand-50/40 focus:bg-brand-50/60 focus:outline-none ${
                  ticket.priority === 'Critical' && UNRESOLVED.includes(ticket.status) ? 'bg-red-50/40' : ''
                }`}
              >
                <td className="px-4 py-3.5">
                  <PriorityBadge priority={ticket.priority} />
                </td>
                <td className="max-w-80 px-4 py-3.5">
                  <p className="font-mono text-xs text-slate-500">{ticket.ticketNumber}</p>
                  <p className="truncate font-semibold text-slate-900">{ticket.subject}</p>
                  <p className="truncate text-xs text-slate-500">{ticket.book?.title ?? GENERAL_QUERY_LABEL}</p>
                </td>
                <td className="px-4 py-3.5">
                  <p className="font-medium text-slate-800">{ticket.author?.name}</p>
                  <p className="text-xs text-slate-500">{ticket.author?.authorCode}</p>
                </td>
                <td className="px-4 py-3.5">
                  <CategoryBadge category={ticket.category} />
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-3.5">
                  <WaitingTime ticket={ticket} />
                </td>
                <td className="px-4 py-3.5 text-slate-600">
                  {ticket.assignedTo?.name ?? <span className="text-slate-400">Unassigned</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TicketQueuePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? '']))
  const page = Number(searchParams.get('page') ?? 1)
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))

  const { data, error, isLoading, reload } = useApiQuery(
    () => getTickets({ page, limit: PAGE_SIZE, ...activeFilters }),
    `queue:${searchParams.toString()}`,
  )
  // New tickets and changes by other admins re-sort the queue live.
  useTicketChanges(() => reload())

  const applyParams = (params) => setSearchParams(Object.fromEntries(Object.entries(params).filter(([, value]) => value)))
  // Filter changes drop `page`, so new results are never hidden on a later page.
  const setFilter = (key, value) => applyParams({ ...activeFilters, [key]: value })

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Ticket Queue</h1>
          <p className="mt-1 text-sm text-slate-500">Unresolved first, then by priority, then oldest — the next ticket to pick up is always on top.</p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          <Icon name="refresh" className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {data && (
        <StatTiles counts={data.statusCounts} activeStatus={filters.status} onSelect={(status) => setFilter('status', status)} />
      )}

      <FilterBar filters={filters} onChange={setFilter} onClear={() => applyParams({ status: filters.status })} />

      {!data && isLoading && <PageLoader fullScreen={false} />}
      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && data.tickets.length === 0 && (
        <EmptyState icon="inbox" title="No tickets match" description="Nothing in the queue for these filters. Try widening them." />
      )}

      {data && data.tickets.length > 0 && (
        <div className={`space-y-3 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
          <QueueTable tickets={data.tickets} onOpen={(ticketId) => navigate(`/admin/tickets/${ticketId}`)} />
          <Pagination
            pagination={data.pagination}
            onPageChange={(nextPage) => applyParams({ ...activeFilters, page: String(nextPage) })}
          />
        </div>
      )}
    </section>
  )
}

export default TicketQueuePage
