import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import EmptyState from '../../../shared/components/feedback/EmptyState.jsx'
import ErrorState from '../../../shared/components/feedback/ErrorState.jsx'
import PageLoader from '../../../shared/components/feedback/PageLoader.jsx'
import { INPUT_CLASS } from '../../../shared/components/forms/fieldStyles.js'
import Icon from '../../../shared/components/ui/Icon.jsx'
import Pagination from '../../../shared/components/ui/Pagination.jsx'
import useApiQuery from '../../../shared/hooks/useApiQuery.js'
import { formatCurrency, formatDate, formatNumber, getInitials } from '../../../shared/utils/format.js'
import { getBooks } from '../../books/index.js'
import { getAuthors } from '../../users/index.js'

const PAGE_SIZE = 20

function SummaryTile({ icon, label, value, iconClass }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card">
      <span className={`grid size-11 place-items-center rounded-xl ${iconClass}`}>
        <Icon name={icon} />
      </span>
      <span>
        <span className="block text-2xl font-extrabold text-slate-900">{value}</span>
        <span className="text-sm font-medium text-slate-500">{label}</span>
      </span>
    </div>
  )
}

function AuthorsTable({ authors, onOpen }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Books</th>
              <th className="px-4 py-3 text-right">Copies sold</th>
              <th className="px-4 py-3 text-right">Royalty earned</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Pending</th>
              <th className="px-4 py-3 text-right">Tickets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {authors.map((author) => (
              <tr
                key={author.id}
                onClick={() => onOpen(author.id)}
                onKeyDown={(event) => event.key === 'Enter' && onOpen(author.id)}
                tabIndex={0}
                className="cursor-pointer transition hover:bg-brand-50/40 focus:bg-brand-50/60 focus:outline-none"
              >
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand-300 to-brand-500 text-xs font-bold text-brand-950">
                      {getInitials(author.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{author.name}</p>
                      <p className="font-mono text-xs text-slate-500">{author.authorCode}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <p className="text-slate-700">{author.email}</p>
                  <p className="text-xs text-slate-500">
                    {[author.phone, author.city].filter(Boolean).join(' · ') || '—'}
                  </p>
                </td>
                <td className="px-4 py-3.5 text-slate-600">{formatDate(author.joinedDate)}</td>
                <td className="px-4 py-3.5 text-right">
                  <span className="font-semibold text-slate-900">{author.bookStats.books}</span>
                  <span className="block text-xs text-slate-500">{author.bookStats.published} live</span>
                </td>
                <td className="px-4 py-3.5 text-right text-slate-700">{formatNumber(author.bookStats.copiesSold)}</td>
                <td className="px-4 py-3.5 text-right text-slate-700">{formatCurrency(author.bookStats.royaltyEarned)}</td>
                <td className="px-4 py-3.5 text-right text-emerald-700">{formatCurrency(author.bookStats.royaltyPaid)}</td>
                <td
                  className={`px-4 py-3.5 text-right font-semibold ${
                    author.bookStats.royaltyPending > 0 ? 'text-brand-700' : 'text-slate-400'
                  }`}
                >
                  {formatCurrency(author.bookStats.royaltyPending)}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="font-semibold text-slate-900">{author.ticketStats.unresolved}</span>
                  <span className="text-slate-400"> open</span>
                  <span className="block text-xs text-slate-500">{author.ticketStats.total} total</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AuthorsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const page = Number(searchParams.get('page') ?? 1)
  const [searchInput, setSearchInput] = useState(search)

  const { data, error, isLoading, reload } = useApiQuery(
    () => getAuthors({ page, limit: PAGE_SIZE, withStats: true, ...(search && { search }) }),
    `authors:${searchParams.toString()}`,
  )
  // Catalogue-wide totals across every author, from the books summary.
  const { data: catalogue } = useApiQuery(() => getBooks({ limit: 1 }), 'authors-catalogue')

  const applySearch = (event) => {
    event.preventDefault()
    setSearchParams(searchInput.trim() ? { search: searchInput.trim() } : {})
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Authors</h1>
          <p className="mt-1 text-sm text-slate-500">Every author with their books, sales, royalties and open tickets.</p>
        </div>
        <form onSubmit={applySearch} className="flex w-full max-w-md gap-2" role="search">
          <label htmlFor="author-search" className="sr-only">
            Search authors
          </label>
          <input
            id="author-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Name, email or author code"
            className={INPUT_CLASS}
          />
          <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            <Icon name="search" className="size-4" />
            Search
          </button>
        </form>
      </header>

      {catalogue && data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile icon="user" label="Authors" value={formatNumber(data.pagination.total)} iconClass="bg-brand-50 text-brand-600" />
          <SummaryTile icon="book" label="Books" value={formatNumber(catalogue.summary.totalBooks)} iconClass="bg-sky-50 text-sky-600" />
          <SummaryTile icon="trendingUp" label="Copies sold" value={formatNumber(catalogue.summary.totalCopiesSold)} iconClass="bg-violet-50 text-violet-600" />
          <SummaryTile icon="wallet" label="Royalty pending" value={formatCurrency(catalogue.summary.totalRoyaltyPending)} iconClass="bg-amber-50 text-amber-600" />
        </div>
      )}

      {!data && isLoading && <PageLoader fullScreen={false} />}
      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && data.authors.length === 0 && (
        <EmptyState
          icon="user"
          title={search ? 'No authors match' : 'No authors yet'}
          description={search ? `Nothing matches "${search}". Try a name, email or author code.` : undefined}
          action={
            search && (
              <Link to="/admin/authors" onClick={() => setSearchInput('')} className="text-sm font-semibold text-brand-700">
                Clear search
              </Link>
            )
          }
        />
      )}

      {data && data.authors.length > 0 && (
        <div className={`space-y-3 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
          <AuthorsTable authors={data.authors} onOpen={(authorId) => navigate(`/admin/authors/${authorId}`)} />
          <Pagination
            pagination={data.pagination}
            onPageChange={(nextPage) => setSearchParams({ ...(search && { search }), page: String(nextPage) })}
          />
        </div>
      )}
    </section>
  )
}

export default AuthorsPage
