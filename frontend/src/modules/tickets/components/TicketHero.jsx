import { Link } from 'react-router'
import Icon from '../../../shared/components/ui/Icon.jsx'
import TicketStatusTracker from './TicketStatusTracker.jsx'

// Header card shared by the author and admin ticket pages.
function TicketHero({ ticket, backTo, backLabel, badges, meta, chips }) {
  return (
    <header className="space-y-4">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <Icon name="arrowLeft" className="size-4" />
        {backLabel}
      </Link>

      <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-6 shadow-card sm:p-7">
        <span className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-brand-100/50 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-semibold text-white">
              <Icon name="ticket" className="size-3.5" />
              {ticket.ticketNumber}
            </span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{ticket.subject}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
              {meta.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                  <Icon name={item.icon} className="size-4 text-slate-400" />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{badges}</div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-slate-100 pt-6">
          <div className="w-full max-w-md">
            <TicketStatusTracker status={ticket.status} />
          </div>
          {chips && <div className="flex flex-wrap gap-2">{chips}</div>}
        </div>
      </div>
    </header>
  )
}

export default TicketHero
