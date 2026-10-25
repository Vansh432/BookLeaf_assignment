import { useState } from 'react'
import InlineError from '../../../../shared/components/feedback/InlineError.jsx'
import { INPUT_CLASS } from '../../../../shared/components/forms/fieldStyles.js'
import Button from '../../../../shared/components/ui/Button.jsx'
import Icon from '../../../../shared/components/ui/Icon.jsx'
import useAction from '../../../../shared/hooks/useAction.js'
import { EMPTY_REPLY, REPLY_INPUT_ID } from '../../constants.js'
import { addMessage } from '../../services/ticket.service.js'

const RESOLVED = 'Resolved'

// Controlled by the page, so an AI draft can be dropped in. draftId travels with the reply, letting the
// API record whether the draft was sent as written or edited.
function ReplyComposer({ ticket, value, onChange, onSent }) {
  const [pendingAction, setPendingAction] = useState(null)
  const { run: send, isPending, error } = useAction(addMessage)
  const { body, draftId } = value

  const submit = async (status) => {
    setPendingAction(status ?? 'reply')
    const updated = await send(ticket.id, { body, ...(status && { status }), ...(draftId && { draftId }) })
    setPendingAction(null)
    if (updated) {
      onChange(EMPTY_REPLY)
      onSent(updated)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Icon name="send" className="size-4" />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Reply to author</h2>
            <p className="text-xs text-slate-500">Sent instantly to the author’s ticket view</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {draftId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              <Icon name="sparkles" className="size-3.5" />
              From AI draft
            </span>
          )}
          <span className="text-xs text-slate-400">{body.length}/5000</span>
        </div>
      </div>
      <label htmlFor={REPLY_INPUT_ID} className="sr-only">
        Reply
      </label>
      <textarea
        id={REPLY_INPUT_ID}
        rows={8}
        maxLength={5000}
        placeholder={`Hi ${ticket.author.name.split(' ')[0]},\n\nThank you for reaching out…`}
        value={body}
        onChange={(event) => onChange({ ...value, body: event.target.value })}
        className={`${INPUT_CLASS} resize-y leading-relaxed`}
      />
      <InlineError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          icon="send"
          isLoading={isPending && pendingAction === 'reply'}
          disabled={!body.trim() || isPending}
          onClick={() => submit()}
        >
          Send reply
        </Button>
        {ticket.status !== RESOLVED && (
          <Button
            icon="checkCircle"
            isLoading={isPending && pendingAction === RESOLVED}
            disabled={!body.trim() || isPending}
            onClick={() => submit(RESOLVED)}
          >
            Send &amp; resolve
          </Button>
        )}
      </div>
    </section>
  )
}

export default ReplyComposer
