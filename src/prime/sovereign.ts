// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Sovereign Runtime
//  The orchestration brain. Connects FORGE -> MIND -> HANDS.
//  Runs evolution loops under owner-defined policy.
//  Now with REAL LLM evaluation and champion deployment.
//  No external governance. Local-first. Owner-sovereign.
// ═══════════════════════════════════════════════════════════════

import type {
  ForgeCandidate,
  ForgeGenerationReport,
  ForgeBenchmark,
} from '../types';
import type { OwnerPolicy } from './policy';
import {
  getEffectiveMaxGenerations,
  getEffectiveMaxRuntime,
  policyAllowsAction,
  policyToLog,
} from './policy';
import {
  createSeedCandidate,
  evaluateGeneration,
  evaluateSeed,
} from './runtime';
import type { GenerateFn } from './runtime';

// ─── Types ─────────────────────────────────────────────────────

export type SovereignPhase =
  | 'dormant'
  | 'initializing'
  | 'evolving'
  | 'converged'
  | 'halted'
  | 'killed';

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

function computeConvergence(reports: ForgeGenerationReport[]): number {
  if (reports.length < 3) return 0;
  const recent = reports.slice(-5);
  const scores = recent.map((r) => r.bestScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;
  return Math.max(0, 1 - Math.sqrt(variance) * 10);
}

// ─── Sovereign Evolution Loop ──────────────────────────────────

export async function runSovereignLoop(params: {
  policy: OwnerPolicy;
  suite: ForgeBenchmark[];
  seed: number;
  generate?: GenerateFn;
  onGeneration: (telemetry: SovereignTelemetry) => void;
  onChampionDeployed?: (candidate: ForgeCandidate) => void;
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
  onGeneration(buildTelemetry('initializing', startTime, generation, totalCandidates, best, 0, reports, logs, policy, false));

  // ─── Main Evolution Loop ─────────────────────────────────
  while (true) {
    generation += 1;

    // Kill switch
    if (shouldStop()) {
      logs.push(`KILLED by operator at generation ${generation}.`);
      const tel = buildTelemetry('killed', startTime, generation, totalCandidates, best, computeConvergence(reports), reports, logs, policy, championDeployed);
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
    onGeneration(buildTelemetry('evolving', startTime, generation, totalCandidates, best, computeConvergence(reports), reports, logs, policy, championDeployed));

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
        onChampionDeployed(best);
      }
    }

    const convergence = computeConvergence(reports);
    const marker = improved ? '+' : '=';
    logs.push(
      `G${generation} [${marker}] best ${(report.bestScore * 100).toFixed(1)}% | avg ${(report.averageScore * 100).toFixed(1)}% | conv ${(convergence * 100).toFixed(0)}%`
    );

    // Emit
    onGeneration(buildTelemetry('evolving', startTime, generation, totalCandidates, best, convergence, reports, logs, policy, championDeployed));

    // Convergence exit
    if (convergence > 0.95 && generation >= 5 && !policyAllowsAction(policy, 'loop')) {
      logs.push('Converged. Stopping (unbounded loops not enabled).');
      break;
    }

    // Yield to UI
    await sleep(60);
  }

  const convergence = computeConvergence(reports);
  logs.push('──────────────────────────────────────────');
  logs.push(`SOVEREIGN RUN COMPLETE.`);
  logs.push(`Final: ${best.id} | ${(best.score * 100).toFixed(1)}% | ${generation} generations | ${totalCandidates} candidates`);

  // Deploy final champion if not already deployed
  if (!championDeployed && best.score > 0.4 && onChampionDeployed) {
    logs.push(`FINAL CHAMPION DEPLOYED: ${best.id}`);
    championDeployed = true;
    onChampionDeployed(best);
  }

  const tel = buildTelemetry('converged', startTime, generation, totalCandidates, best, convergence, reports, logs, policy, championDeployed);
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
    window.setTimeout(resolve, ms);
  });
}
