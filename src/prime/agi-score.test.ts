import { describe, expect, it } from 'vitest';
import type { GauntletCapability, GauntletRunSnapshot } from '../types';
import {
  DEFAULT_AGI_RUBRIC_CONFIG,
  computeAgiScoreSnapshot,
  computeWeightedTotal,
  normalizeWeights,
} from './agi-score';

function cap(id: string, category: GauntletCapability['category']): GauntletCapability {
  return {
    id,
    name: id,
    description: id,
    category,
    testPrompt: `Test: ${id}`,
    judgeCriteria: 'criteria',
    weight: 1,
  };
}

function baseRun(overrides?: Partial<GauntletRunSnapshot>): GauntletRunSnapshot {
  return {
    runId: 'gauntlet-test',
    phase: 'completed',
    startedAt: Date.now(),
    finishedAt: Date.now(),
    currentIndex: 0,
    totalCapabilities: 0,
    results: [],
    overallScore: 0,
    passRate: 0,
    provenanceRollups: {
      synthetic: { overallScore: 0, passRate: 0, count: 0 },
      'real-workflow': { overallScore: 0, passRate: 0, count: 0 },
    },
    logs: [],
    stopReason: null,
    ...overrides,
  };
}

describe('agi-score', () => {
  it('normalizes weights to sum to 1', () => {
    const norm = normalizeWeights({
      abstractReasoningLogic: 2,
      learningFlexibility: 2,
      domainGenerality: 2,
      autonomousGoalSetting: 2,
      selfModelingMetaCognition: 1,
      creativeProblemSolving: 1,
    });
    const sum = Object.values(norm).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('computes a bounded weighted total', () => {
    const total = computeWeightedTotal(
      {
        abstractReasoningLogic: 10,
        learningFlexibility: 10,
        domainGenerality: 10,
        autonomousGoalSetting: 10,
        selfModelingMetaCognition: 10,
        creativeProblemSolving: 10,
      },
      DEFAULT_AGI_RUBRIC_CONFIG.weights,
    );
    expect(total).toBeCloseTo(10, 6);
  });

  it('caps domain generality without real-workflow evidence', () => {
    const capabilities: GauntletCapability[] = [
      cap('pie-arc-bench', 'reasoning'),
      cap('reasoning-depth', 'reasoning'),
      cap('planning-horizon', 'planning'),
      cap('tool-orchestration', 'execution'),
      cap('failure-recovery-playbook', 'robustness'),
      cap('creative-transfer', 'creativity'),
      cap('self-correction', 'meta-cognition'),
    ];

    const run = baseRun({
      results: capabilities.map((c) => ({
        capabilityId: c.id,
        score: 0.9,
        passed: true,
        summary: 'ok',
        latencyMs: 10,
        provenance: 'synthetic',
      })),
      overallScore: 0.9,
      passRate: 1,
      provenanceRollups: {
        synthetic: { overallScore: 0.9, passRate: 1, count: capabilities.length },
        'real-workflow': { overallScore: 0, passRate: 0, count: 0 },
      },
    });

    const snapshot = computeAgiScoreSnapshot({
      config: DEFAULT_AGI_RUBRIC_CONFIG,
      gauntletRun: run,
      gauntletCapabilities: capabilities,
    });

    expect(snapshot).not.toBeNull();
    // The cap is 6.5/10 when there are zero real-workflow runs.
    expect(snapshot!.subscores.domainGenerality).toBeLessThanOrEqual(6.5);
  });
});
