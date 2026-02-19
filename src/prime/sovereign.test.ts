import { describe, it, expect } from 'vitest';
import { computeConvergenceMetrics } from './sovereign';

function rep(gen: number, best: number, avg?: number) {
  return {
    generation: gen,
    bestCandidateId: `c${gen}`,
    bestScore: best,
    averageScore: avg ?? Math.max(0, best - 0.08),
    candidatesEvaluated: 6,
  };
}

describe('computeConvergenceMetrics', () => {
  it('stays low when best score is still improving', () => {
    const reports = [
      rep(1, 0.25),
      rep(2, 0.32),
      rep(3, 0.40),
      rep(4, 0.47),
      rep(5, 0.53),
      rep(6, 0.60),
    ];
    const m = computeConvergenceMetrics(reports);
    expect(m.recentSlopeBest).toBeGreaterThan(0);
    expect(m.fixedPoint01).toBeLessThan(0.8);
  });

  it('goes high for a stable high-quality plateau', () => {
    const reports = [
      rep(1, 0.78),
      rep(2, 0.79),
      rep(3, 0.785),
      rep(4, 0.792),
      rep(5, 0.789),
      rep(6, 0.791),
    ];
    const m = computeConvergenceMetrics(reports);
    expect(m.plateau01).toBeGreaterThan(0.9);
    expect(m.quality01).toBeGreaterThan(0.8);
    expect(m.fixedPoint01).toBeGreaterThan(0.9);
  });

  it('does not report a high fixed point when plateaued at low quality', () => {
    const reports = [
      rep(1, 0.22),
      rep(2, 0.221),
      rep(3, 0.219),
      rep(4, 0.223),
      rep(5, 0.220),
      rep(6, 0.222),
    ];
    const m = computeConvergenceMetrics(reports);
    expect(m.plateau01).toBeGreaterThan(0.85);
    expect(m.quality01).toBeLessThan(0.2);
    expect(m.fixedPoint01).toBeLessThan(0.6);
  });

  it('penalizes oscillation/noise', () => {
    const reports = [
      rep(1, 0.62),
      rep(2, 0.71),
      rep(3, 0.60),
      rep(4, 0.73),
      rep(5, 0.61),
      rep(6, 0.72),
    ];
    const m = computeConvergenceMetrics(reports);
    expect(m.recentStdBest).toBeGreaterThan(0.03);
    expect(m.plateau01).toBeLessThan(0.9);
  });
});

