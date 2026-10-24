import { useState } from 'react'
import InlineError from '../../../../shared/components/feedback/InlineError.jsx'
import { INPUT_CLASS } from '../../../../shared/components/forms/fieldStyles.js'
import Button from '../../../../shared/components/ui/Button.jsx'
import Icon from '../../../../shared/components/ui/Icon.jsx'
import useAction from '../../../../shared/hooks/useAction.js'
import { addMessage } from '../../services/ticket.service.js'

const RESOLVED = 'Resolved'

function ReplyComposer({ ticket, onSent }) {
  const [body, setBody] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const { run: send, isPending, error } = useAction(addMessage)

  const submit = async (status) => {
    setPendingAction(status ?? 'reply')
    const updated = await send(ticket.id, { body, ...(status && { status }) })
    setPendingAction(null)
    if (updated) {
      setBody('')
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
        <span className="text-xs text-slate-400">{body.length}/5000</span>
      </div>
      <label htmlFor="admin-reply" className="sr-only">
        Reply
      </label>
      <textarea
        id="admin-reply"
        rows={8}
        maxLength={5000}
        placeholder={`Hi ${ticket.author.name.split(' ')[0]},\n\nThank you for reaching out…`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
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
