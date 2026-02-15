import type { AutonomyMetabolism } from '../types';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function createDefaultMetabolism(): AutonomyMetabolism {
  return {
    circadianPhase: 'wake',
    energyBudget: 0.85,
    curiosityBudget: 0.75,
    riskBudget: 0.55,
    recoveryDebt: 0.1,
    lastSleepAt: null,
    wakeCycleCount: 0,
    lastUpdated: Date.now(),
  };
}

export function stepMetabolism(
  metabolism: AutonomyMetabolism,
  signal: {
    cognitiveLoad: number;
    novelty: number;
    riskExposure: number;
    triggerSleep: boolean;
  },
): AutonomyMetabolism {
  const next = { ...metabolism };
  next.wakeCycleCount += 1;

  next.energyBudget = clamp01(next.energyBudget - signal.cognitiveLoad * 0.08);
  next.curiosityBudget = clamp01(next.curiosityBudget - signal.novelty * 0.04 + 0.01);
  next.riskBudget = clamp01(next.riskBudget - signal.riskExposure * 0.06 + 0.02);
  next.recoveryDebt = clamp01(next.recoveryDebt + signal.cognitiveLoad * 0.05);

  if (signal.triggerSleep || next.energyBudget < 0.2 || next.recoveryDebt > 0.8) {
    next.circadianPhase = 'sleep';
    next.lastSleepAt = Date.now();
    next.energyBudget = clamp01(next.energyBudget + 0.45);
    next.curiosityBudget = clamp01(next.curiosityBudget + 0.2);
    next.riskBudget = clamp01(next.riskBudget + 0.12);
    next.recoveryDebt = clamp01(next.recoveryDebt - 0.45);
  } else if (next.energyBudget > 0.65 && next.curiosityBudget > 0.5) {
    next.circadianPhase = 'focus';
  } else if (next.energyBudget < 0.4) {
    next.circadianPhase = 'cooldown';
  } else {
    next.circadianPhase = 'wake';
  }

  next.lastUpdated = Date.now();
  return next;
}
