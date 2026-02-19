import { describe, it, expect } from 'vitest';
import { runPIEBenchmarkSuite } from './pie';

describe('PIE deterministic ARC bench', () => {
  it('solves the full built-in suite (2/2)', () => {
    // Use "balanced" but slightly generous limits so the test is stable across machines.
    const report = runPIEBenchmarkSuite({
      timeBudgetMs: 900,
      maxExpansions: 25_000,
      beamWidth: 900,
      maxComplexity: 12,
      maxDepth: 4,
      stopAtFirstDepthWithSurvivor: true,
    });

    expect(report.total).toBeGreaterThan(0);
    expect(report.solved).toBe(report.total);

    // Sanity checks: keep these loose to avoid flakiness.
    expect(report.robustnessPassRate).toBeGreaterThanOrEqual(0.5);
    expect(report.avgMs).toBeLessThan(1500);
  });
});

