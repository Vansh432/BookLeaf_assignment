import Icon from '../ui/Icon.jsx'

function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="animate-fade-in rounded-2xl border border-red-100 bg-white px-6 py-14 text-center shadow-card">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600">
        <Icon name="alert" className="size-7" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          <Icon name="refresh" className="size-4" />
          Try again
        </button>
      )}
    </div>
  )
}

export default ErrorState
