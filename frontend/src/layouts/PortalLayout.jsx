import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../modules/auth/index.js'
import { TicketNotifications } from '../modules/tickets/index.js'
import Icon from '../shared/components/ui/Icon.jsx'
import Logo from '../shared/components/ui/Logo.jsx'
import { ROLE_LABELS, ROLES } from '../shared/constants/app.js'
import useSocketStatus from '../shared/hooks/useSocketStatus.js'
import { connectSocket, disconnectSocket } from '../shared/services/socket.js'
import { getInitials } from '../shared/utils/format.js'

const NAV_ITEMS = {
  [ROLES.AUTHOR]: [
    { to: '/books', label: 'My Books', icon: 'book' },
    { to: '/tickets', label: 'My Tickets', icon: 'ticket' },
  ],
  [ROLES.ADMIN]: [
    { to: '/admin/tickets', label: 'Ticket Queue', icon: 'inbox' },
    { to: '/admin/authors', label: 'Authors', icon: 'user' },
    { to: '/admin/ai-usage', label: 'AI Usage', icon: 'trendingUp' },
  ],
}

const navLinkClass = ({ isActive }) =>
  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
    isActive
      ? 'bg-white/10 text-white shadow-inner ring-1 ring-white/10'
      : 'text-brand-100/70 hover:bg-white/5 hover:text-white'
  }`

function LiveIndicator() {
  const isConnected = useSocketStatus()

  return (
    <p className="mb-3 flex items-center gap-2 px-3 text-xs font-medium text-brand-100/70" role="status">
      <span className="relative flex size-2">
        {isConnected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex size-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-slate-400'}`} />
      </span>
      {isConnected ? 'Live updates on' : 'Reconnecting…'}
    </p>
  )
}

function SidebarContent({ user, onNavigate, onLogout }) {
  return (
    <div className="flex h-full flex-col bg-linear-to-b from-brand-950 via-brand-900 to-brand-800 px-4 py-6">
      <div className="px-2">
        <Logo tone="light" />
      </div>

      <p className="mt-10 px-3 text-[11px] font-bold tracking-[0.14em] text-brand-300/60 uppercase">
        {ROLE_LABELS[user.role]} workspace
      </p>
      <nav className="mt-3 space-y-1" aria-label="Main">
        {NAV_ITEMS[user.role].map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={onNavigate}>
            <Icon name={item.icon} className="size-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto" />
      <LiveIndicator />
      <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand-300 to-brand-500 text-sm font-bold text-brand-950">
            {getInitials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="truncate text-xs text-brand-100/60">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
        >
          <Icon name="logout" className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}

function PortalLayout() {
  const { user, logout } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const closeMenu = () => setIsMenuOpen(false)

  // The layout only renders for signed-in users, so the socket lives exactly as long as the session.
  useEffect(() => {
    connectSocket()
    return () => {
      disconnectSocket()
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 lg:block">
        <SidebarContent user={user} onLogout={logout} />
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setIsMenuOpen(true)}
          className="grid size-10 place-items-center rounded-xl text-slate-700 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <Icon name="menu" />
        </button>
      </header>

      {isMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={closeMenu}
            aria-label="Close menu"
          />
          <div className="relative h-full w-72 animate-fade-in">
            <SidebarContent user={user} onNavigate={closeMenu} onLogout={logout} />
            <button
              type="button"
              onClick={closeMenu}
              className="absolute top-6 right-3 grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/10"
              aria-label="Close menu"
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
      )}

      <main className="lg:pl-72">
        <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      <TicketNotifications />
    </div>
  )
}

export default PortalLayout
