import { describe, it, expect } from 'vitest';
import { createCorrelationId, createRuntimeSignal, appendRuntimeSignal, type RuntimeSignal } from './observability';

describe('observability', () => {
  it('createCorrelationId generates unique ids with prefix', () => {
    const a = createCorrelationId('test');
    const b = createCorrelationId('test');
    expect(a).toMatch(/^test_/);
    expect(b).toMatch(/^test_/);
    expect(a).not.toBe(b);
  });

  it('createRuntimeSignal builds a well-formed signal', () => {
    const signal = createRuntimeSignal({
      source: 'kernel',
      code: 'test.code',
      severity: 'warn',
      message: 'test warning',
    });
    expect(signal.id).toMatch(/^rt_/);
    expect(signal.source).toBe('kernel');
    expect(signal.severity).toBe('warn');
    expect(typeof signal.timestamp).toBe('number');
  });

  it('appendRuntimeSignal caps at maxEntries', () => {
    const signals: RuntimeSignal[] = [];
    let result = signals;
    for (let i = 0; i < 10; i++) {
      result = appendRuntimeSignal(
        result,
        createRuntimeSignal({
          source: 'renderer',
          code: `test.${i}`,
          severity: 'info',
          message: `msg ${i}`,
        }),
        5,
      );
    }
    expect(result.length).toBe(5);
    expect(result[0].code).toBe('test.5');
    expect(result[4].code).toBe('test.9');
  });
});
