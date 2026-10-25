import { useState } from 'react'
import { formatUsd } from '../utils/format.js'

const DAY_MS = 24 * 60 * 60 * 1000

const dayLabel = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// Rounds the axis maximum up to a clean 1/2/5 step, so tick labels are whole, readable numbers.
const niceMax = (value) => {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)))
  return [1, 2, 5, 10].map((step) => step * magnitude).find((candidate) => candidate >= value)
}

// Every UTC day in the window, including days without calls, so gaps read as zero rather than vanishing.
const fillDays = (daily, from, to) => {
  const byDate = new Map(daily.map((day) => [day.date, day]))
  const start = new Date(from)
  const days = []
  for (let time = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()); time < new Date(to).getTime(); time += DAY_MS) {
    const date = new Date(time).toISOString().slice(0, 10)
    days.push(byDate.get(date) ?? { date, calls: 0, failed: 0, rejected: 0, estimatedCostUsd: 0 })
  }
  return days
}

// Centred on its bar, except near the edges, where it aligns to the bar's side so it never leaves the card.
const tooltipPosition = (index, count) => {
  const center = ((index + 0.5) / count) * 100
  if (center < 20) {
    return { left: `${(index / count) * 100}%` }
  }
  if (center > 80) {
    return { right: `${((count - index - 1) / count) * 100}%` }
  }
  return { left: `${center}%`, transform: 'translateX(-50%)' }
}

function Tooltip({ day, index, count }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute -top-2 z-10 w-44 -translate-y-full rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-xl"
      style={tooltipPosition(index, count)}
    >
      <p className="text-sm font-bold">{day.calls} AI calls</p>
      <p className="text-slate-300">{dayLabel.format(new Date(day.date))}</p>
      <div className="mt-1.5 space-y-0.5 text-slate-300">
        <p>
          <span className="font-semibold text-white">{day.failed}</span> failed ·{' '}
          <span className="font-semibold text-white">{day.rejected}</span> refused
        </p>
        <p>
          <span className="font-semibold text-white">{formatUsd(day.estimatedCostUsd)}</span> estimated
        </p>
      </div>
    </div>
  )
}

// Single series (AI calls per day), so the title names it and there is no legend. Each day's full-height
// column is its hover/focus target; the data table below is the non-visual equivalent.
function DailyCallsChart({ daily, from, to }) {
  const [activeIndex, setActiveIndex] = useState(null)
  const days = fillDays(daily, from, to)
  const top = niceMax(Math.max(...days.map((day) => day.calls)))
  const ticks = [top, top / 2, 0]
  const labelIndexes = new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])

  return (
    <div>
      {/* Headroom for the tooltip, so it never covers the card's title. */}
      <div className="flex gap-3 pt-20">
        <div className="flex h-48 flex-col justify-between py-0 text-right text-[11px] text-slate-400" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {tick}
            </span>
          ))}
        </div>

        <div className="relative h-48 flex-1" onMouseLeave={() => setActiveIndex(null)}>
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 border-t border-slate-200"
              style={{ bottom: `${(tick / top) * 100}%` }}
              aria-hidden="true"
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {days.map((day, index) => (
              <button
                key={day.date}
                type="button"
                className="flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                aria-label={`${dayLabel.format(new Date(day.date))}: ${day.calls} AI calls, ${day.failed} failed, ${formatUsd(day.estimatedCostUsd)} estimated`}
              >
                {day.calls > 0 && (
                  <span
                    className={`block w-full max-w-6 rounded-t-[4px] transition-colors ${
                      activeIndex === index ? 'bg-brand-700' : 'bg-brand-500'
                    }`}
                    style={{ height: `${(day.calls / top) * 100}%` }}
                  />
                )}
              </button>
            ))}
          </div>

          {activeIndex !== null && <Tooltip day={days[activeIndex]} index={activeIndex} count={days.length} />}
        </div>
      </div>

      <div className="mt-2 ml-9 flex justify-between text-[11px] text-slate-400" aria-hidden="true">
        {days
          .map((day, index) => ({ day, index }))
          .filter(({ index }) => labelIndexes.has(index))
          .map(({ day }) => (
            <span key={day.date}>{dayLabel.format(new Date(day.date))}</span>
          ))}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-brand-700">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white text-slate-500">
              <tr>
                <th className="py-1.5">Date (UTC)</th>
                <th className="py-1.5 text-right">Calls</th>
                <th className="py-1.5 text-right">Failed</th>
                <th className="py-1.5 text-right">Refused</th>
                <th className="py-1.5 text-right">Estimated cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {days
                .filter((day) => day.calls > 0)
                .map((day) => (
                  <tr key={day.date}>
                    <td className="py-1.5">{dayLabel.format(new Date(day.date))}</td>
                    <td className="py-1.5 text-right">{day.calls}</td>
                    <td className="py-1.5 text-right">{day.failed}</td>
                    <td className="py-1.5 text-right">{day.rejected}</td>
                    <td className="py-1.5 text-right">{formatUsd(day.estimatedCostUsd)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

export default DailyCallsChart
