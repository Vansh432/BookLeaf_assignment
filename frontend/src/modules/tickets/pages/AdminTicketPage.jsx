import { useState } from 'react'
import { useParams } from 'react-router'
import ErrorState from '../../../shared/components/feedback/ErrorState.jsx'
import PageLoader from '../../../shared/components/feedback/PageLoader.jsx'
import Icon from '../../../shared/components/ui/Icon.jsx'
import { ROLES } from '../../../shared/constants/app.js'
import useApiQuery from '../../../shared/hooks/useApiQuery.js'
import { formatDateTime, formatDuration, hoursSince } from '../../../shared/utils/format.js'
import { useAuth } from '../../auth/index.js'
import AiDraftPanel from '../components/admin/AiDraftPanel.jsx'
import AuthorBookContext from '../components/admin/AuthorBookContext.jsx'
import InternalNotes from '../components/admin/InternalNotes.jsx'
import ReplyComposer from '../components/admin/ReplyComposer.jsx'
import TicketControls from '../components/admin/TicketControls.jsx'
import ConversationThread from '../components/ConversationThread.jsx'
import { PriorityBadge, StatusBadge } from '../components/TicketBadges.jsx'
import TicketHero from '../components/TicketHero.jsx'
import { EMPTY_REPLY, GENERAL_QUERY_LABEL, REPLY_INPUT_ID, STALE_AFTER_HOURS, UNRESOLVED_STATUSES } from '../constants.js'
import useTicketChanges from '../hooks/useTicketChanges.js'
import { getTicket } from '../services/ticket.service.js'

const CHIP_TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  good: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
}

function MetricChip({ icon, tone, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${CHIP_TONES[tone]}`}>
      <Icon name={icon} className="size-4" />
      {children}
    </span>
  )
}

// Response-time signals the ops team is measured on.
function SlaChips({ ticket }) {
  const isOpen = UNRESOLVED_STATUSES.includes(ticket.status)
  const isStale = isOpen && hoursSince(ticket.createdAt) > STALE_AFTER_HOURS

  return (
    <>
      {isOpen && (
        <MetricChip icon="clock" tone={isStale ? 'danger' : 'neutral'}>
          Open for {formatDuration(ticket.createdAt)}
        </MetricChip>
      )}
      {ticket.firstRespondedAt ? (
        <MetricChip icon="checkCircle" tone="good">
          First reply in {formatDuration(ticket.createdAt, ticket.firstRespondedAt)}
        </MetricChip>
      ) : (
        <MetricChip icon="alert" tone="warn">
          No reply yet
        </MetricChip>
      )}
    </>
  )
}

function AdminTicketPage() {
  const { ticketId } = useParams()
  const { user } = useAuth()
  const { data: ticket, error, isLoading, reload, setData } = useApiQuery(() => getTicket(ticketId), `admin-ticket:${ticketId}`)
  // Author follow-ups and other admins' changes appear while this ticket is open; a draft reply is kept.
  useTicketChanges(() => reload(), ticketId)
  const [reply, setReply] = useState(EMPTY_REPLY)

  const applyDraft = (draft) => {
    if (reply.body.trim() && reply.body !== draft.content && !window.confirm('Replace your current reply with the AI draft?')) {
      return
    }
    setReply({ body: draft.content, draftId: draft.id })
    document.getElementById(REPLY_INPUT_ID)?.focus()
  }

  if (!ticket && isLoading) {
    return <PageLoader fullScreen={false} />
  }

  if (!ticket) {
    return <ErrorState message={error?.message ?? 'Ticket not found'} onRetry={reload} />
  }

  return (
    <section className="space-y-6">
      <TicketHero
        ticket={ticket}
        backTo="/admin/tickets"
        backLabel="Ticket Queue"
        badges={
          <>
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </>
        }
        meta={[
          { icon: 'user', label: `${ticket.author.name} (${ticket.author.authorCode})` },
          { icon: 'book', label: ticket.book?.title ?? GENERAL_QUERY_LABEL },
          { icon: 'calendar', label: `Raised ${formatDateTime(ticket.createdAt)}` },
        ]}
        chips={<SlaChips ticket={ticket} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <div className="rounded-2xl border border-slate-200/60 bg-linear-to-b from-slate-100/80 to-slate-50 p-4 sm:p-6">
            <ConversationThread ticket={ticket} viewerRole={ROLES.ADMIN} authorName={ticket.author.name} />
          </div>
          <AiDraftPanel ticket={ticket} onUseDraft={applyDraft} />
          <ReplyComposer ticket={ticket} value={reply} onChange={setReply} onSent={setData} />
        </div>

        <aside className="space-y-6">
          <TicketControls ticket={ticket} currentUserId={user.id} onUpdated={setData} />
          <AuthorBookContext author={ticket.author} book={ticket.book} />
          <InternalNotes ticket={ticket} onUpdated={setData} />
        </aside>
      </div>
    </section>
  )
}

export default AdminTicketPage
