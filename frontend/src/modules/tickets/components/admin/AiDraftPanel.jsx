import InlineError from '../../../../shared/components/feedback/InlineError.jsx'
import Button from '../../../../shared/components/ui/Button.jsx'
import Icon from '../../../../shared/components/ui/Icon.jsx'
import Spinner from '../../../../shared/components/ui/Spinner.jsx'
import useAction from '../../../../shared/hooks/useAction.js'
import useApiQuery from '../../../../shared/hooks/useApiQuery.js'
import { formatDateTime } from '../../../../shared/utils/format.js'
import { DRAFT_STATUSES } from '../../constants.js'
import { getDraft, requestDraft } from '../../services/ticket.service.js'

function Callout({ tone, icon, title, children }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }

  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      <Icon name={icon} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  )
}

function NoteList({ items }) {
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function DraftBody({ draft }) {
  const cited = draft.policies.filter((policy) => draft.citedPolicyIds.includes(policy.chunkId))

  return (
    <div className="space-y-3">
      {draft.warnings.length > 0 && (
        <Callout tone="red" icon="alert" title="Check before sending">
          <NoteList items={draft.warnings} />
        </Callout>
      )}
      {draft.reviewNotes.length > 0 && (
        <Callout tone="amber" icon="flag" title="To verify">
          <NoteList items={draft.reviewNotes} />
        </Callout>
      )}

      <p className="max-h-80 overflow-y-auto rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
        {draft.content}
      </p>

      {cited.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Icon name="book" className="size-3.5" />
          Based on
          {cited.map((policy) => (
            <span key={policy.chunkId} className="rounded-md bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
              {policy.title}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The AI-drafted reply for an admin. A draft is requested automatically only while the author is
 * waiting for a reply; after the team has replied, the panel just refreshes the draft's status.
 * Nothing is sent from here: "Use draft" copies the text into the reply box for review and editing.
 */
function AiDraftPanel({ ticket, onUseDraft }) {
  const lastMessage = ticket.messages.at(-1)
  const authorIsWaiting = !lastMessage || lastMessage.senderRole === 'author'

  // Keyed on the message count, so a new author follow-up fetches a draft that answers it.
  const query = useApiQuery(
    () => (authorIsWaiting ? requestDraft(ticket.id) : getDraft(ticket.id)),
    `draft:${ticket.id}:${ticket.messages.length}`,
  )
  const regenerate = useAction(requestDraft)
  const draft = query.data
  const isDrafting = query.isLoading || regenerate.isPending

  const runRegenerate = async () => {
    const fresh = await regenerate.run(ticket.id, { regenerate: true })
    if (fresh) {
      query.setData(fresh)
    }
  }

  // A sent draft is history: it must not be offered again, and the team's own reply is not a reason to redraft.
  const wasSent = Boolean(draft?.sent)
  const isReady = draft?.status === DRAFT_STATUSES.READY && !wasSent

  return (
    <section className="space-y-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-card" aria-busy={isDrafting}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Icon name="sparkles" className="size-4" />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">AI-drafted reply</h2>
            <p className="text-xs text-slate-500">
              {draft?.generatedAt ? `Drafted ${formatDateTime(draft.generatedAt)} · ` : ''}Never sent automatically
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon="refresh" onClick={runRegenerate} disabled={isDrafting}>
            {draft ? 'Regenerate' : 'Draft reply'}
          </Button>
          <Button icon="check" onClick={() => onUseDraft(draft)} disabled={!isReady || isDrafting}>
            Use draft
          </Button>
        </div>
      </div>

      {isDrafting && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-50/60 px-4 py-3 text-sm text-brand-800">
          <Spinner className="size-4" />
          Drafting a reply from BookLeaf policies and this author&apos;s records…
        </p>
      )}

      <InlineError error={regenerate.error ?? query.error} />

      {!isDrafting && !draft && !query.error && (
        <p className="text-sm text-slate-500">
          {authorIsWaiting ? 'No draft yet.' : 'The team has replied; a new draft will be prepared when the author responds.'}
        </p>
      )}

      {!isDrafting && draft && (
        <>
          {draft.stale && !wasSent && (
            <Callout tone="amber" icon="clock" title="This draft is out of date">
              <NoteList items={draft.staleReasons} />
            </Callout>
          )}
          {draft.notice && (
            <Callout tone="slate" icon="alert" title={draft.status === DRAFT_STATUSES.NO_POLICY ? 'No matching policy' : 'AI unavailable'}>
              <p>{draft.notice}</p>
            </Callout>
          )}
          {isReady && <DraftBody draft={draft} />}
          {wasSent && (
            <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Icon name="checkCircle" className="size-4" />
              Sent {draft.sent.edited ? 'with edits' : 'as drafted'} on {formatDateTime(draft.sent.at)}.
              {authorIsWaiting ? '' : ' A new draft will be prepared when the author responds.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default AiDraftPanel
