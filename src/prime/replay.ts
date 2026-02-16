import type { CognitiveStep, LedgerRun } from '../types';

export interface ReplayTimeline {
  runId: string;
  kind: string;
  startedAt: number;
  finishedAt: number | null;
  steps: CognitiveStep[];
}

export function buildReplayTimeline(run: LedgerRun): ReplayTimeline {
  const steps: CognitiveStep[] = [];
  for (const entry of run.entries) {
    if (entry.type !== 'cognitive_step') continue;
    const payload = entry.payload || {};
    steps.push({
      type: (payload.type as CognitiveStep['type']) || 'observe',
      content: String(payload.content || ''),
      timestamp: Number(payload.timestamp || entry.timestamp || Date.now()),
      actionType: (payload.actionType as string) || undefined,
      goalProgress: typeof payload.goalProgress === 'number' ? payload.goalProgress : undefined,
      actionResult: (payload.actionResult as CognitiveStep['actionResult']) || undefined,
    });
  }

  return {
    runId: run.runId,
    kind: run.kind,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    steps,
  };
}

export function clampReplayCursor(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}
