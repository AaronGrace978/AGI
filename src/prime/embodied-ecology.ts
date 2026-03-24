import type { EmbodiedEcologyState, EcologyAction } from '../types';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function eid(): string {
  return `eco_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createDefaultEcology(): EmbodiedEcologyState {
  return {
    environmentName: 'AGIPRIME_SANDBOX',
    safetyMode: 'guarded',
    worldState: {
      filesChanged: 0,
      verifiedActions: 0,
      failedActions: 0,
      signalStrength: 0.5,
    },
    plansApplied: 0,
    successfulPlans: 0,
    failedPlans: 0,
    actionLog: [],
    lastUpdated: Date.now(),
  };
}

export function applyEcologyAction(
  state: EmbodiedEcologyState,
  input: { description: string; risk: number; observedSuccess: boolean; rewardSignal: number },
): EmbodiedEcologyState {
  const next: EmbodiedEcologyState = JSON.parse(JSON.stringify(state));
  const action: EcologyAction = {
    id: eid(),
    description: input.description,
    risk: clamp01(input.risk),
    rewardSignal: clamp01(input.rewardSignal),
    outcome: input.observedSuccess ? 'success' : 'failure',
    timestamp: Date.now(),
  };
  next.actionLog = [...next.actionLog, action].slice(-150);
  next.plansApplied += 1;
  if (input.observedSuccess) {
    next.successfulPlans += 1;
    next.worldState.verifiedActions = Number(next.worldState.verifiedActions || 0) + 1;
  } else {
    next.failedPlans += 1;
    next.worldState.failedActions = Number(next.worldState.failedActions || 0) + 1;
  }
  next.worldState.signalStrength = clamp01(
    Number(next.worldState.signalStrength || 0.5) * 0.8 + (input.observedSuccess ? 0.75 : 0.25) * 0.2,
  );
  next.lastUpdated = Date.now();
  return next;
}
