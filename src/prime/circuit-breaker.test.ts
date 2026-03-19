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

  it('resets after a successful call', async () => {
    const breaker = new CircuitBreaker('reset-test', {
      failureThreshold: 2,
      coolDownMs: 100,
      halfOpenMaxCalls: 1,
    });

    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    const ok = await breaker.execute(async () => 'recovered');
    expect(ok).toBe('recovered');
    expect(breaker.snapshot.failures).toBe(0);
    expect(breaker.snapshot.openedAt).toBeNull();
  });

  it('emits events for success and failure', async () => {
    const events: string[] = [];
    const breaker = new CircuitBreaker('event-test', { failureThreshold: 2 });

    await breaker.execute(async () => 'ok', (e) => events.push(e.kind));
    await expect(
      breaker.execute(async () => { throw new Error('x'); }, (e) => events.push(e.kind)),
    ).rejects.toThrow();

    expect(events).toContain('success');
    expect(events).toContain('failure');
  });

  it('exhausts retry budget and throws last error', async () => {
    await expect(
      withRetryBudget(
        async () => { throw new Error('persistent'); },
        { maxAttempts: 3, initialDelayMs: 1, factor: 1 },
      ),
    ).rejects.toThrow('persistent');
  });

  it('handles concurrent circuit breaker calls safely', async () => {
    const breaker = new CircuitBreaker('concurrent', { failureThreshold: 10 });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        breaker.execute(async () => `result_${i}`),
      ),
    );
    expect(results).toHaveLength(8);
    expect(new Set(results).size).toBe(8);
    expect(breaker.snapshot.failures).toBe(0);
  });
});
