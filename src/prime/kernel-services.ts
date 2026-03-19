import type { PolicySnapshot } from './gate';
import type { OwnerPolicy } from './policy';

export function policySnapshotFromOwnerPolicy(p: OwnerPolicy): PolicySnapshot {
  return {
    conscienceEnabled: p.conscienceEnabled,
    requireConsentForRiskyActions: p.requireConsentForRiskyActions,
    ethicalOverrideAllowed: p.ethicalOverrideAllowed,
    allowNetworkCalls: p.allowNetworkCalls,
    allowFileSystemWrites: p.allowFileSystemWrites,
    allowProcessExecution: p.allowProcessExecution,
    allowScreenCapture: p.allowScreenCapture,
    allowInputSimulation: p.allowInputSimulation,
    allowToolCreation: p.allowToolCreation,
    allowLimitedExecOnly: p.allowLimitedExecOnly,
  };
}

export function createKernelActionId(): string {
  return `kernel_action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatSubsystemError(scope: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return `[${scope}] ${msg}`;
}
