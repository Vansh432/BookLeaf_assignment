import InlineError from '../../../../shared/components/feedback/InlineError.jsx'
import { LABEL_CLASS, SELECT_CLASS } from '../../../../shared/components/forms/fieldStyles.js'
import Button from '../../../../shared/components/ui/Button.jsx'
import Icon from '../../../../shared/components/ui/Icon.jsx'
import useAction from '../../../../shared/hooks/useAction.js'
import { assignToSelf, updateTicket } from '../../services/ticket.service.js'
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../../constants.js'

// Triage flags uncertain or conflicting suggestions; setting the category or priority clears the flag.
function ReviewFlag({ classification, onConfirm, isConfirming }) {
  if (!classification?.needsReview) {
    return null
  }

  return (
    <div role="status" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <Icon name="flag" className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">Triage needs your review</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {classification.reviewReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="text-amber-700">Change the category or priority below, or confirm them as they are.</p>
        <Button variant="secondary" icon="check" isLoading={isConfirming} onClick={onConfirm} className="mt-1 px-3 py-1.5">
          Looks right
        </Button>
      </div>
    </div>
  )
}

// Shows where an effective value came from: still pending, the AI's suggestion, or an admin override.
function SuggestionHint({ classification, field, value }) {
  if (classification?.status === 'pending') {
    return <p className="text-xs text-violet-600">Awaiting triage — set it manually if needed</p>
  }

  const suggested = classification?.[field]
  if (!suggested) {
    return null
  }

  const sourceField = field === 'suggestedPriority' ? 'prioritySource' : 'source'
  const sourceLabels = { ai: 'AI', rules: 'Rules', fallback: 'Rules (AI unavailable)' }
  const confidence =
    field === 'suggestedCategory' && classification.confidence != null
      ? ` · ${Math.round(classification.confidence * 100)}% confident`
      : ''
  const source = `${sourceLabels[classification[sourceField]] ?? 'Rules'}${confidence}`
  return suggested === value ? (
    <p className="flex items-center gap-1 text-xs text-slate-500">
      <Icon name="sparkles" className="size-3.5 text-brand-500" />
      Set by {source}
    </p>
  ) : (
    <p className="text-xs text-amber-700">
      Overridden · {source} suggested <span className="font-semibold">{suggested}</span>
    </p>
  )
}

function ControlSelect({ id, label, value, options, placeholder, onChange, disabled, hint }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={SELECT_CLASS}>
        {!value && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {hint}
    </div>
  )
}

function TicketControls({ ticket, currentUserId, onUpdated }) {
  const update = useAction(updateTicket)
  const assign = useAction(assignToSelf)
  const isAssignedToMe = ticket.assignedTo?.id === currentUserId

  const change = async (field, value) => {
    const updated = await update.run(ticket.id, { [field]: value })
    if (updated) {
      onUpdated(updated)
    }
  }

  const assignMe = async () => {
    const updated = await assign.run(ticket.id)
    if (updated) {
      onUpdated(updated)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <h2 className="font-bold text-slate-900">Ticket details</h2>

      <ReviewFlag classification={ticket.classification} onConfirm={() => change('reviewed', true)} isConfirming={update.isPending} />

      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <Icon name="user" className="size-4 shrink-0 text-slate-400" />
          <span className="truncate text-slate-700">
            {ticket.assignedTo ? (isAssignedToMe ? 'Assigned to you' : ticket.assignedTo.name) : 'Unassigned'}
          </span>
        </span>
        {!isAssignedToMe && (
          <Button variant="secondary" icon="userCheck" isLoading={assign.isPending} onClick={assignMe} className="px-3 py-1.5">
            Assign to me
          </Button>
        )}
      </div>

      <ControlSelect
        id="status"
        label="Status"
        value={ticket.status}
        options={TICKET_STATUSES}
        onChange={(value) => change('status', value)}
        disabled={update.isPending}
      />
      <ControlSelect
        id="category"
        label="Category"
        value={ticket.category}
        options={TICKET_CATEGORIES}
        placeholder="Awaiting triage"
        onChange={(value) => change('category', value)}
        disabled={update.isPending}
        hint={<SuggestionHint classification={ticket.classification} field="suggestedCategory" value={ticket.category} />}
      />
      <ControlSelect
        id="priority"
        label="Priority"
        value={ticket.priority}
        options={TICKET_PRIORITIES}
        placeholder="Awaiting triage"
        onChange={(value) => change('priority', value)}
        disabled={update.isPending}
        hint={<SuggestionHint classification={ticket.classification} field="suggestedPriority" value={ticket.priority} />}
      />

      {ticket.classification?.reasoning && (
        <p className="rounded-xl bg-brand-50/60 px-3 py-2 text-xs text-brand-800">
          <span className="font-semibold">Triage note:</span> {ticket.classification.reasoning}
        </p>
      )}

      <InlineError error={update.error ?? assign.error} />
    </section>
  )
}

export default TicketControls
