import Icon from '../../../shared/components/ui/Icon.jsx'
import { BUDGET_CRITICAL_AT, BUDGET_WARNING_AT } from '../constants.js'
import { formatUsd } from '../utils/format.js'

// The fill carries severity; the track is a lighter step of the same hue, so state reads across the whole bar.
// Warning and critical states also carry an icon and a label, never colour alone.
const TONES = {
  ok: { fill: 'bg-brand-500', track: 'bg-brand-100' },
  warning: { fill: 'bg-amber-500', track: 'bg-amber-100', icon: 'alert', label: 'Close to the limit', text: 'text-amber-800' },
  critical: {
    fill: 'bg-red-600',
    track: 'bg-red-100',
    icon: 'alert',
    label: 'Limit reached: new AI calls fall back to rules and manual replies',
    text: 'text-red-700',
  },
}

const periodLabel = (period) => (period.startsWith('day:') ? 'Today (UTC)' : 'This month (UTC)')

function BudgetMeter({ budget }) {
  const used = budget.spentUsd + budget.reservedUsd
  const share = budget.limitUsd > 0 ? used / budget.limitUsd : 1
  const tone = share >= BUDGET_CRITICAL_AT ? TONES.critical : share >= BUDGET_WARNING_AT ? TONES.warning : TONES.ok

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-slate-800">{periodLabel(budget.period)}</span>
        <span className="text-slate-600">
          <span className="font-semibold text-slate-900">{formatUsd(budget.spentUsd)}</span> of {formatUsd(budget.limitUsd)}
        </span>
      </div>
      <div
        className={`h-2.5 overflow-hidden rounded-full ${tone.track}`}
        role="meter"
        aria-label={`${periodLabel(budget.period)} AI budget used`}
        aria-valuemin={0}
        aria-valuemax={budget.limitUsd}
        aria-valuenow={used}
      >
        <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${Math.min(share, 1) * 100}%` }} />
      </div>
      <p className="text-xs text-slate-500">
        {Math.round(share * 1000) / 10}% used
        {budget.reservedUsd > 0 && ` · ${formatUsd(budget.reservedUsd)} reserved by calls in progress`}
      </p>
      {tone.label && (
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${tone.text}`}>
          <Icon name={tone.icon} className="size-3.5" />
          {tone.label}
        </p>
      )}
    </div>
  )
}

export default BudgetMeter
