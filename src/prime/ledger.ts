import type { LedgerEntry, LedgerRun } from '../types';

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return `fnv1a32_${hash.toString(16).padStart(8, '0')}`;
}

export function createLedgerRun(kind: string, metadata: Record<string, unknown> = {}): LedgerRun {
  return {
    runId: `run_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    startedAt: Date.now(),
    finishedAt: null,
    status: 'running',
    metadata,
    entries: [],
    integrity: {
      algorithm: 'fnv1a32-chain',
      chainHead: '',
      entryCount: 0,
    },
  };
}

export function appendLedgerEntry(
  run: LedgerRun,
  type: string,
  payload: Record<string, unknown> = {},
): LedgerRun {
  const prevHash = run.integrity.chainHead || '';
  const base = {
    id: `le_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type,
    payload,
    prevHash,
  };
  const hash = hashString(stableStringify(base));
  const entry: LedgerEntry = { ...base, hash };
  const entries = [...run.entries, entry];
  return {
    ...run,
    entries,
    integrity: {
      ...run.integrity,
      chainHead: hash,
      entryCount: entries.length,
    },
  };
}

export function finalizeLedgerRun(
  run: LedgerRun,
  summary: Record<string, unknown> = {},
): LedgerRun {
  return {
    ...run,
    finishedAt: Date.now(),
    status: 'completed',
    summary,
  };
}
