// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Sovereign Runtime
//  The orchestration brain. Connects FORGE -> MIND -> HANDS.
//  Runs evolution loops under owner-defined policy.
//  Now with REAL LLM evaluation and champion deployment.
//  No external governance. Local-first. Owner-sovereign.
// ═══════════════════════════════════════════════════════════════

import type { ForgeCandidate, ForgeGenerationReport, ForgeBenchmark } from '../types';
import type { OwnerPolicy } from './policy';
import { getEffectiveMaxGenerations, getEffectiveMaxRuntime, policyAllowsAction, policyToLog } from './policy';
import { createSeedCandidate, evaluateGeneration, evaluateSeed } from './runtime';
import type { GenerateFn } from './runtime';

// ─── Types ─────────────────────────────────────────────────────

export type SovereignPhase = 'dormant' | 'initializing' | 'evolving' | 'converged' | 'halted' | 'killed';

export interface SovereignTelemetry {
  phase: SovereignPhase;
  startedAt: number | null;
  elapsedMs: number;
  totalGenerations: number;
  totalCandidatesEvaluated: number;
  currentBest: ForgeCandidate | null;
  convergenceScore: number;
  generationReports: ForgeGenerationReport[];
  logs: string[];
  policySnapshot: OwnerPolicy;
  championDeployed: boolean;
}

export interface SovereignRunResult {
  telemetry: SovereignTelemetry;
  finalCandidate: ForgeCandidate | null;
  exitReason: string;
}

// ─── Convergence Detection ─────────────────────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const variance = mean(nums.map((n) => (n - m) ** 2));
  return Math.sqrt(variance);
}

