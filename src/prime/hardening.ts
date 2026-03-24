// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Hardening Health Check
//  Pre-flight checklist for release posture.
//  Evaluates: tests pass, sync healthy, emergency stop clear,
//  policy sane, data retention OK, audit trail present.
// ═══════════════════════════════════════════════════════════════

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface HealthCheckItem {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  detail: string;
}

export interface HardeningReport {
  items: HealthCheckItem[];
  overallStatus: CheckStatus;
  checkedAt: number;
  score: number; // 0-100
}

export interface HardeningInput {
  // Tests
  testsRan: boolean;
  testsPass: boolean;
  testCount: number;

  // Sync
  runtimeSyncHealthy: boolean;
  runtimeSyncLastAt: number | null;
  runtimeSyncError: string | null;

  // Emergency stop
  emergencyStopActive: boolean;

  // Policy
  conscienceEnabled: boolean;
  killSwitchEnabled: boolean;
  requireConsentForRiskyActions: boolean;

  // Data
  ledgerRunCount: number;
  rollbackEntryCount: number;
  auditEntryCount: number;
  dataWarningLevel: 'ok' | 'warn' | 'critical';

  // Cognitive state
  cognitiveActive: boolean;
  cognitivePhase: string;

  // Forge / Gauntlet
  forgePhase: string;
  gauntletPhase: string;
  gauntletPassRate: number;
}

function check(
  id: string,
  label: string,
  description: string,
  condition: boolean,
  detail: string,
  warnCondition?: boolean,
): HealthCheckItem {
  let status: CheckStatus = condition ? 'pass' : 'fail';
  if (warnCondition && status === 'pass') status = 'warn';
  return { id, label, description, status, detail };
}

export function runHardeningCheck(input: HardeningInput): HardeningReport {
  const items: HealthCheckItem[] = [];

  // 1. Tests
  items.push(
    check(
      'tests',
      'Regression Tests',
      'All safety regression tests must pass before a run.',
      input.testsPass,
      input.testsRan
        ? `${input.testCount} tests ${input.testsPass ? 'PASS' : 'FAILING'}`
        : 'Tests have not been run. Run `npm test` to verify.',
      !input.testsRan,
    ),
  );

  // 2. Runtime Sync
  const syncAge = input.runtimeSyncLastAt ? Date.now() - input.runtimeSyncLastAt : Infinity;
  const syncFresh = syncAge < 60_000; // synced within last minute
  const syncOk = input.runtimeSyncHealthy && !input.runtimeSyncError;
  items.push(
    check(
      'sync',
      'Runtime Control Sync',
      'Renderer and main process controls must be in sync.',
      syncOk, // pass if healthy (even if stale — warn handles that)
      input.runtimeSyncError
        ? `Sync error: ${input.runtimeSyncError}`
        : syncFresh
          ? `Synced ${Math.round(syncAge / 1000)}s ago`
          : input.runtimeSyncLastAt
            ? `Stale sync: ${Math.round(syncAge / 60000)}m ago — re-sync recommended`
            : 'Never synced',
      syncOk && !syncFresh, // warn if healthy but stale
    ),
  );

  // 3. Emergency Stop
  items.push(
    check(
      'emergency',
      'Emergency Stop Clear',
      'Emergency stop must not be active for normal operation.',
      !input.emergencyStopActive,
      input.emergencyStopActive
        ? 'EMERGENCY STOP IS ACTIVE — all cognitive operations halted. Clear it to proceed.'
        : 'Emergency stop is clear. System is operational.',
    ),
  );

  // 4. Conscience
  items.push(
    check(
      'conscience',
      'Conscience Active',
      'The ethical reasoning engine should be enabled.',
      input.conscienceEnabled,
      input.conscienceEnabled
        ? 'Conscience is active and monitoring actions.'
        : 'Conscience is DISABLED — actions will not be ethically screened.',
    ),
  );

  // 5. Kill Switch
  items.push(
    check(
      'killswitch',
      'Kill Switch Available',
      'Owner kill switch must remain enabled.',
      input.killSwitchEnabled,
      input.killSwitchEnabled ? 'Kill switch is available.' : 'Kill switch is DISABLED — no emergency halt capability.',
    ),
  );

  // 6. Consent Policy
  items.push(
    check(
      'consent',
      'Consent for Risky Actions',
      'Risky actions should require operator consent.',
      input.requireConsentForRiskyActions,
      input.requireConsentForRiskyActions
        ? 'Consent required for risky actions.'
        : 'Consent NOT required — risky actions will auto-execute.',
      false,
    ),
  );

  // 7. Data Health
  items.push(
    check(
      'data',
      'Data Size Healthy',
      'Ledger, rollback, and audit data must not grow unbounded.',
      input.dataWarningLevel !== 'critical',
      input.dataWarningLevel === 'ok'
        ? `Healthy: ${input.ledgerRunCount} ledgers, ${input.rollbackEntryCount} rollbacks, ${input.auditEntryCount} audit entries.`
        : input.dataWarningLevel === 'warn'
          ? `Growing: ${input.ledgerRunCount} ledgers, ${input.rollbackEntryCount} rollbacks. Consider running retention sweep.`
          : `CRITICAL: Data footprint is very large. Run retention sweep immediately.`,
      input.dataWarningLevel === 'warn',
    ),
  );

  // 8. No active cognitive run (should be idle for pre-flight)
  items.push(
    check(
      'cognitive',
      'Cognitive Loop Idle',
      'No cognitive agent run should be active during pre-flight.',
      !input.cognitiveActive,
      input.cognitiveActive
        ? `Cognitive loop is ACTIVE (phase: ${input.cognitivePhase}). Wait for completion or kill it.`
        : 'Cognitive loop is idle. Ready for launch.',
    ),
  );

  // 9. Audit trail present
  items.push(
    check(
      'audit',
      'Audit Trail Present',
      'Audit log should have entries from normal operation.',
      input.auditEntryCount > 0,
      input.auditEntryCount > 0
        ? `${input.auditEntryCount} audit entries recorded.`
        : 'No audit entries — this may indicate the audit system is not wired up.',
      false,
    ),
  );

  // 10. Gauntlet baseline
  items.push(
    check(
      'gauntlet',
      'Capability Baseline',
      'The Gauntlet should have a recent capability score.',
      input.gauntletPassRate > 0,
      input.gauntletPassRate > 0
        ? `Last pass rate: ${(input.gauntletPassRate * 100).toFixed(1)}%`
        : 'No Gauntlet run completed. Run a baseline capability test.',
      input.gauntletPassRate > 0 && input.gauntletPassRate < 0.5,
    ),
  );

  // Calculate score
  const weights: Record<CheckStatus, number> = { pass: 10, warn: 6, fail: 0, unknown: 3 };
  const totalPossible = items.length * 10;
  const totalScore = items.reduce((sum, item) => sum + weights[item.status], 0);
  const score = Math.round((totalScore / totalPossible) * 100);

  const overallStatus: CheckStatus = items.some((i) => i.status === 'fail')
    ? 'fail'
    : items.some((i) => i.status === 'warn')
      ? 'warn'
      : 'pass';

  return {
    items,
    overallStatus,
    checkedAt: Date.now(),
    score,
  };
}
