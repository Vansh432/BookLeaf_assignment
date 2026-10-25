const STATES = Object.freeze({ CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half-open' });

// Stops calling a failing provider for a cool-down period, then lets a single probe call through:
// success closes the circuit, failure re-opens it. State is per process, which is enough to shed load
// from one instance; it is not shared across instances.
export class CircuitBreaker {
  constructor({ failureThreshold, cooldownMs, now = Date.now }) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.reset();
  }

  reset() {
    this.state = STATES.CLOSED;
    this.consecutiveFailures = 0;
    this.openedAt = 0;
    this.probeInFlight = false;
  }

  // Returns false when the call must be skipped.
  tryAcquire() {
    if (this.state === STATES.OPEN && this.now() - this.openedAt >= this.cooldownMs) {
      this.state = STATES.HALF_OPEN;
    }

    if (this.state === STATES.CLOSED) {
      return true;
    }

    if (this.state === STATES.HALF_OPEN && !this.probeInFlight) {
      this.probeInFlight = true;
      return true;
    }

    return false;
  }

  recordSuccess() {
    this.reset();
  }

  recordFailure() {
    this.consecutiveFailures += 1;

    if (this.state === STATES.HALF_OPEN || this.consecutiveFailures >= this.failureThreshold) {
      this.state = STATES.OPEN;
      this.openedAt = this.now();
      this.probeInFlight = false;
    }
  }

  // A call that ended without telling us anything about provider health (e.g. invalid output)
  // must still free the probe slot.
  recordNeutral() {
    if (this.state === STATES.HALF_OPEN) {
      this.probeInFlight = false;
    }
  }

  get status() {
    return { state: this.state, consecutiveFailures: this.consecutiveFailures };
  }
}

export const geminiCircuit = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30 * 1000 });
