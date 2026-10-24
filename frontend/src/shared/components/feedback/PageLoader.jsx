function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <span className="size-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

export default PageLoader
