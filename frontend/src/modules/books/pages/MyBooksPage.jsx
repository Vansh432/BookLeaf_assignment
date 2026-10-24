import EmptyState from '../../../shared/components/feedback/EmptyState.jsx'
import ErrorState from '../../../shared/components/feedback/ErrorState.jsx'
import PageLoader from '../../../shared/components/feedback/PageLoader.jsx'
import Icon from '../../../shared/components/ui/Icon.jsx'
import { useAuth } from '../../auth/index.js'
import BookCard from '../components/BookCard.jsx'
import RoyaltySummary from '../components/RoyaltySummary.jsx'
import useBooks from '../hooks/useBooks.js'

function MyBooksPage() {
  const { user } = useAuth()
  const { data, error, isLoading, reload } = useBooks()
  const firstName = user.name.split(' ')[0]

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-600">Welcome back, {firstName}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">My Books</h1>
          <p className="mt-1 text-sm text-slate-500">Track sales, royalties and production for every title.</p>
        </div>
        <p className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-card ring-1 ring-slate-200/70">
          <Icon name="calendar" className="size-4 text-brand-600" />
          Royalties are paid quarterly, within 45 days of quarter end
        </p>
      </header>

      {isLoading && <PageLoader fullScreen={false} />}

      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && data.books.length === 0 && (
        <EmptyState
          icon="book"
          title="No books yet"
          description="Once your manuscript is received, your book and its royalties will appear here."
        />
      )}

      {data && data.books.length > 0 && (
        <>
          <RoyaltySummary summary={data.summary} />
          <div className="space-y-5">
            {data.books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export default MyBooksPage
