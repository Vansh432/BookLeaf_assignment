import { ROLES } from '../../../shared/constants/app.js'
import { formatDayLabel, getInitials } from '../../../shared/utils/format.js'

const TEAM_LABEL = 'BookLeaf Support'

const timeFormatter = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })

function DaySeparator({ label }) {
  return (
    <li className="flex items-center gap-3 py-1" aria-hidden="true">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase ring-1 ring-slate-200">
        {label}
      </span>
      <span className="h-px flex-1 bg-slate-200" />
    </li>
  )
}

function MessageBubble({ message, isOwn }) {
  return (
    <li className={`flex animate-fade-in gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold shadow-sm ${
          message.isTeam ? 'bg-linear-to-br from-brand-500 to-brand-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'
        }`}
        aria-hidden="true"
      >
        {getInitials(message.name)}
      </span>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{message.name}</span>
          <span>·</span>
          <span>{message.roleLabel}</span>
          <span>·</span>
          <time dateTime={message.createdAt}>{timeFormatter.format(new Date(message.createdAt))}</time>
        </p>
        <div
          className={`mt-1.5 rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
            isOwn
              ? 'rounded-tr-md bg-linear-to-br from-brand-600 to-brand-700 text-white'
              : 'rounded-tl-md bg-white text-slate-800 ring-1 ring-slate-200/80'
          }`}
        >
          {message.isOriginal && (
            <span
              className={`mb-1.5 block text-[11px] font-bold tracking-wide uppercase ${isOwn ? 'text-brand-100' : 'text-brand-600'}`}
            >
              Original query
            </span>
          )}
          {message.body}
        </div>
      </div>
    </li>
  )
}

// The original query renders as the author's first message, so the exchange reads as one thread.
const toThreadMessages = (ticket, authorName) => [
  {
    id: 'original',
    name: authorName,
    roleLabel: 'Author',
    body: ticket.description,
    createdAt: ticket.createdAt,
    isTeam: false,
    isOriginal: true,
  },
  ...ticket.messages.map((message) => {
    const isTeam = message.senderRole === ROLES.ADMIN
    return {
      id: message.id,
      name: message.sender?.name ?? (isTeam ? TEAM_LABEL : authorName),
      roleLabel: isTeam ? TEAM_LABEL : 'Author',
      body: message.body,
      createdAt: message.createdAt,
      isTeam,
    }
  }),
]

function ConversationThread({ ticket, viewerRole, authorName }) {
  const viewerIsTeam = viewerRole === ROLES.ADMIN
  const messages = toThreadMessages(ticket, authorName)

  return (
    <ol className="space-y-5">
      {messages.flatMap((message, index) => {
        const day = formatDayLabel(message.createdAt)
        const startsNewDay = index === 0 || day !== formatDayLabel(messages[index - 1].createdAt)
        return [
          ...(startsNewDay ? [<DaySeparator key={`day-${message.id}`} label={day} />] : []),
          <MessageBubble key={message.id} message={message} isOwn={message.isTeam === viewerIsTeam} />,
        ]
      })}
    </ol>
  )
}

export default ConversationThread
