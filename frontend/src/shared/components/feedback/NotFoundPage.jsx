import { Link } from 'react-router'
import Icon from '../ui/Icon.jsx'
import Logo from '../ui/Logo.jsx'

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-b from-brand-50 to-white px-4 text-center">
      <Logo />
      <p className="mt-10 bg-linear-to-r from-brand-600 to-brand-400 bg-clip-text text-7xl font-extrabold text-transparent">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">This page has gone out of print</h1>
      <p className="mt-2 max-w-sm text-slate-500">The page you are looking for does not exist or has been moved.</p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700"
      >
        <Icon name="arrowLeft" className="size-4" />
        Back to home
      </Link>
    </div>
  )
}

export default NotFoundPage
