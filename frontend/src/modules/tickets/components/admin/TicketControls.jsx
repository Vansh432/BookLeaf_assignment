import InlineError from '../../../../shared/components/feedback/InlineError.jsx'
import { LABEL_CLASS, SELECT_CLASS } from '../../../../shared/components/forms/fieldStyles.js'
import Button from '../../../../shared/components/ui/Button.jsx'
import Icon from '../../../../shared/components/ui/Icon.jsx'
import useAction from '../../../../shared/hooks/useAction.js'
import { assignToSelf, updateTicket } from '../../services/ticket.service.js'
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../../constants.js'

// Shows where an effective value came from: still pending, the AI's suggestion, or an admin override.
function SuggestionHint({ classification, field, value }) {
  if (classification?.status === 'pending') {
    return <p className="text-xs text-violet-600">Awaiting triage — set it manually if needed</p>
  }

  const suggested = classification?.[field]
  if (!suggested) {
    return null
  }

  const source = classification.source === 'fallback' ? 'Rules' : 'AI'
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
