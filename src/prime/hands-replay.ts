export interface HandsReplayEntry {
  type: string;
  payload?: Record<string, unknown>;
}

export interface HandsReplayMetrics {
  actionCount: number;
  blockedCount: number;
  failedCount: number;
}

export function buildReplaySignature(entries: HandsReplayEntry[]): string {
  return entries
    .map((entry) => {
      const action = String(entry.payload?.action ?? entry.payload?.actionType ?? entry.payload?.type ?? 'na');
      return `${entry.type}:${action}`;
    })
    .join('|');
}

export function summarizeReplayMetrics(entries: HandsReplayEntry[]): HandsReplayMetrics {
  let actionCount = 0;
  let blockedCount = 0;
  let failedCount = 0;

  for (const entry of entries) {
    if (entry.type !== 'hands_action' && entry.type !== 'cognitive_step') continue;
    actionCount += 1;
    const blocked = Boolean(entry.payload?.blocked);
    if (blocked) blockedCount += 1;
    const success = entry.payload?.success ?? entry.payload?.actionResult?.success;
    if (success === false) failedCount += 1;
  }

  return { actionCount, blockedCount, failedCount };
}
