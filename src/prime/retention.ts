// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Data Lifecycle / Retention Policy
//  Prevents unbounded growth of ledgers, rollback entries,
//  memory vectors, ethical memory, and audit logs.
//  Runs on a schedule or can be triggered manually.
// ═══════════════════════════════════════════════════════════════

export interface RetentionPolicy {
  ledgerMaxAgeDays: number;          // delete completed ledger runs older than this
  ledgerMaxCount: number;            // keep at most this many ledger files
  rollbackMaxAgeDays: number;        // remove rollback entries + backups older than this
  rollbackMaxCount: number;          // keep at most this many rollback entries
  auditMaxEntries: number;           // cap audit log entries
  ethicalMemoryMaxEntries: number;   // cap ethical memory
  vectorMemoryMaxEntries: number;    // cap vector store
  vectorMemoryMaxAgeDays: number;    // prune vectors older than this
  judgmentMaxEntries: number;        // cap conscience judgments
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  ledgerMaxAgeDays: 30,
  ledgerMaxCount: 200,
  rollbackMaxAgeDays: 14,
  rollbackMaxCount: 300,
  auditMaxEntries: 2000,
  ethicalMemoryMaxEntries: 200,
  vectorMemoryMaxEntries: 5000,
  vectorMemoryMaxAgeDays: 90,
  judgmentMaxEntries: 100,
};

export interface RetentionResult {
  ledgersRemoved: number;
  rollbacksRemoved: number;
  auditEntriesTrimmed: number;
  ethicalMemoryTrimmed: number;
  vectorsTrimmed: number;
  judgmentsTrimmed: number;
  ranAt: number;
}

// ─── In-Memory Retention (renderer-side) ───────────────────────

export function trimByAge<T extends { timestamp: number }>(
  entries: T[],
  maxAgeDays: number,
  now: number = Date.now(),
): { kept: T[]; removed: number } {
  const cutoff = now - maxAgeDays * 86_400_000;
  const kept = entries.filter((e) => e.timestamp >= cutoff);
  return { kept, removed: entries.length - kept.length };
}

export function trimByCount<T>(
  entries: T[],
  maxCount: number,
): { kept: T[]; removed: number } {
  if (entries.length <= maxCount) return { kept: entries, removed: 0 };
  const kept = entries.slice(-maxCount);
  return { kept, removed: entries.length - maxCount };
}

/**
 * Apply retention to ethical memory entries (in ConscienceState).
 */
export function applyEthicalMemoryRetention<T extends { timestamp: number }>(
  entries: T[],
  policy: RetentionPolicy,
): { kept: T[]; removed: number } {
  const byCount = trimByCount(entries, policy.ethicalMemoryMaxEntries);
  return byCount;
}

/**
 * Apply retention to conscience judgments.
 */
export function applyJudgmentRetention<T>(
  entries: T[],
  policy: RetentionPolicy,
): { kept: T[]; removed: number } {
  return trimByCount(entries, policy.judgmentMaxEntries);
}

/**
 * Apply retention to vector memories.
 */
export function applyVectorRetention<T extends { timestamp: number }>(
  entries: T[],
  policy: RetentionPolicy,
  now: number = Date.now(),
): { kept: T[]; removed: number } {
  // First trim by age, then by count
  const byAge = trimByAge(entries, policy.vectorMemoryMaxAgeDays, now);
  const byCount = trimByCount(byAge.kept, policy.vectorMemoryMaxEntries);
  return { kept: byCount.kept, removed: byAge.removed + byCount.removed };
}

/**
 * Estimate total data size (rough) for the health panel.
 */
export function estimateDataFootprint(counts: {
  ledgerRuns: number;
  rollbackEntries: number;
  auditEntries: number;
  ethicalMemory: number;
  vectorMemories: number;
  judgments: number;
}): { totalItems: number; warningLevel: 'ok' | 'warn' | 'critical' } {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  let warningLevel: 'ok' | 'warn' | 'critical' = 'ok';
  if (total > 5000) warningLevel = 'warn';
  if (total > 15000) warningLevel = 'critical';
  return { totalItems: total, warningLevel };
}

/**
 * Run retention sweep — returns summary of what was trimmed.
 * Does NOT perform filesystem operations (those happen in main.js).
 * This handles in-memory arrays only.
 */
export function runRetentionSweep(
  data: {
    ethicalMemory: Array<{ timestamp: number }>;
    judgments: unknown[];
    vectorMemories: Array<{ timestamp: number }>;
    auditEntries: unknown[];
  },
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): {
  ethicalMemory: { kept: Array<{ timestamp: number }>; removed: number };
  judgments: { kept: unknown[]; removed: number };
  vectors: { kept: Array<{ timestamp: number }>; removed: number };
  audit: { kept: unknown[]; removed: number };
} {
  return {
    ethicalMemory: applyEthicalMemoryRetention(data.ethicalMemory, policy),
    judgments: applyJudgmentRetention(data.judgments, policy),
    vectors: applyVectorRetention(data.vectorMemories, policy),
    audit: trimByCount(data.auditEntries, policy.auditMaxEntries),
  };
}
