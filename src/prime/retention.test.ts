// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Data Retention / Lifecycle Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  trimByAge,
  trimByCount,
  applyEthicalMemoryRetention,
  applyVectorRetention,
  estimateDataFootprint,
  runRetentionSweep,
  DEFAULT_RETENTION_POLICY,
} from './retention';

describe('trimByAge', () => {
  it('keeps entries newer than cutoff', () => {
    const now = Date.now();
    const entries = [
      { timestamp: now - 86_400_000 * 5 },  // 5 days old
      { timestamp: now - 86_400_000 * 15 }, // 15 days old
      { timestamp: now - 86_400_000 * 35 }, // 35 days old
    ];
    const result = trimByAge(entries, 30, now);
    expect(result.kept).toHaveLength(2);
    expect(result.removed).toBe(1);
  });

  it('keeps all entries if none are expired', () => {
    const now = Date.now();
    const entries = [{ timestamp: now - 1000 }, { timestamp: now }];
    const result = trimByAge(entries, 1, now);
    expect(result.kept).toHaveLength(2);
    expect(result.removed).toBe(0);
  });
});

describe('trimByCount', () => {
  it('trims to max count keeping most recent', () => {
    const entries = [1, 2, 3, 4, 5];
    const result = trimByCount(entries, 3);
    expect(result.kept).toEqual([3, 4, 5]);
    expect(result.removed).toBe(2);
  });

  it('does not trim when under limit', () => {
    const entries = [1, 2];
    const result = trimByCount(entries, 10);
    expect(result.kept).toEqual([1, 2]);
    expect(result.removed).toBe(0);
  });
});

describe('applyEthicalMemoryRetention', () => {
  it('trims ethical memory to configured max', () => {
    const entries = Array.from({ length: 300 }, (_, i) => ({ timestamp: Date.now() - i * 1000 }));
    const policy = { ...DEFAULT_RETENTION_POLICY, ethicalMemoryMaxEntries: 100 };
    const result = applyEthicalMemoryRetention(entries, policy);
    expect(result.kept.length).toBeLessThanOrEqual(100);
    expect(result.removed).toBe(200);
  });
});

describe('applyVectorRetention', () => {
  it('trims by age then by count', () => {
    const now = Date.now();
    const entries = Array.from({ length: 6000 }, (_, i) => ({
      timestamp: now - i * 86_400_000, // each one day older
    }));
    const policy = { ...DEFAULT_RETENTION_POLICY, vectorMemoryMaxAgeDays: 30, vectorMemoryMaxEntries: 100 };
    const result = applyVectorRetention(entries, policy, now);
    expect(result.kept.length).toBeLessThanOrEqual(100);
  });
});

describe('estimateDataFootprint', () => {
  it('returns ok for small data', () => {
    const result = estimateDataFootprint({
      ledgerRuns: 10, rollbackEntries: 20, auditEntries: 50,
      ethicalMemory: 30, vectorMemories: 100, judgments: 10,
    });
    expect(result.warningLevel).toBe('ok');
  });

  it('returns warn for medium data', () => {
    const result = estimateDataFootprint({
      ledgerRuns: 100, rollbackEntries: 500, auditEntries: 2000,
      ethicalMemory: 200, vectorMemories: 3000, judgments: 50,
    });
    expect(result.warningLevel).toBe('warn');
  });

  it('returns critical for large data', () => {
    const result = estimateDataFootprint({
      ledgerRuns: 500, rollbackEntries: 2000, auditEntries: 5000,
      ethicalMemory: 500, vectorMemories: 8000, judgments: 200,
    });
    expect(result.warningLevel).toBe('critical');
  });
});

describe('runRetentionSweep', () => {
  it('trims all data categories', () => {
    const now = Date.now();
    const data = {
      ethicalMemory: Array.from({ length: 500 }, (_, i) => ({ timestamp: now - i * 1000 })),
      judgments: Array.from({ length: 200 }, () => ({})),
      vectorMemories: Array.from({ length: 6000 }, (_, i) => ({ timestamp: now - i * 86_400_000 })),
      auditEntries: Array.from({ length: 3000 }, () => ({})),
    };
    const result = runRetentionSweep(data);
    expect(result.ethicalMemory.removed).toBeGreaterThan(0);
    expect(result.judgments.removed).toBeGreaterThan(0);
    expect(result.vectors.removed).toBeGreaterThan(0);
    expect(result.audit.removed).toBeGreaterThan(0);
  });
});
