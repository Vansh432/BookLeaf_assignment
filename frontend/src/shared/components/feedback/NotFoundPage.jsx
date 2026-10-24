import { Link } from 'react-router'

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-slate-500">The page you are looking for does not exist.</p>
      <Link to="/" className="font-medium text-brand-600 hover:underline">
        Go back home
      </Link>
    </div>
  )
}

export default NotFoundPage
