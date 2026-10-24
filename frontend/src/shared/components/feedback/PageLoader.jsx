import Spinner from '../ui/Spinner.jsx'

function PageLoader({ fullScreen = true }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-brand-600 ${fullScreen ? 'min-h-screen' : 'py-24'}`}
      role="status"
      aria-live="polite"
    >
      <Spinner className="size-8 border-[3px]" />
      <span className="text-sm font-medium text-slate-500">Loading…</span>
    </div>
  )
}

export default PageLoader
