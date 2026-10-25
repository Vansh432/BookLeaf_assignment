import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CircuitBreaker } from '../../../modules/ai/ai.circuitBreaker.js';

const createBreaker = () => {
  const clock = { now: 0 };
  const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: () => clock.now });
  return { breaker, clock };
};

const fail = (breaker, times) => {
  for (let i = 0; i < times; i += 1) {
    assert.equal(breaker.tryAcquire(), true);
    breaker.recordFailure();
  }
};

describe('CircuitBreaker', () => {
  it('stays closed below the failure threshold and resets on success', () => {
    const { breaker } = createBreaker();
    fail(breaker, 2);
    breaker.recordSuccess();
    fail(breaker, 2);
    assert.equal(breaker.tryAcquire(), true);
    assert.equal(breaker.status.state, 'closed');
  });

  it('opens after consecutive failures and rejects calls during the cool-down', () => {
    const { breaker, clock } = createBreaker();
    fail(breaker, 3);
    assert.equal(breaker.status.state, 'open');
    clock.now = 999;
    assert.equal(breaker.tryAcquire(), false);
  });

  it('allows exactly one probe after the cool-down', () => {
    const { breaker, clock } = createBreaker();
    fail(breaker, 3);
    clock.now = 1000;
    assert.equal(breaker.tryAcquire(), true);
    assert.equal(breaker.tryAcquire(), false);
  });

  it('closes when the probe succeeds and re-opens when it fails', () => {
    const { breaker, clock } = createBreaker();
    fail(breaker, 3);
    clock.now = 1000;
    breaker.tryAcquire();
    breaker.recordSuccess();
    assert.equal(breaker.status.state, 'closed');

    fail(breaker, 3);
    clock.now = 2000;
    breaker.tryAcquire();
    breaker.recordFailure();
    assert.equal(breaker.status.state, 'open');
    assert.equal(breaker.tryAcquire(), false);
  });

  it('frees the probe slot when the probe ends without a health signal', () => {
    const { breaker, clock } = createBreaker();
    fail(breaker, 3);
    clock.now = 1000;
    breaker.tryAcquire();
    breaker.recordNeutral();
    assert.equal(breaker.tryAcquire(), true);
  });
});
