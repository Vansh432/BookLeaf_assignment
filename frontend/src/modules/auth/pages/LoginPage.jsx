import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import Icon from '../../../shared/components/ui/Icon.jsx'
import Logo from '../../../shared/components/ui/Logo.jsx'
import Spinner from '../../../shared/components/ui/Spinner.jsx'
import useAuth from '../hooks/useAuth.js'

const HIGHLIGHTS = [
  { icon: 'wallet', title: 'Royalties at a glance', text: 'Earned, paid and pending for every title.' },
  { icon: 'message', title: 'Support that knows your book', text: 'Raise a query and follow every reply.' },
  { icon: 'sparkles', title: 'Faster answers', text: 'AI-assisted responses reviewed by our team.' },
]

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 bg-slate-50/60 py-3 pr-4 pl-11 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100 focus:outline-none'

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-linear-to-br from-brand-950 via-brand-900 to-brand-700 p-12 lg:flex lg:flex-col">
      <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-brand-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-amber-300/10 blur-3xl" />

      <Logo tone="light" />

      <div className="relative my-auto max-w-md">
        <p className="text-sm font-semibold tracking-[0.16em] text-brand-300 uppercase">Author Support Portal</p>
        <h1 className="mt-4 text-4xl leading-tight font-extrabold text-white">
          Your publishing journey, supported at every step.
        </h1>
        <ul className="mt-10 space-y-5">
          {HIGHLIGHTS.map((item) => (
            <li key={item.title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-200 ring-1 ring-white/15">
                <Icon name={item.icon} />
              </span>
              <div>
                <p className="font-semibold text-white">{item.title}</p>
                <p className="text-sm text-brand-100/70">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-sm text-brand-100/60">Publishing authors across India and the US.</p>
    </div>
  )
}

function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [credentials, setCredentials] = useState({ email: '', password: '' })
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirectTo = location.state?.from?.pathname ?? '/'

  if (user) {
    return <Navigate to={redirectTo} replace />
  }

  const handleChange = (event) => {
    setCredentials((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await login(credentials)
      navigate(redirectTo, { replace: true })
    } catch (loginError) {
      setError(loginError)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />

      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="lg:hidden">
            <Logo />
          </div>

          <h2 className="mt-10 text-3xl font-extrabold tracking-tight text-slate-900 lg:mt-0">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-500">Sign in to your author or team account.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-semibold text-slate-700">
                Email address
              </label>
              <div className="relative">
                <Icon name="mail" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  value={credentials.email}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <Icon name="lock" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type={isPasswordVisible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  value={credentials.password}
                  onChange={handleChange}
                  className={`${INPUT_CLASS} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible((isVisible) => !isVisible)}
                  className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                >
                  <Icon name={isPasswordVisible ? 'eyeOff' : 'eye'} className="size-5" />
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">{error.message}</p>
                  {error.errors.length > 0 && (
                    <ul className="mt-1 list-disc pl-4">
                      {error.errors.map((fieldError) => (
                        <li key={`${fieldError.field}-${fieldError.message}`}>{fieldError.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-brand-600 to-brand-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-700 hover:to-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting && <Spinner className="size-4" />}
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
