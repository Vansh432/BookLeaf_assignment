import { useState } from 'react'
import { Link, useParams } from 'react-router'
import ErrorState from '../../../shared/components/feedback/ErrorState.jsx'
import InlineError from '../../../shared/components/feedback/InlineError.jsx'
import PageLoader from '../../../shared/components/feedback/PageLoader.jsx'
import { INPUT_CLASS } from '../../../shared/components/forms/fieldStyles.js'
import Button from '../../../shared/components/ui/Button.jsx'
import Icon from '../../../shared/components/ui/Icon.jsx'
import { ROLES } from '../../../shared/constants/app.js'
import useAction from '../../../shared/hooks/useAction.js'
import useApiQuery from '../../../shared/hooks/useApiQuery.js'
import { formatDateTime, formatRelativeTime } from '../../../shared/utils/format.js'
import { useAuth } from '../../auth/index.js'
import ConversationThread from '../components/ConversationThread.jsx'
import { StatusBadge } from '../components/TicketBadges.jsx'
import TicketHero from '../components/TicketHero.jsx'
import { GENERAL_QUERY_LABEL } from '../constants.js'
import useTicketChanges from '../hooks/useTicketChanges.js'
import { addMessage, getTicket } from '../services/ticket.service.js'

const NEXT_STEPS = {
  Open: {
    icon: 'clock',
    title: 'We have your query',
    text: 'A BookLeaf team member will review it and reply here, typically within 24–48 hours.',
  },
  'In Progress': {
    icon: 'sparkles',
    title: 'Our team is on it',
    text: 'Someone is actively working on your query. You will see their reply here the moment it is sent.',
  },
  Resolved: {
    icon: 'checkCircle',
    title: 'Marked as resolved',
    text: 'We believe this is sorted. If anything is still not right, just reply and the ticket reopens.',
  },
  Closed: {
    icon: 'lock',
    title: 'Conversation closed',
    text: 'This ticket is closed. If you need more help, raise a new query and we will pick it up.',
  },
}

function ReplyBox({ ticket, onSent }) {
  const [body, setBody] = useState('')
  const { run: send, isPending, error } = useAction(addMessage)

  if (ticket.status === 'Closed') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white px-5 py-4 text-sm text-slate-600 shadow-card">
        <span className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500">
            <Icon name="lock" className="size-4" />
          </span>
          This ticket is closed. Need more help?
        </span>
        <Link to="/tickets/new" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
          <Icon name="plus" className="size-4" />
          Raise a new query
        </Link>
      </div>
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const updated = await send(ticket.id, { body })
    if (updated) {
      setBody('')
      onSent(updated)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="reply" className="font-bold text-slate-900">
          Reply to BookLeaf
        </label>
        {ticket.status === 'Resolved' && (
          <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Replying reopens this ticket</span>
        )}
      </div>
      <textarea
        id="reply"
        rows={4}
        required
        maxLength={5000}
        placeholder="Add details or ask a follow-up question…"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        className={`${INPUT_CLASS} resize-y leading-relaxed`}
      />
      <InlineError error={error} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">The team is notified instantly.</span>
        <Button type="submit" icon="send" isLoading={isPending} disabled={!body.trim()}>
          Send reply
        </Button>
      </div>
    </form>
  )
}

function SummaryRow({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <dt className="w-24 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold text-slate-800">{children}</dd>
    </div>
  )
}

function TicketSidebar({ ticket }) {
  const nextStep = NEXT_STEPS[ticket.status]
  const teamReplies = ticket.messages.filter((message) => message.senderRole === ROLES.ADMIN).length

  return (
    <aside className="space-y-6">
      <section className="rounded-2xl bg-linear-to-br from-brand-900 via-brand-800 to-brand-600 p-6 text-white shadow-lg shadow-brand-900/20">
        <span className="grid size-10 place-items-center rounded-xl bg-white/15">
          <Icon name={nextStep.icon} className="size-5" />
        </span>
        <h2 className="mt-4 font-bold">{nextStep.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-brand-50/85">{nextStep.text}</p>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
        <h2 className="font-bold text-slate-900">Summary</h2>
        <dl className="mt-2 divide-y divide-slate-100">
          <SummaryRow icon="flag" label="Status">
            <StatusBadge status={ticket.status} />
          </SummaryRow>
          <SummaryRow icon="book" label="About">
            {ticket.book?.title ?? GENERAL_QUERY_LABEL}
          </SummaryRow>
          {ticket.category && (
            <SummaryRow icon="tag" label="Category">
              {ticket.category}
            </SummaryRow>
          )}
          <SummaryRow icon="calendar" label="Raised">
            {formatDateTime(ticket.createdAt)}
          </SummaryRow>
          <SummaryRow icon="clock" label="Last update">
            {formatRelativeTime(ticket.lastActivityAt)}
          </SummaryRow>
          <SummaryRow icon="message" label="Team replies">
            {teamReplies}
          </SummaryRow>
        </dl>
      </section>
    </aside>
  )
}

function TicketDetailPage() {
  const { ticketId } = useParams()
  const { user } = useAuth()
  const { data: ticket, error, isLoading, reload, setData } = useApiQuery(() => getTicket(ticketId), `ticket:${ticketId}`)
  // A team reply or status change appears without a page refresh.
  useTicketChanges(() => reload(), ticketId)

  if (!ticket && isLoading) {
    return <PageLoader fullScreen={false} />
  }

  if (!ticket) {
    return <ErrorState message={error?.message ?? 'Ticket not found'} onRetry={reload} />
  }

  const isAwaitingTeam = ticket.messages.at(-1)?.senderRole !== ROLES.ADMIN && ['Open', 'In Progress'].includes(ticket.status)

  return (
    <section className="space-y-6">
      <TicketHero
        ticket={ticket}
        backTo="/tickets"
        backLabel="My Tickets"
        badges={<StatusBadge status={ticket.status} />}
        meta={[
          { icon: 'book', label: ticket.book?.title ?? GENERAL_QUERY_LABEL },
          { icon: 'calendar', label: `Raised ${formatDateTime(ticket.createdAt)}` },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <div className="rounded-2xl border border-slate-200/60 bg-linear-to-b from-slate-100/80 to-slate-50 p-4 sm:p-6">
            <ConversationThread ticket={ticket} viewerRole={ROLES.AUTHOR} authorName={user.name} />
            {isAwaitingTeam && (
              <p className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
                </span>
                Waiting for a reply from the BookLeaf team
              </p>
            )}
          </div>
          <ReplyBox ticket={ticket} onSent={setData} />
        </div>

        <TicketSidebar ticket={ticket} />
      </div>
    </section>
  )
}

export default TicketDetailPage
