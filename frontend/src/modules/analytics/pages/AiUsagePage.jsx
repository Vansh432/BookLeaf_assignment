import { useSearchParams } from 'react-router'
import EmptyState from '../../../shared/components/feedback/EmptyState.jsx'
import ErrorState from '../../../shared/components/feedback/ErrorState.jsx'
import PageLoader from '../../../shared/components/feedback/PageLoader.jsx'
import Icon from '../../../shared/components/ui/Icon.jsx'
import useApiQuery from '../../../shared/hooks/useApiQuery.js'
import { formatNumber } from '../../../shared/utils/format.js'
import BudgetMeter from '../components/BudgetMeter.jsx'
import DailyCallsChart from '../components/DailyCallsChart.jsx'
import OperationsTable from '../components/OperationsTable.jsx'
import { DEFAULT_RANGE_DAYS, FAILURE_LABELS, RANGE_OPTIONS } from '../constants.js'
import { getAiUsage } from '../services/aiUsage.service.js'
import { formatPercent, formatUsd } from '../utils/format.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Local calendar dates (YYYY-MM-DD); the API treats "to" as inclusive.
const toDateParam = (date) => date.toLocaleDateString('en-CA')

const CIRCUIT_STATES = {
  closed: { label: 'Healthy', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: 'checkCircle' },
  'half-open': { label: 'Recovering: testing the provider', tone: 'bg-amber-50 text-amber-800 ring-amber-200', icon: 'clock' },
  open: { label: 'Paused after repeated failures', tone: 'bg-red-50 text-red-700 ring-red-200', icon: 'alert' },
}

function Card({ title, description, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card ${className}`}>
      <h2 className="font-bold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function Metric({ label, value, detail }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-right">
        <span className="font-semibold text-slate-900">{value}</span>
        {detail && <span className="ml-1.5 text-xs text-slate-400">{detail}</span>}
      </dd>
    </div>
  )
}

function StatusStrip({ config, circuit }) {
  const state = config.aiEnabled ? CIRCUIT_STATES[circuit.state] : null
  const limits = Object.entries(config.requestsPerMinute)

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-slate-200/70 bg-white px-5 py-4 text-sm shadow-card">
      {state ? (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${state.tone}`} role="status">
          <Icon name={state.icon} className="size-3.5" />
          AI {state.label}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200" role="status">
          <Icon name="alert" className="size-3.5" />
          AI disabled: no API key, so rules and manual replies are used
        </span>
      )}
      <span className="text-slate-500">
        Triage <span className="font-mono text-xs text-slate-800">{config.generationModel}</span>
      </span>
      <span className="text-slate-500">
        Drafts <span className="font-mono text-xs text-slate-800">{config.draftModel}</span>
      </span>
      <span className="text-slate-500">
        Search <span className="font-mono text-xs text-slate-800">{config.embeddingModel}</span>
      </span>
      <span className="text-slate-500">
        Request limit{' '}
        <span className="font-semibold text-slate-800">
          {limits.length ? limits.map(([model, limit]) => `${limit}/min (${model})`).join(', ') : 'none'}
        </span>
      </span>
      <span className="text-slate-500">
        Per-ticket cap <span className="font-semibold text-slate-800">{config.maxCallsPerTicket} AI calls</span>
      </span>
    </div>
  )
}

function TriageQuality({ triage }) {
  if (!triage.classified) {
    return <p className="text-sm text-slate-500">No tickets were triaged in this period.</p>
  }

  const share = (count) => formatPercent(count / triage.classified)
  return (
    <dl className="divide-y divide-slate-100">
      <Metric label="Tickets triaged" value={formatNumber(triage.classified)} />
      <Metric label="Decided by rules (no AI cost)" value={formatNumber(triage.decidedByRules)} detail={share(triage.decidedByRules)} />
      <Metric label="Decided with AI" value={formatNumber(triage.decidedByAi)} detail={share(triage.decidedByAi)} />
      <Metric label="AI unavailable, rules fallback" value={formatNumber(triage.aiFallbacks)} detail={formatPercent(triage.aiFallbackRate)} />
      <Metric label="Category corrected by an admin" value={formatNumber(triage.categoryOverridden)} detail={formatPercent(triage.categoryOverrideRate)} />
      <Metric label="Priority corrected by an admin" value={formatNumber(triage.priorityOverridden)} detail={formatPercent(triage.priorityOverrideRate)} />
      <Metric label="Flagged for review" value={formatNumber(triage.flaggedForReview)} detail={share(triage.flaggedForReview)} />
      <Metric label="Still awaiting review" value={formatNumber(triage.awaitingReview)} />
    </dl>
  )
}

