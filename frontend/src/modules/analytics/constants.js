export const RANGE_OPTIONS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

export const DEFAULT_RANGE_DAYS = 30

export const OPERATION_LABELS = {
  classification: 'Ticket triage',
  priority: 'Priority assessment',
  summary: 'Conversation summaries',
  draft: 'Reply drafts',
  embedding: 'Policy search (embeddings)',
}

// Plain-language versions of the API's failure codes.
export const FAILURE_LABELS = {
  not_configured: 'AI not configured',
  input_too_large: 'Ticket too long for the model',
  circuit_open: 'Paused after repeated provider failures',
  ticket_limit_reached: 'Per-ticket AI limit reached',
  budget_exhausted: 'Budget exhausted',
  throttled: 'Waited too long for a request slot',
  timeout: 'Provider timed out',
  rate_limited: 'Provider rate limit (429)',
  provider_unavailable: 'Provider unavailable (5xx)',
  provider_rejected: 'Provider rejected the request (key or model)',
  blocked: 'Blocked by provider safety filters',
  truncated: 'Answer cut off at the output limit',
  invalid_output: 'Answer did not match the expected format',
  unexpected: 'Unexpected error',
}

// Usage share at which a budget meter turns to warning, then critical.
export const BUDGET_WARNING_AT = 0.7
export const BUDGET_CRITICAL_AT = 0.9
