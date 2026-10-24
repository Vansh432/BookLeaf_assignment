import Icon from './Icon.jsx'

const PAGE_BUTTON_CLASS =
  'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'

function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) {
    return null
  }

  const { page, totalPages, total } = pagination

  return (
    <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Pagination">
      <p className="text-sm text-slate-500">
        Page <span className="font-semibold text-slate-700">{page}</span> of {totalPages} · {total} total
      </p>
      <div className="flex gap-2">
        <button type="button" className={PAGE_BUTTON_CLASS} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <Icon name="chevronLeft" className="size-4" />
          Previous
        </button>
        <button
          type="button"
          className={PAGE_BUTTON_CLASS}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <Icon name="chevronRight" className="size-4" />
        </button>
      </div>
    </nav>
  )
}

export default Pagination
