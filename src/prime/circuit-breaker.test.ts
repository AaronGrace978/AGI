import { describe, expect, it } from 'vitest';
import { CircuitBreaker, withRetryBudget } from './circuit-breaker';

describe('circuit breaker', () => {
  it('opens after threshold failures', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
      coolDownMs: 10_000,
      halfOpenMaxCalls: 1,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error('f1');
      }),
    ).rejects.toThrow('f1');

    await expect(
      breaker.execute(async () => {
        throw new Error('f2');
      }),
    ).rejects.toThrow('f2');

    await expect(
      breaker.execute(async () => 'nope'),
    ).rejects.toThrow('Circuit open');
  });

  it('retries with bounded attempts', async () => {
    let attempts = 0;
    const result = await withRetryBudget(
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('transient');
        return 'ok';
      },
      { maxAttempts: 3, initialDelayMs: 1, factor: 1 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });
});
