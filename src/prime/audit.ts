// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Audit Log
//  Tamper-evident log for every override, emergency stop,
//  consent decision, policy change, and blocked action.
//  Security posture requires a paper trail.
// ═══════════════════════════════════════════════════════════════

export type AuditEventKind =
  | 'gate_block'
  | 'gate_pass'
  | 'consent_approved'
  | 'consent_denied'
  | 'consent_timeout'
  | 'conscience_override'
  | 'emergency_stop'
  | 'emergency_clear'
  | 'policy_change'
  | 'rollback_executed'
  | 'rollback_failed'
  | 'path_violation'
  | 'command_blocked'
  | 'retention_sweep';

export interface AuditEntry {
  id: string;
  kind: AuditEventKind;
  action: string;
  detail: string;
  tier?: string;
  verdict?: string;
  operator?: string;
  timestamp: number;
}

export interface AuditLog {
  entries: AuditEntry[];
  version: number;
}

export function createAuditLog(): AuditLog {
  return { entries: [], version: 1 };
}

let _nextId = 0;

export function appendAuditEntry(
  log: AuditLog,
  kind: AuditEventKind,
  action: string,
  detail: string,
  extra?: Partial<Pick<AuditEntry, 'tier' | 'verdict' | 'operator'>>,
): AuditLog {
  const entry: AuditEntry = {
    id: `audit_${Date.now()}_${++_nextId}`,
    kind,
    action,
    detail: detail.slice(0, 1000),
    tier: extra?.tier,
    verdict: extra?.verdict,
    operator: extra?.operator,
    timestamp: Date.now(),
  };
  const entries = [...log.entries, entry];
  return { ...log, entries: entries.slice(-2000) };
}

export function filterAuditLog(
  log: AuditLog,
  opts: {
    kind?: AuditEventKind;
    since?: number;
    limit?: number;
  } = {},
): AuditEntry[] {
  let results = log.entries;
  if (opts.kind) results = results.filter((e) => e.kind === opts.kind);
  if (opts.since) results = results.filter((e) => e.timestamp >= opts.since!);
  if (opts.limit) results = results.slice(-opts.limit);
  return results;
}

export function auditSummary(log: AuditLog): Record<AuditEventKind, number> {
  const counts: Record<string, number> = {};
  for (const entry of log.entries) {
    counts[entry.kind] = (counts[entry.kind] || 0) + 1;
  }
  return counts as Record<AuditEventKind, number>;
}
