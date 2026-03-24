export interface HandsReplayEntry {
  type: string;
  payload?: Record<string, unknown> & {
    success?: boolean;
    blocked?: boolean;
    action?: string;
    actionType?: string;
    actionResult?: { success?: boolean };
  };
}

export interface HandsReplayMetrics {
  actionCount: number;
  blockedCount: number;
  failedCount: number;
}

export interface OperationJournalEntry {
  id: string;
  runId: string;
  stepIndex: number;
  action: string;
  success: boolean;
  blocked: boolean;
  timestamp: number;
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

export function buildOperationJournal(runId: string, entries: HandsReplayEntry[]): OperationJournalEntry[] {
  const journal: OperationJournalEntry[] = [];
  let stepIndex = 0;
  for (const entry of entries) {
    if (entry.type !== 'hands_action' && entry.type !== 'cognitive_step') continue;
    const action = String(entry.payload?.action ?? entry.payload?.actionType ?? entry.payload?.type ?? 'na');
    const success = entry.payload?.success ?? entry.payload?.actionResult?.success;
    const blocked = Boolean(entry.payload?.blocked);
    journal.push({
      id: `${runId}_${stepIndex}_${Date.now()}`,
      runId,
      stepIndex,
      action,
      success: success !== false,
      blocked,
      timestamp: Number(entry.payload?.timestamp || Date.now()),
    });
    stepIndex += 1;
  }
  return journal;
}
