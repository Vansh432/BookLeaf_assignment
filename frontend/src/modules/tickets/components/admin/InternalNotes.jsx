import { useState } from 'react'
import InlineError from '../../../../shared/components/feedback/InlineError.jsx'
import { INPUT_CLASS } from '../../../../shared/components/forms/fieldStyles.js'
import Button from '../../../../shared/components/ui/Button.jsx'
import Icon from '../../../../shared/components/ui/Icon.jsx'
import useAction from '../../../../shared/hooks/useAction.js'
import { formatDateTime } from '../../../../shared/utils/format.js'
import { addInternalNote } from '../../services/ticket.service.js'

function InternalNotes({ ticket, onUpdated }) {
  const [body, setBody] = useState('')
  const { run: save, isPending, error } = useAction(addInternalNote)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const updated = await save(ticket.id, { body })
    if (updated) {
      setBody('')
      onUpdated(updated)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-amber-200/70 bg-amber-50/40 p-5">
      <div className="flex items-center gap-2">
        <Icon name="note" className="size-5 text-amber-600" />
        <h2 className="font-bold text-slate-900">Internal notes</h2>
        <span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Team only</span>
      </div>

      {ticket.internalNotes.length === 0 ? (
        <p className="text-sm text-slate-500">No notes yet. Notes are never shown to the author.</p>
      ) : (
        <ul className="space-y-3">
          {ticket.internalNotes.map((note) => (
            <li key={note.id} className="rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-amber-100">
              <p className="whitespace-pre-wrap text-slate-800">{note.body}</p>
              <p className="mt-1.5 text-xs text-slate-500">
                {note.author?.name} · {formatDateTime(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="note" className="sr-only">
          New internal note
        </label>
        <textarea
          id="note"
          rows={2}
          maxLength={2000}
          placeholder="Add a note for the team…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className={`${INPUT_CLASS} resize-y`}
        />
        <InlineError error={error} />
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" icon="plus" isLoading={isPending} disabled={!body.trim()}>
            Add note
          </Button>
        </div>
      </form>
    </section>
  )
}

export default InternalNotes
