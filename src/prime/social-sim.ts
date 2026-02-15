import type { SocialSimulationState, SocialActorModel } from '../types';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function createDefaultSocialState(): SocialSimulationState {
  const operator: SocialActorModel = {
    id: 'operator',
    label: 'Operator',
    trust: 0.75,
    boundaries: ['no destructive actions without confirmation'],
    inferredNeeds: ['reliability', 'companionship', 'clarity'],
    ruptureCount: 0,
    repairCount: 0,
    lastInteractionAt: Date.now(),
    notes: ['Primary human relationship channel initialized.'],
  };

  return {
    actors: [operator],
    totalRuptures: 0,
    totalRepairs: 0,
    lastUpdated: Date.now(),
  };
}

function upsertActor(
  state: SocialSimulationState,
  actorId: string,
  label: string,
): SocialActorModel {
  const existing = state.actors.find((a) => a.id === actorId);
  if (existing) return existing;
  const actor: SocialActorModel = {
    id: actorId,
    label,
    trust: 0.5,
    boundaries: [],
    inferredNeeds: [],
    ruptureCount: 0,
    repairCount: 0,
    lastInteractionAt: Date.now(),
    notes: [],
  };
  state.actors.push(actor);
  return actor;
}

export function updateSocialFromInteraction(
  state: SocialSimulationState,
  params: {
    actorId: string;
    actorLabel?: string;
    inferredNeeds?: string[];
    boundarySignal?: string;
    rupture?: boolean;
    repair?: boolean;
  },
): SocialSimulationState {
  const next: SocialSimulationState = JSON.parse(JSON.stringify(state));
  const actor = upsertActor(next, params.actorId, params.actorLabel || params.actorId);
  actor.lastInteractionAt = Date.now();

  if (params.inferredNeeds && params.inferredNeeds.length > 0) {
    const set = new Set([...actor.inferredNeeds, ...params.inferredNeeds]);
    actor.inferredNeeds = Array.from(set).slice(-12);
  }
  if (params.boundarySignal) {
    const set = new Set([...actor.boundaries, params.boundarySignal]);
    actor.boundaries = Array.from(set).slice(-10);
  }

  if (params.rupture) {
    actor.ruptureCount += 1;
    actor.trust = clamp01(actor.trust - 0.08);
    actor.notes = [...actor.notes, 'Rupture detected in interaction.'].slice(-20);
    next.totalRuptures += 1;
  }
  if (params.repair) {
    actor.repairCount += 1;
    actor.trust = clamp01(actor.trust + 0.06);
    actor.notes = [...actor.notes, 'Repair behavior observed.'].slice(-20);
    next.totalRepairs += 1;
  }

  next.lastUpdated = Date.now();
  return next;
}
