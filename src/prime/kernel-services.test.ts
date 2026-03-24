import { describe, it, expect } from 'vitest';
import { policySnapshotFromOwnerPolicy, createKernelActionId, formatSubsystemError } from './kernel-services';
import { SOVEREIGN_POLICY } from './policy';

describe('kernel-services', () => {
  it('extracts PolicySnapshot from OwnerPolicy', () => {
    const snap = policySnapshotFromOwnerPolicy(SOVEREIGN_POLICY);
    expect(snap.conscienceEnabled).toBe(SOVEREIGN_POLICY.conscienceEnabled);
    expect(snap.allowNetworkCalls).toBe(SOVEREIGN_POLICY.allowNetworkCalls);
    expect(snap.allowFileSystemWrites).toBe(SOVEREIGN_POLICY.allowFileSystemWrites);
    expect(snap.allowProcessExecution).toBe(SOVEREIGN_POLICY.allowProcessExecution);
    expect(snap.allowScreenCapture).toBe(SOVEREIGN_POLICY.allowScreenCapture);
    expect(snap.allowInputSimulation).toBe(SOVEREIGN_POLICY.allowInputSimulation);
    expect(snap.allowToolCreation).toBe(SOVEREIGN_POLICY.allowToolCreation);
    expect('ownerName' in snap).toBe(false);
  });

  it('generates unique kernel action ids', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createKernelActionId()));
    expect(ids.size).toBe(20);
  });

  it('formats subsystem errors consistently', () => {
    expect(formatSubsystemError('voice', new Error('timeout'))).toBe('[voice] timeout');
    expect(formatSubsystemError('memory', 'disk full')).toBe('[memory] disk full');
  });
});
