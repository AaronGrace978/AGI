import type { GauntletRunSnapshot, GauntletCapability } from '../types';

export interface CurriculumState {
  level: number;
  solvedAtCurrentLevel: number;
  targetPerLevel: number;
  lastPromotionAt: number | null;
  totalPromotions: number;
  recentFailures: string[];
  logs: string[];
}

export function createDefaultCurriculumState(): CurriculumState {
  return {
    level: 1,
    solvedAtCurrentLevel: 0,
    targetPerLevel: 3,
    lastPromotionAt: null,
    totalPromotions: 0,
    recentFailures: [],
    logs: ['Curriculum initialized at level 1.'],
  };
}

export function updateCurriculumFromRun(
  state: CurriculumState,
  run: GauntletRunSnapshot,
  capabilities: GauntletCapability[],
): CurriculumState {
  const next: CurriculumState = {
    ...state,
    recentFailures: [...state.recentFailures],
    logs: [...state.logs],
  };

  if (run.phase !== 'completed') {
    next.logs = [...next.logs, `Run ${run.runId} did not complete; curriculum unchanged.`].slice(-60);
    return next;
  }

  const pass = run.passRate >= 0.75 && run.overallScore >= 0.7;
  if (pass) {
    next.solvedAtCurrentLevel += 1;
    next.logs = [...next.logs, `Run ${run.runId}: pass @ level ${next.level}.`].slice(-60);
  } else {
    const capById = new Map(capabilities.map((c) => [c.id, c.name]));
    const weak = run.results
      .filter((r) => !r.passed)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2)
      .map((r) => capById.get(r.capabilityId) || r.capabilityId);
    next.recentFailures = [...next.recentFailures, ...weak].slice(-10);
    next.logs = [...next.logs, `Run ${run.runId}: failed. Weaknesses: ${weak.join(', ') || 'none'}.`].slice(-60);
  }

  if (next.solvedAtCurrentLevel >= next.targetPerLevel) {
    next.level += 1;
    next.solvedAtCurrentLevel = 0;
    next.lastPromotionAt = Date.now();
    next.totalPromotions += 1;
    next.logs = [...next.logs, `Promoted to curriculum level ${next.level}.`].slice(-60);
  }

  return next;
}