function linearRegressionSlope01(samples: number[]): number {
  // x = 0..n-1, y = samples. Returns slope in "score per generation".
  const n = samples.length;
  if (n < 2) return 0;
  const xs = Array.from({ length: n }, (_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(samples);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    num += dx * (samples[i] - yMean);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

export function computeConvergenceMetrics(reports: ForgeGenerationReport[]): {
  fixedPoint01: number; // stability + adequate score quality
  plateau01: number; // stability only (can be high even if quality is low)
  quality01: number; // quality of the best score, not "stability"
  recentMeanBest: number;
  recentStdBest: number;
  recentMeanAbsDeltaBest: number;
  recentSlopeBest: number; // + means still improving
} {
  if (reports.length < 3) {
    return {
      fixedPoint01: 0,
      plateau01: 0,
      quality01: 0,
      recentMeanBest: 0,
      recentStdBest: 0,
      recentMeanAbsDeltaBest: 0,
      recentSlopeBest: 0,
    };
  }

  // Use a small window so the score responds quickly in UI.
  const recent = reports.slice(-6);
  const bestScores = recent.map((r) => clamp01(r.bestScore));

  const recentMeanBest = mean(bestScores);
  const recentStdBest = stddev(bestScores);

  const deltas = bestScores.slice(1).map((s, i) => s - bestScores[i]);
  const recentMeanAbsDeltaBest = deltas.length > 0 ? mean(deltas.map((d) => Math.abs(d))) : 0;
  const recentSlopeBest = linearRegressionSlope01(bestScores);

  // Heuristics:
  // - Stability: small changes between generations.
  // - Trend: if we're still improving consistently, we are not at a fixed point yet.
  // - Volatility: penalize noisy oscillation.
  //
  // These are in 0..1, designed to be "tunable" without being brittle.
  // Keep this forgiving: micro-fluctuations shouldn't block convergence.
  const stability01 = clamp01(1 - recentMeanAbsDeltaBest / 0.08); // tolerate small jitter
  const improvingSlope = Math.max(0, recentSlopeBest);
  const trend01 = clamp01(1 - improvingSlope / 0.02); // +2% per gen => definitely still improving
  const volatility01 = clamp01(1 - recentStdBest / 0.08);

  const plateau01 = clamp01(stability01 * 0.6 + trend01 * 0.25 + volatility01 * 0.15);

  // Quality gating: avoid calling a low-score stall "converged".
  // 0.35 => 0, 0.80 => 1 (scores below ~35% are treated as "not good enough to be a fixed point").
  const quality01 = clamp01((recentMeanBest - 0.35) / 0.45);

  // Fixed point is high only when BOTH plateau and quality are strong.
  // Keep a small base factor so fixedPoint01 isn't *always* 0 for low quality.
  const fixedPoint01 = clamp01(plateau01 * (0.2 + 0.8 * quality01));

  return {
    fixedPoint01,
    plateau01,
    quality01,
    recentMeanBest,
    recentStdBest,
    recentMeanAbsDeltaBest,
    recentSlopeBest,
  };
}

function computeConvergence(reports: ForgeGenerationReport[]): number {
  return computeConvergenceMetrics(reports).fixedPoint01;
}

// ─── Sovereign Evolution Loop ──────────────────────────────────

export async function runSovereignLoop(params: {
  policy: OwnerPolicy;
  suite: ForgeBenchmark[];
  seed: number;
  generate?: GenerateFn;
  onGeneration: (telemetry: SovereignTelemetry) => void;
  onChampionDeployed?: (candidate: ForgeCandidate) => void | Promise<void>;
  shouldStop: () => boolean;
}): Promise<SovereignRunResult> {
  const { policy, suite, seed, generate, onGeneration, onChampionDeployed, shouldStop } = params;
  const maxGen = getEffectiveMaxGenerations(policy);
  const maxMs = getEffectiveMaxRuntime(policy);
  const startTime = Date.now();

  const logs: string[] = [
    '══════════════════════════════════════════',
    '  SOVEREIGN RUNTIME — INITIALIZED',
    generate ? '  MODE: REAL LLM EVALUATION' : '  MODE: KEYWORD FALLBACK',
    '══════════════════════════════════════════',
    ...policyToLog(policy),
    '──────────────────────────────────────────',
  ];

  // Validate policy permissions
  if (!policyAllowsAction(policy, 'mutate')) {
    logs.push('ABORT: Self-mutation disabled in policy.');
    const tel = buildTelemetry('halted', startTime, 0, 0, null, 0, [], logs, policy, false);
    return { telemetry: tel, finalCandidate: null, exitReason: 'mutation_disabled' };
  }

  // Seed evaluation
  logs.push('Evaluating seed candidate...');
  let best = await evaluateSeed(createSeedCandidate(seed), suite, seed, generate);
  logs.push(`Seed candidate: ${best.id} | score ${(best.score * 100).toFixed(1)}%`);

  const reports: ForgeGenerationReport[] = [];
  let totalCandidates = 1;
  let generation = 0;
  let championDeployed = false;

  // Emit initial state
  onGeneration(
    buildTelemetry('initializing', startTime, generation, totalCandidates, best, 0, reports, logs, policy, false),
  );

  // ─── Main Evolution Loop ─────────────────────────────────
  while (true) {
    generation += 1;

    // Kill switch
    if (shouldStop()) {
      logs.push(`KILLED by operator at generation ${generation}.`);
      const tel = buildTelemetry(
        'killed',
        startTime,
        generation,
        totalCandidates,
        best,
        computeConvergence(reports),
        reports,
        logs,
        policy,
        championDeployed,
      );
      return { telemetry: tel, finalCandidate: best, exitReason: 'operator_kill' };
    }

    // Generation cap
    if (maxGen !== Infinity && generation > maxGen) {
      logs.push(`Generation cap reached (${maxGen}).`);
      break;
    }

    // Time cap
    const elapsed = Date.now() - startTime;
    if (maxMs !== Infinity && elapsed >= maxMs) {
      logs.push(`Runtime cap reached (${Math.round(maxMs / 1000)}s).`);
      break;
    }

    // Evolve (now async — calls real LLM)
    logs.push(`G${generation}: Evaluating candidates...`);
    onGeneration(
      buildTelemetry(
        'evolving',
        startTime,
        generation,
        totalCandidates,
        best,
        computeConvergence(reports),
        reports,
        logs,
        policy,
        championDeployed,
      ),
    );

    const { candidates, report } = await evaluateGeneration({
      parent: best,
      generation,
      config: {
        maxGenerations: maxGen === Infinity ? 999 : maxGen,
        candidatesPerGeneration: policy.maxCandidatesPerGen,
        maxDurationMs: maxMs === Infinity ? 0 : maxMs,
        mutationRate: policy.mutationAggressiveness,
      },
      suite,
      seed,
      generate,
      shouldStop,
    });

    totalCandidates += candidates.length;
    reports.push(report);

    const leader = candidates[0];
    const improved = leader && leader.score > best.score;
    if (improved) {
      best = leader;

      // Champion deployment: if score improved significantly, deploy the new prompt
      if (best.score > 0.5 && onChampionDeployed) {
        logs.push(`CHAMPION DEPLOYED: ${best.id} (${(best.score * 100).toFixed(1)}%)`);
        championDeployed = true;
        await Promise.resolve(onChampionDeployed(best));
      }
    }

    const conv = computeConvergenceMetrics(reports);
    const convergence = conv.fixedPoint01;
    const marker = improved ? '+' : '=';
    logs.push(
      `G${generation} [${marker}] best ${(report.bestScore * 100).toFixed(1)}% | avg ${(report.averageScore * 100).toFixed(1)}% | conv ${(convergence * 100).toFixed(0)}%`,
    );

    // Emit
    onGeneration(
      buildTelemetry(
        'evolving',
        startTime,
        generation,
        totalCandidates,
        best,
        convergence,
        reports,
        logs,
        policy,
        championDeployed,
      ),
    );

    // Convergence exit
    if (convergence > 0.95 && generation >= 5 && !policyAllowsAction(policy, 'loop')) {
      logs.push('Converged. Stopping (unbounded loops not enabled).');
      break;
    }

    // Stall exit (low-quality fixed point): stable but stuck at a low score.
    // This prevents burning generations without meaningful progress when loops are bounded by policy.
    if (conv.plateau01 > 0.97 && conv.quality01 < 0.25 && generation >= 8 && !policyAllowsAction(policy, 'loop')) {
      logs.push('Stalled at low score. Stopping (unbounded loops not enabled).');
      break;
    }

    // Yield to UI
    await sleep(60);
  }

  const convergence = computeConvergence(reports);
  logs.push('──────────────────────────────────────────');
  logs.push(`SOVEREIGN RUN COMPLETE.`);
  logs.push(
    `Final: ${best.id} | ${(best.score * 100).toFixed(1)}% | ${generation} generations | ${totalCandidates} candidates`,
  );

  // Deploy final champion if not already deployed
  if (!championDeployed && best.score > 0.4 && onChampionDeployed) {
    logs.push(`FINAL CHAMPION DEPLOYED: ${best.id}`);
    championDeployed = true;
    await Promise.resolve(onChampionDeployed(best));
  }

  const tel = buildTelemetry(
    'converged',
    startTime,
    generation,
    totalCandidates,
    best,
    convergence,
    reports,
    logs,
    policy,
    championDeployed,
  );
  return { telemetry: tel, finalCandidate: best, exitReason: 'completed' };
}

// ─── Helpers ───────────────────────────────────────────────────

function buildTelemetry(
  phase: SovereignPhase,
  startedAt: number,
  totalGenerations: number,
  totalCandidatesEvaluated: number,
  currentBest: ForgeCandidate | null,
  convergenceScore: number,
  generationReports: ForgeGenerationReport[],
  logs: string[],
  policy: OwnerPolicy,
  championDeployed: boolean,
): SovereignTelemetry {
  return {
    phase,
    startedAt,
    elapsedMs: Date.now() - startedAt,
    totalGenerations,
    totalCandidatesEvaluated,
    currentBest,
    convergenceScore,
    generationReports,
    logs: [...logs],
    policySnapshot: { ...policy },
    championDeployed,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    // Use global timer so this works in browser + Node (tests).
    setTimeout(resolve, ms);
  });
}
