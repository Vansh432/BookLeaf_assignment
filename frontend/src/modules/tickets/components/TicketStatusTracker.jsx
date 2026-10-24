import Icon from '../../../shared/components/ui/Icon.jsx'
import { TICKET_STATUSES } from '../constants.js'

const STEP_LABELS = {
  Open: 'Received',
  'In Progress': 'In progress',
  Resolved: 'Resolved',
  Closed: 'Closed',
}

function TicketStatusTracker({ status }) {
  const currentIndex = TICKET_STATUSES.indexOf(status)

  return (
    <ol className="flex items-start" aria-label="Ticket progress">
      {TICKET_STATUSES.map((step, index) => {
        const isDone = index < currentIndex
        const isCurrent = index === currentIndex
        const isLast = index === TICKET_STATUSES.length - 1

        return (
          <li key={step} className={`flex items-start ${isLast ? '' : 'flex-1'}`} aria-current={isCurrent ? 'step' : undefined}>
            <div className="flex w-16 flex-col items-center gap-1.5 sm:w-20">
              <span
                className={`grid size-8 place-items-center rounded-full text-xs font-bold ring-4 transition ${
                  isDone
                    ? 'bg-brand-600 text-white ring-brand-100'
                    : isCurrent
                      ? 'bg-white text-brand-700 shadow-sm ring-brand-200 outline-2 outline-brand-600'
                      : 'bg-slate-100 text-slate-400 ring-white'
                }`}
              >
                {isDone ? <Icon name="check" className="size-4" strokeWidth={3} /> : index + 1}
              </span>
              <span className={`text-center text-xs font-semibold ${isDone || isCurrent ? 'text-slate-800' : 'text-slate-400'}`}>
                {STEP_LABELS[step]}
              </span>
            </div>
            {!isLast && (
              <span className={`mt-4 h-0.5 flex-1 rounded-full ${index < currentIndex ? 'bg-brand-500' : 'bg-slate-200'}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default TicketStatusTracker
