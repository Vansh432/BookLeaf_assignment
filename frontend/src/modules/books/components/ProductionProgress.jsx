import Icon from '../../../shared/components/ui/Icon.jsx'
import { getStageLabel, PRODUCTION_STAGES } from '../constants.js'

function ProductionProgress({ status }) {
  const currentStage = getStageLabel(status)
  const currentIndex = PRODUCTION_STAGES.indexOf(currentStage)
  const stepNumber = currentIndex + 1

  return (
    <div className="rounded-xl bg-amber-50/60 p-4 ring-1 ring-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Icon name="clock" className="size-4" />
          Stage {stepNumber} of {PRODUCTION_STAGES.length}: {currentStage}
        </p>
        <p className="text-xs text-amber-800/70">Sales and royalties appear once your book is live.</p>
      </div>

      <ol className="mt-4 flex gap-1.5" aria-label="Production progress">
        {PRODUCTION_STAGES.map((stage, index) => (
          <li
            key={stage}
            title={stage}
            className={`h-2 flex-1 rounded-full ${
              index < currentIndex ? 'bg-brand-500' : index === currentIndex ? 'animate-pulse bg-amber-400' : 'bg-slate-200'
            }`}
          >
            <span className="sr-only">
              {stage}: {index < currentIndex ? 'complete' : index === currentIndex ? 'in progress' : 'upcoming'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default ProductionProgress
