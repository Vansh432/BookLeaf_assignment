const EMPTY_VALUE = '—'

// AI calls cost fractions of a cent, so small amounts keep two significant digits instead of rounding to $0.00.
export const formatUsd = (value) => {
  if (value === null || value === undefined) {
    return EMPTY_VALUE
  }
  if (value === 0) {
    return '$0'
  }
  return value < 0.01 ? `$${Number(value.toPrecision(2))}` : `$${value.toFixed(2)}`
}

export const formatPercent = (ratio) =>
  ratio === null || ratio === undefined ? EMPTY_VALUE : `${Math.round(ratio * 1000) / 10}%`

export const formatMs = (ms) => {
  if (ms === null || ms === undefined) {
    return EMPTY_VALUE
  }
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`
}

export const formatCompact = (value) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0)
