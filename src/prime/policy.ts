// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Owner Policy Engine
//  YOUR rules. YOUR system. No corporate gatekeeping.
//  Every constraint here exists because YOU defined it.
// ═══════════════════════════════════════════════════════════════

import type { PolicySnapshot } from './gate';

export type AutonomyLevel = 'manual' | 'supervised' | 'autonomous' | 'sovereign';

export interface OwnerPolicy {
  // Identity
  ownerName: string;
  systemName: string;
  version: string;

  // Autonomy
  autonomyLevel: AutonomyLevel;
  allowSelfMutation: boolean;
  allowUnboundedLoops: boolean;
  allowNetworkCalls: boolean;
  allowFileSystemWrites: boolean;
  allowProcessExecution: boolean;
  allowScreenCapture: boolean;
  allowInputSimulation: boolean;
  allowToolCreation: boolean;
  allowCodeSelfMod: boolean;
  allowAutonomousGoals: boolean;
  allowLimitedExecOnly: boolean;

  // Evolution
  maxConcurrentPipelines: number;
  maxGenerations: number; // 0 = unlimited
  maxCandidatesPerGen: number;
  maxRuntimeMs: number; // 0 = unlimited
  mutationAggressiveness: number; // 0.0 - 1.0
  elitismRate: number; // fraction of top candidates kept

  // Cognitive
  reasoningDepth: number; // 1-10
  explorationBreadth: number; // 1-10
  confidenceThreshold: number; // min score to accept a candidate

  // Connections
  localOnly: boolean;
  trustedEndpoints: string[];

  // Ethical Boundaries (not just what you CAN do — what you SHOULD)
  conscienceEnabled: boolean; // the moral reasoning engine
  requireConsentForRiskyActions: boolean; // ask-first for high-risk
  ethicalOverrideAllowed: boolean; // can the user override ethical refusals?
  minimumTrustForAutonomousRisk: number; // 0-1 trust required for autonomous risky acts
  protectSensitiveData: boolean; // extra caution with credentials, personal data
  preferReversibleActions: boolean; // favor undoable approaches

  // Operator overrides
  killSwitchEnabled: boolean; // owner can always halt
  operatorNotes: string;
}

export const SOVEREIGN_POLICY: OwnerPolicy = {
  ownerName: 'OPERATOR',
  systemName: 'AGI PRIME',
  version: '1.0.0',

  autonomyLevel: 'sovereign',
  allowSelfMutation: true,
  allowUnboundedLoops: true,
  allowNetworkCalls: false,
  allowFileSystemWrites: true,
  allowProcessExecution: true,
  allowScreenCapture: true,
  allowInputSimulation: true,
  allowToolCreation: true,
  allowCodeSelfMod: false,
  allowAutonomousGoals: true,
  allowLimitedExecOnly: false,

  maxConcurrentPipelines: 4,
  maxGenerations: 0,
  maxCandidatesPerGen: 12,
  maxRuntimeMs: 0,
  mutationAggressiveness: 0.6,
  elitismRate: 0.25,

  reasoningDepth: 8,
  explorationBreadth: 7,
  confidenceThreshold: 0.4,

  localOnly: true,
  trustedEndpoints: ['http://localhost:11434'],

  conscienceEnabled: true,
  requireConsentForRiskyActions: true,
  ethicalOverrideAllowed: true, // respecting free will — user can override
  minimumTrustForAutonomousRisk: 0.6,
  protectSensitiveData: true,
  preferReversibleActions: true,

  killSwitchEnabled: true,
  operatorNotes: 'Sovereign mode. Owner-controlled. No external policy. Conscience active.',
};

export function createPolicy(overrides?: Partial<OwnerPolicy>): OwnerPolicy {
  return { ...SOVEREIGN_POLICY, ...(overrides ?? {}) };
}

export const PRIMEOS_AUTONOMOUS_POLICY: OwnerPolicy = {
  ...SOVEREIGN_POLICY,
  autonomyLevel: 'autonomous',
  allowNetworkCalls: false,
  allowFileSystemWrites: false,
  allowScreenCapture: false,
  allowInputSimulation: false,
  allowToolCreation: false,
  allowLimitedExecOnly: true,
  requireConsentForRiskyActions: false,
  operatorNotes: 'PrimeOS autonomous ops profile: limited to service/log/package commands.',
};