function DraftQuality({ drafts }) {
  if (!drafts.drafts) {
    return <p className="text-sm text-slate-500">No replies were drafted in this period.</p>
  }

  return (
    <dl className="divide-y divide-slate-100">
      <Metric label="Drafts requested" value={formatNumber(drafts.drafts)} />
      <Metric label="Drafts written" value={formatNumber(drafts.ready)} />
      <Metric label="Sent to the author" value={formatNumber(drafts.sent)} detail={`${formatPercent(drafts.adoptionRate)} of written`} />
      <Metric label="Sent unchanged" value={formatNumber(drafts.sentAsDrafted)} />
      <Metric label="Edited before sending" value={formatNumber(drafts.sentWithEdits)} detail={formatPercent(drafts.editRate)} />
      <Metric
        label="Flagged figures to verify"
        value={formatNumber(drafts.withWarnings)}
        detail={`${formatPercent(drafts.unsupportedClaimRate)} of written`}
      />
      <Metric label="No matching policy (manual reply)" value={formatNumber(drafts.noPolicy)} detail={formatPercent(drafts.noPolicyRate)} />
      <Metric label="AI unavailable (manual reply)" value={formatNumber(drafts.unavailable)} />
    </dl>
  )
}

function FailureReasons({ reasons }) {
  if (!reasons.length) {
    return <p className="flex items-center gap-2 text-sm text-emerald-700"><Icon name="checkCircle" className="size-4" />No failed or refused AI calls in this period.</p>
  }

  return (
    <ul className="divide-y divide-slate-100">
      {reasons.map(({ reason, count }) => (
        <li key={reason} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="text-slate-700">
            {FAILURE_LABELS[reason] ?? reason}
            <span className="ml-2 font-mono text-xs text-slate-400">{reason}</span>
          </span>
          <span className="font-semibold text-slate-900">{formatNumber(count)}</span>
        </li>
      ))}
    </ul>
  )
}

function AiUsagePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const days = Number(searchParams.get('days')) || DEFAULT_RANGE_DAYS
  const includeEvaluation = searchParams.get('eval') === '1'

  const today = new Date()
  const params = {
    from: toDateParam(new Date(today.getTime() - (days - 1) * DAY_MS)),
    to: toDateParam(today),
    includeEvaluation,
  }
  const { data: usage, error, isLoading, reload } = useApiQuery(() => getAiUsage(params), `ai-usage:${days}:${includeEvaluation}`)

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    setSearchParams(next)
  }

  const failedCalls = usage?.operations.reduce((sum, operation) => sum + operation.failed, 0) ?? 0
  const refusedCalls = usage?.operations.reduce((sum, operation) => sum + operation.rejected, 0) ?? 0

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">AI Usage</h1>
          <p className="mt-1 text-sm text-slate-500">
            Spend, reliability and quality of AI triage and drafted replies. Costs are estimates from configured model prices, not invoices.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-white p-1 ring-1 ring-slate-200" role="group" aria-label="Time range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                aria-pressed={days === option.days}
                onClick={() => setParam('days', option.days === DEFAULT_RANGE_DAYS ? '' : String(option.days))}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  days === option.days ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeEvaluation}
              onChange={(event) => setParam('eval', event.target.checked ? '1' : '')}
              className="size-4 rounded border-slate-300 accent-brand-600"
            />
            Include evaluation runs
          </label>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Icon name="refresh" className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {!usage && isLoading && <PageLoader fullScreen={false} />}
      {!usage && error && <ErrorState message={error.message} onRetry={reload} />}

      {usage && (
        <div className={`space-y-6 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
          <StatusStrip config={usage.config} circuit={usage.circuit} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="AI calls" value={formatNumber(usage.totals.calls)} hint={`Last ${days} days`} />
            <StatTile label="Estimated spend" value={formatUsd(usage.totals.estimatedCostUsd)} hint="At configured model prices" />
            <StatTile label="Spend per ticket" value={formatUsd(usage.totals.estimatedCostPerTicketUsd)} hint={`${formatNumber(usage.totals.ticketsWithAiCalls)} tickets used AI`} />
            <StatTile
              label="Failed calls"
              value={formatPercent(usage.totals.calls ? failedCalls / usage.totals.calls : null)}
              hint={`${formatNumber(failedCalls)} failed at the provider`}
            />
            <StatTile
              label="Refused calls"
              value={formatPercent(usage.totals.calls ? refusedCalls / usage.totals.calls : null)}
              hint="Budget, limits or AI paused"
            />
          </div>

          {usage.totals.calls === 0 ? (
            <EmptyState icon="sparkles" title="No AI calls in this period" description="Triage, summaries and drafts will appear here once tickets are raised and opened." />
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Card title="AI calls per day" description="Hover or focus a day for failures and cost. Days are UTC.">
                  <DailyCallsChart daily={usage.daily} from={usage.window.from} to={usage.window.to} />
                </Card>
                <Card title="Budget" description="Hard caps: once reached, AI calls are refused and manual fallbacks are used.">
                  <div className="space-y-5">
                    {usage.budgets.map((budget) => (
                      <BudgetMeter key={budget.period} budget={budget} />
                    ))}
                  </div>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Triage quality" description="Admin corrections are the real-world measure of triage accuracy.">
                  <TriageQuality triage={usage.triage} />
                </Card>
                <Card title="Draft quality" description="Based on each ticket's latest draft in this period.">
                  <DraftQuality drafts={usage.drafts} />
                </Card>
              </div>

              <Card title="By operation" description="Every AI call, retries included, grouped by what it was for.">
                <OperationsTable operations={usage.operations} />
              </Card>

              <Card title="Failures and refusals" description="Why AI calls did not produce a result. Each one fell back to rules or a manual reply.">
                <FailureReasons reasons={usage.failureReasons} />
              </Card>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default AiUsagePage
