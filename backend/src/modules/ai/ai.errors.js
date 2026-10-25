export const AI_ERROR_CODES = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  INPUT_TOO_LARGE: 'input_too_large',
  CIRCUIT_OPEN: 'circuit_open',
  TICKET_LIMIT_REACHED: 'ticket_limit_reached',
  BUDGET_EXHAUSTED: 'budget_exhausted',
  THROTTLED: 'throttled',
  TIMEOUT: 'timeout',
  RATE_LIMITED: 'rate_limited',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  PROVIDER_REJECTED: 'provider_rejected',
  BLOCKED: 'blocked',
  TRUNCATED: 'truncated',
  INVALID_OUTPUT: 'invalid_output',
  UNEXPECTED: 'unexpected',
});

// Local guards that stop a call before the provider is contacted.
export const REJECTION_CODES = new Set([
  AI_ERROR_CODES.NOT_CONFIGURED,
  AI_ERROR_CODES.INPUT_TOO_LARGE,
  AI_ERROR_CODES.CIRCUIT_OPEN,
  AI_ERROR_CODES.TICKET_LIMIT_REACHED,
  AI_ERROR_CODES.BUDGET_EXHAUSTED,
  AI_ERROR_CODES.THROTTLED,
]);

// Signs the provider itself is unhealthy or misconfigured; these trip the circuit breaker.
export const PROVIDER_FAILURE_CODES = new Set([
  AI_ERROR_CODES.TIMEOUT,
  AI_ERROR_CODES.RATE_LIMITED,
  AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
  AI_ERROR_CODES.PROVIDER_REJECTED,
]);

// Every AI failure surfaces as this type. Callers fall back to rules or manual work on any AiError,
// and the code is safe to log and store (it never carries prompt content or provider secrets).
export class AiError extends Error {
  constructor(code, message, { retryable = false, retryAfterMs = 0, cause } = {}) {
    super(message, { cause });
    this.name = 'AiError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}