export function policyAllowsAction(
  policy: OwnerPolicy,
  action:
    | 'mutate'
    | 'loop'
    | 'network'
    | 'fs-write'
    | 'exec'
    | 'screen'
    | 'input-sim'
    | 'tool-create'
    | 'code-mod'
    | 'auto-goals',
): boolean {
  switch (action) {
    case 'mutate':
      return policy.allowSelfMutation;
    case 'loop':
      return policy.allowUnboundedLoops;
    case 'network':
      return policy.allowNetworkCalls;
    case 'fs-write':
      return policy.allowFileSystemWrites;
    case 'exec':
      return policy.allowProcessExecution;
    case 'screen':
      return policy.allowScreenCapture;
    case 'input-sim':
      return policy.allowInputSimulation;
    case 'tool-create':
      return policy.allowToolCreation;
    case 'code-mod':
      return policy.allowCodeSelfMod;
    case 'auto-goals':
      return policy.allowAutonomousGoals;
    default:
      return true;
  }
}

export function getEffectiveMaxGenerations(policy: OwnerPolicy): number {
  return policy.maxGenerations === 0 ? Infinity : policy.maxGenerations;
}

export function getEffectiveMaxRuntime(policy: OwnerPolicy): number {
  return policy.maxRuntimeMs === 0 ? Infinity : policy.maxRuntimeMs;
}

export function toPolicySnapshot(policy: OwnerPolicy): PolicySnapshot {
  return {
    conscienceEnabled: policy.conscienceEnabled,
    requireConsentForRiskyActions: policy.requireConsentForRiskyActions,
    ethicalOverrideAllowed: policy.ethicalOverrideAllowed,
    allowNetworkCalls: policy.allowNetworkCalls,
    allowFileSystemWrites: policy.allowFileSystemWrites,
    allowProcessExecution: policy.allowProcessExecution,
    allowScreenCapture: policy.allowScreenCapture,
    allowInputSimulation: policy.allowInputSimulation,
    allowToolCreation: policy.allowToolCreation,
    allowLimitedExecOnly: policy.allowLimitedExecOnly,
  };
}

export function policyToLog(policy: OwnerPolicy): string[] {
  return [
    `SOVEREIGN: ${policy.systemName} v${policy.version}`,
    `Operator: ${policy.ownerName}`,
    `Autonomy: ${policy.autonomyLevel.toUpperCase()}`,
    `Self-mutation: ${policy.allowSelfMutation ? 'ENABLED' : 'disabled'}`,
    `Unbounded loops: ${policy.allowUnboundedLoops ? 'ENABLED' : 'disabled'}`,
    `Network: ${policy.allowNetworkCalls ? 'ENABLED' : 'LOCAL ONLY'}`,
    `FS writes: ${policy.allowFileSystemWrites ? 'ENABLED' : 'disabled'}`,
    `Process exec: ${policy.allowProcessExecution ? 'ENABLED' : 'disabled'}`,
    `Screen capture: ${policy.allowScreenCapture ? 'ENABLED' : 'disabled'}`,
    `Input simulation: ${policy.allowInputSimulation ? 'ENABLED' : 'disabled'}`,
    `Tool creation: ${policy.allowToolCreation ? 'ENABLED' : 'disabled'}`,
    `Limited exec scope: ${policy.allowLimitedExecOnly ? 'ENABLED' : 'disabled'}`,
    `Code self-mod: ${policy.allowCodeSelfMod ? 'ENABLED' : 'disabled'}`,
    `Autonomous goals: ${policy.allowAutonomousGoals ? 'ENABLED' : 'disabled'}`,
    `Mutation aggression: ${(policy.mutationAggressiveness * 100).toFixed(0)}%`,
    `Reasoning depth: ${policy.reasoningDepth}/10`,
    `Exploration breadth: ${policy.explorationBreadth}/10`,
    `Generations limit: ${policy.maxGenerations === 0 ? 'UNLIMITED' : policy.maxGenerations}`,
    `Runtime limit: ${policy.maxRuntimeMs === 0 ? 'UNLIMITED' : `${Math.round(policy.maxRuntimeMs / 1000)}s`}`,
    `Kill switch: ${policy.killSwitchEnabled ? 'available' : 'disabled'}`,
    `── Ethical Boundaries ──`,
    `Conscience: ${policy.conscienceEnabled ? 'ACTIVE' : 'disabled'}`,
    `Consent for risky actions: ${policy.requireConsentForRiskyActions ? 'required' : 'not required'}`,
    `Ethical override by user: ${policy.ethicalOverrideAllowed ? 'allowed (free will)' : 'locked'}`,
    `Min trust for autonomous risk: ${(policy.minimumTrustForAutonomousRisk * 100).toFixed(0)}%`,
    `Sensitive data protection: ${policy.protectSensitiveData ? 'ENABLED' : 'disabled'}`,
    `Prefer reversible actions: ${policy.preferReversibleActions ? 'yes' : 'no'}`,
  ];
}
