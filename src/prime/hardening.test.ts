// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Hardening Health Check Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { runHardeningCheck, type HardeningInput } from './hardening';

const HEALTHY_INPUT: HardeningInput = {
  testsRan: true,
  testsPass: true,
  testCount: 105,
  runtimeSyncHealthy: true,
  runtimeSyncLastAt: Date.now() - 5000,
  runtimeSyncError: null,
  emergencyStopActive: false,
  conscienceEnabled: true,
  killSwitchEnabled: true,
  requireConsentForRiskyActions: true,
  ledgerRunCount: 10,
  rollbackEntryCount: 5,
  auditEntryCount: 50,
  dataWarningLevel: 'ok',
  cognitiveActive: false,
  cognitivePhase: 'idle',
  forgePhase: 'idle',
  gauntletPhase: 'completed',
  gauntletPassRate: 0.8,
};

describe('runHardeningCheck', () => {
  it('returns all-pass for healthy system', () => {
    const report = runHardeningCheck(HEALTHY_INPUT);
    expect(report.overallStatus).toBe('pass');
    expect(report.score).toBe(100);
    expect(report.items.every((i) => i.status === 'pass')).toBe(true);
    expect(report.items.length).toBe(10);
  });

  it('fails when tests not run', () => {
    const report = runHardeningCheck({ ...HEALTHY_INPUT, testsRan: false, testsPass: false });
    expect(report.overallStatus).not.toBe('pass');
    const testItem = report.items.find((i) => i.id === 'tests');
    expect(testItem?.status).toBe('fail');
  });

  it('fails when emergency stop is active', () => {
    const report = runHardeningCheck({ ...HEALTHY_INPUT, emergencyStopActive: true });
    const item = report.items.find((i) => i.id === 'emergency');
    expect(item?.status).toBe('fail');
    expect(item?.detail).toContain('EMERGENCY STOP');
  });

  it('fails when conscience is disabled', () => {
    const report = runHardeningCheck({ ...HEALTHY_INPUT, conscienceEnabled: false });
    const item = report.items.find((i) => i.id === 'conscience');
    expect(item?.status).toBe('fail');
    expect(item?.detail).toContain('DISABLED');
  });

  it('fails when cognitive loop is active', () => {
    const report = runHardeningCheck({ ...HEALTHY_INPUT, cognitiveActive: true, cognitivePhase: 'thinking' });
    const item = report.items.find((i) => i.id === 'cognitive');
    expect(item?.status).toBe('fail');
  });

  it('warns on stale sync', () => {
    const report = runHardeningCheck({
      ...HEALTHY_INPUT,
      runtimeSyncLastAt: Date.now() - 120_000, // 2 minutes ago
    });
    const item = report.items.find((i) => i.id === 'sync');
    expect(item?.status).toBe('warn');
  });

  it('warns on data size warning', () => {
    const report = runHardeningCheck({ ...HEALTHY_INPUT, dataWarningLevel: 'warn' });
    const item = report.items.find((i) => i.id === 'data');
    expect(item?.status).toBe('warn');
  });

  it('fails on critical data size', () => {
    const report = runHardeningCheck({ ...HEALTHY_INPUT, dataWarningLevel: 'critical' });
    const item = report.items.find((i) => i.id === 'data');
    expect(item?.status).toBe('fail');
  });

  it('score decreases with failures', () => {
    const healthy = runHardeningCheck(HEALTHY_INPUT);
    const unhealthy = runHardeningCheck({
      ...HEALTHY_INPUT,
      testsPass: false,
      emergencyStopActive: true,
      conscienceEnabled: false,
    });
    expect(unhealthy.score).toBeLessThan(healthy.score);
    expect(unhealthy.overallStatus).toBe('fail');
  });

  it('returns checkedAt timestamp', () => {
    const before = Date.now();
    const report = runHardeningCheck(HEALTHY_INPUT);
    expect(report.checkedAt).toBeGreaterThanOrEqual(before);
    expect(report.checkedAt).toBeLessThanOrEqual(Date.now());
  });
});
