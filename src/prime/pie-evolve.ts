// ═══════════════════════════════════════════════════════════════
//  PIE Evolution (FORGE-style, deterministic)
//  Mutate PIE search defaults and select by deterministic bench.
// ═══════════════════════════════════════════════════════════════

import { getPIESearchDefaults, runPIEBenchmarkSuite, setPIESearchDefaults } from './pie';

function clampInt(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

// Simple deterministic RNG (LCG).
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  return {
    next,
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: <T>(arr: T[]) => arr[Math.floor(next() * arr.length)],
  };
}

export interface PIEEvolutionReport {
  seed: number;
  iterations: number;
  baselineScore: number;
  bestScore: number;
  bestDefaults: ReturnType<typeof getPIESearchDefaults>;
  notes: string[];
}

export function evolvePIESearchDefaults(params?: {
  seed?: number;
  iterations?: number;
}): PIEEvolutionReport {
  const seed = params?.seed ?? Date.now();
  const iterations = params?.iterations ?? 30;
  const r = rng(seed);
  const notes: string[] = [];

  const baselineDefaults = getPIESearchDefaults();
  const baseline = runPIEBenchmarkSuite();

  let bestScore = baseline.score;
  let bestDefaults = baselineDefaults;

  for (let i = 0; i < iterations; i++) {
    const current = { ...bestDefaults };

    // Mutate one knob at a time (small steps).
    const knob = r.pick(['beamWidth', 'maxComplexity', 'maxExpansions', 'timeBudgetMs'] as const);
    if (knob === 'beamWidth') current.beamWidth = clampInt(current.beamWidth + r.int(-120, 120), 120, 2000);
    if (knob === 'maxComplexity') current.maxComplexity = clampInt(current.maxComplexity + r.int(-2, 2), 6, 14);
    if (knob === 'maxExpansions') current.maxExpansions = clampInt(current.maxExpansions + r.int(-3000, 3000), 1000, 40000);
    if (knob === 'timeBudgetMs') current.timeBudgetMs = clampInt(current.timeBudgetMs + r.int(-120, 120), 80, 1500);

    // Evaluate deterministically with temporary defaults.
    const prev = getPIESearchDefaults();
    setPIESearchDefaults(current);
    const rep = runPIEBenchmarkSuite();
    setPIESearchDefaults(prev);

    if (rep.score > bestScore + 0.0001) {
      bestScore = rep.score;
      bestDefaults = current;
      notes.push(`iter ${i + 1}: improved to ${(bestScore * 100).toFixed(1)}% by mutating ${knob}`);
    }
  }

  // Apply the best defaults.
  setPIESearchDefaults(bestDefaults);

  return {
    seed,
    iterations,
    baselineScore: baseline.score,
    bestScore,
    bestDefaults,
    notes,
  };
}

