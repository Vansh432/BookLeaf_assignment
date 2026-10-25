import { useState } from 'react'
import { Link } from 'react-router'
import Icon from '../../../shared/components/ui/Icon.jsx'
import { ROLES } from '../../../shared/constants/app.js'
import { playNotificationSound } from '../../../shared/services/notificationSound.js'
import { useAuth } from '../../auth/index.js'
import useTicketChanges from '../hooks/useTicketChanges.js'

const TOAST_DURATION_MS = 6000
const MAX_TOASTS = 3

// What each viewer is told about someone else's change; anything not listed stays silent.
const MESSAGES = {
  [ROLES.AUTHOR]: {
    message: (number) => `BookLeaf replied on ${number}`,
    updated: (number) => `${number} was updated by the BookLeaf team`,
  },
  [ROLES.ADMIN]: {
    created: (number) => `New ticket ${number} in the queue`,
    message: (number) => `New author reply on ${number}`,
  },
}

const ticketPath = (role, ticketId) => (role === ROLES.ADMIN ? `/admin/tickets/${ticketId}` : `/tickets/${ticketId}`)

function TicketNotifications() {
  const { user } = useAuth()
  const [toasts, setToasts] = useState([])

  const dismiss = (toastId) => setToasts((current) => current.filter((toast) => toast.id !== toastId))

  useTicketChanges((event) => {
    const buildText = MESSAGES[user.role][event.action]
    if (event.actorId === user.id || !buildText) {
      return
    }

    const toast = { id: `${event.ticketId}-${Date.now()}`, ticketId: event.ticketId, text: buildText(event.ticketNumber) }
    setToasts((current) => [toast, ...current].slice(0, MAX_TOASTS))
    playNotificationSound()
    setTimeout(() => dismiss(toast.id), TOAST_DURATION_MS)
  })

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-3" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex animate-fade-in items-start gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-2xl ring-1 ring-white/10"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/20 text-brand-300">
            <Icon name="message" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{toast.text}</p>
            <Link
              to={ticketPath(user.role, toast.ticketId)}
              onClick={() => dismiss(toast.id)}
              className="mt-1 inline-block text-xs font-semibold text-brand-300 hover:text-brand-200"
            >
              View ticket →
            </Link>
          </div>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="text-white/50 hover:text-white"
            aria-label="Dismiss notification"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export default TicketNotifications
