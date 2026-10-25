import { formatNumber } from '../../../shared/utils/format.js'
import { OPERATION_LABELS } from '../constants.js'
import { formatCompact, formatMs, formatPercent, formatUsd } from '../utils/format.js'

const HEADERS = [
  { label: 'Operation', align: 'left' },
  { label: 'Calls', title: 'Logical calls, retries included in one call' },
  { label: 'Succeeded' },
  { label: 'Failed', title: 'Reached the provider and failed' },
  { label: 'Refused', title: 'Stopped before the provider: budget, limits, paused, not configured' },
  { label: 'Retried', title: 'Calls that needed more than one attempt' },
  { label: 'Tokens in / out' },
  { label: 'Est. cost' },
  { label: 'Est. cost / success' },
  { label: 'Latency p50 / p95', title: 'Provider time only' },
  { label: 'Queue p95', title: 'Time waiting for a request slot under the per-minute limit' },
]

function OperationsTable({ operations }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="border-b border-slate-100 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          <tr>
            {HEADERS.map((header) => (
              <th key={header.label} title={header.title} className={`px-3 py-2.5 ${header.align === 'left' ? 'text-left' : 'text-right'}`}>
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {operations.map((operation) => (
            <tr key={`${operation.operation}-${operation.model}`}>
              <td className="px-3 py-3">
                <p className="font-semibold text-slate-900">{OPERATION_LABELS[operation.operation] ?? operation.operation}</p>
                <p className="font-mono text-xs text-slate-500">{operation.model}</p>
              </td>
              <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatNumber(operation.calls)}</td>
              <td className="px-3 py-3 text-right">{formatNumber(operation.success)}</td>
              <td className="px-3 py-3 text-right">
                {formatNumber(operation.failed)}
                <span className="block text-xs text-slate-400">{formatPercent(operation.errorRate)}</span>
              </td>
              <td className="px-3 py-3 text-right">
                {formatNumber(operation.rejected)}
                <span className="block text-xs text-slate-400">{formatPercent(operation.rejectionRate)}</span>
              </td>
              <td className="px-3 py-3 text-right">{formatNumber(operation.retriedCalls)}</td>
              <td className="px-3 py-3 text-right">
                {formatCompact(operation.inputTokens)} / {formatCompact(operation.outputTokens)}
              </td>
              <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatUsd(operation.estimatedCostUsd)}</td>
              <td className="px-3 py-3 text-right">{formatUsd(operation.estimatedCostPerSuccessUsd)}</td>
              <td className="px-3 py-3 text-right">
                {formatMs(operation.latencyMs.p50)} / {formatMs(operation.latencyMs.p95)}
              </td>
              <td className="px-3 py-3 text-right">{formatMs(operation.queueWaitMs.p95)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default OperationsTable
