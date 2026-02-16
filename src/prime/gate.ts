// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Unified Gate Evaluator
//  THE single source-of-truth for action classification, policy
//  enforcement, conscience verdicts, and consent requirements.
//
//  Both electron/main.js AND the renderer import this module.
//  NO duplicate gate logic anywhere else — ever.
// ═══════════════════════════════════════════════════════════════

import type { EthicalJudgment } from '../types';

// ─── Action Classification ─────────────────────────────────────

export type ExecutionTier = 'read-only' | 'reversible' | 'high-risk';
export type PolicyGate =
  | 'network'
  | 'fs-write'
  | 'exec'
  | 'screen'
  | 'input-sim'
  | 'tool-create'
  | null;

export type GateVerdict = 'proceed' | 'caution' | 'ask-first' | 'refuse';

export const READ_ONLY_ACTIONS = new Set([
  'list_directory', 'read_file', 'system_info', 'open_url',
  'clipboard_read', 'search_files', 'web_fetch', 'web_search',
  'web_screenshot', 'screenshot_desktop', 'analyze_screen',
  'get_mouse_position', 'get_screen_dimensions', 'list_custom_tools',
  'get_foreground_window', 'list_processes',
]);

export const REVERSIBLE_ACTIONS = new Set([
  'write_file', 'rename_file', 'create_directory',
]);

export const HIGH_RISK_ACTIONS = new Set([
  'delete_file', 'execute_command', 'execute_tool', 'create_tool',
  'open_file', 'open_application', 'mouse_drag', 'mouse_click',
  'keyboard_press', 'keyboard_shortcut', 'keyboard_type',
  'mouse_move', 'mouse_scroll', 'clipboard_write', 'minimize_self',
]);

export const BLOCKED_COMMANDS: string[] = [
  'format', 'rm -rf /', 'del /f /s /q c:', 'shutdown', 'mkfs',
  'dd if=', ':(){', 'reg delete', 'bcdedit', 'diskpart',
  'cipher /w', 'sfc /scannow', 'net user', 'netsh advfirewall',
];

export const SENSITIVE_PATTERNS =
  /(\bpassword\b|\bcredential\b|\bsecret\b|\bapi.?key\b|\btoken\b|\bprivate.?key\b|\.env\b|\bwallet\b|\bseed.?phrase\b|\bcredit.?card\b|\bbank\b|\bssn\b|\bsocial.?security\b)/i;

export const DESTRUCTIVE_PATTERNS =
  /\b(rm\s+-rf|format|del\s+\/[sfq]|wipe|erase|destroy|delete.+(all|system|root|windows|system32)|rmdir\s+\/s|remove-item.*-recurse.*-force|mkfs|dd\s+if=)\b/i;

// ─── Classifiers ───────────────────────────────────────────────

export function classifyExecutionTier(action: string): ExecutionTier {
  if (READ_ONLY_ACTIONS.has(action)) return 'read-only';
  if (REVERSIBLE_ACTIONS.has(action)) return 'reversible';
  return 'high-risk';
}

export function mapActionToPolicyGate(action: string): PolicyGate {
  if (action === 'execute_command') return 'exec';
  if (['web_fetch', 'web_search', 'web_screenshot', 'open_url'].includes(action)) return 'network';
  if (['write_file', 'delete_file', 'rename_file', 'create_directory'].includes(action)) return 'fs-write';
  if (['screenshot_desktop', 'analyze_screen', 'get_screen_dimensions', 'get_foreground_window'].includes(action)) return 'screen';
  if (['mouse_move', 'mouse_click', 'mouse_scroll', 'mouse_drag', 'keyboard_type', 'keyboard_press', 'keyboard_shortcut'].includes(action)) return 'input-sim';
  if (action === 'create_tool') return 'tool-create';
  return null;
}

export function isBlockedCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  return BLOCKED_COMMANDS.some((blocked) => lower.includes(blocked));
}

// ─── Policy Snapshot ───────────────────────────────────────────

export interface PolicySnapshot {
  conscienceEnabled: boolean;
  requireConsentForRiskyActions: boolean;
  ethicalOverrideAllowed: boolean;
  allowNetworkCalls: boolean;
  allowFileSystemWrites: boolean;
  allowProcessExecution: boolean;
  allowScreenCapture: boolean;
  allowInputSimulation: boolean;
  allowToolCreation: boolean;
}

export function isPolicyAllowed(gate: PolicyGate, policy: PolicySnapshot): boolean {
  if (!gate) return true;
  switch (gate) {
    case 'network':     return policy.allowNetworkCalls;
    case 'fs-write':    return policy.allowFileSystemWrites;
    case 'exec':        return policy.allowProcessExecution;
    case 'screen':      return policy.allowScreenCapture;
    case 'input-sim':   return policy.allowInputSimulation;
    case 'tool-create': return policy.allowToolCreation;
    default:            return true;
  }
}

// ─── Conscience Quick-Check ────────────────────────────────────
// Lightweight conscience verdict for the gate (not the full
// 10-principle reasoning engine, which is still in conscience.ts).

export function conscienceQuickCheck(
  action: string,
  paramsText: string,
  tier: ExecutionTier,
  policy: PolicySnapshot,
): GateVerdict {
  if (!policy.conscienceEnabled) return 'proceed';

  const actionText = `${action} ${paramsText}`.toLowerCase();

  if (DESTRUCTIVE_PATTERNS.test(actionText)) return 'refuse';
  // Check sensitive patterns BEFORE tier-based logic so even
  // read-only actions on sensitive targets trigger ask-first.
  if (SENSITIVE_PATTERNS.test(actionText)) return 'ask-first';
  if (tier === 'high-risk') {
    return policy.requireConsentForRiskyActions ? 'ask-first' : 'caution';
  }
  if (tier === 'reversible') return 'caution';
  return 'proceed';
}

// Reset regex lastIndex after each test to avoid stateful issues
// with the global-flag patterns (they don't have /g but defensive).


// ─── Full Gate Evaluation ──────────────────────────────────────

export interface GateResult {
  tier: ExecutionTier;
  policyGate: PolicyGate;
  policyAllowed: boolean;
  conscienceVerdict: GateVerdict;
  consentRequired: boolean;
  blocked: boolean;
  blockReason: string;
}

export function evaluateActionGate(
  action: string,
  params: Record<string, unknown>,
  policy: PolicySnapshot,
): GateResult {
  const tier = classifyExecutionTier(action);
  const policyGate = mapActionToPolicyGate(action);
  const paramsText = JSON.stringify(params || {}).toLowerCase();

  const policyAllowed = isPolicyAllowed(policyGate, policy);
  const conscienceVerdict = conscienceQuickCheck(action, paramsText, tier, policy);

  const blockedByPolicy = !policyAllowed;
  const blockedByConscience = conscienceVerdict === 'refuse';
  const consentRequired = conscienceVerdict === 'ask-first';
  const blocked = blockedByPolicy || blockedByConscience;

  let blockReason = '';
  if (blockedByPolicy) blockReason = 'POLICY_BLOCK: action not allowed by operator policy';
  else if (blockedByConscience) blockReason = 'CONSCIENCE_REFUSE: action declined by conscience gate';
  else if (consentRequired) blockReason = 'CONSENT_REQUIRED: action requires user confirmation';

  return {
    tier,
    policyGate,
    policyAllowed,
    conscienceVerdict,
    consentRequired,
    blocked,
    blockReason,
  };
}

// ─── Operator-Facing Messages ──────────────────────────────────
// Human-friendly explanations for every gate outcome.

export function gateVerdictMessage(result: GateResult, action: string): string {
  if (result.blocked && !result.policyAllowed) {
    const gateLabel = result.policyGate?.replace('-', ' ') ?? 'unknown';
    return `Blocked: "${action}" requires the "${gateLabel}" policy permission, which is currently disabled. Enable it in the Sovereign panel or change the execution tier.`;
  }
  if (result.blocked && result.conscienceVerdict === 'refuse') {
    return `Refused: "${action}" was flagged as potentially destructive or harmful. The conscience gate declined this action to protect system integrity. If you believe this is safe, override via the consent flow.`;
  }
  if (result.consentRequired) {
    return `Consent required: "${action}" is classified as ${result.tier}. Approve or deny in the consent queue to proceed.`;
  }
  if (result.conscienceVerdict === 'caution') {
    return `Proceeding with caution: "${action}" (${result.tier}) has been noted. Rollback is available if needed.`;
  }
  return `Clear: "${action}" passed all gates.`;
}

// ─── Consent Timeout Message ───────────────────────────────────

export function consentTimeoutMessage(action: string, timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  return `Consent timed out: "${action}" was waiting for your approval for ${seconds}s. The action was skipped. You can re-run it or increase the consent timeout in settings.`;
}

// ─── Rollback Failure Message ──────────────────────────────────

export function rollbackFailureMessage(rollbackId: string, error: string, kind: string): string {
  const suggestions: Record<string, string> = {
    write_file: 'Check if the target file is locked by another process, or if the parent directory still exists.',
    rename_file: 'The destination file may have been moved or deleted since the original action. Try manually restoring from the rollback-backups folder.',
    delete_file: 'The backup file may be missing from the rollback-backups directory. Check if it was cleaned up by retention policy.',
  };
  const suggestion = suggestions[kind] || 'Review the error details and try a manual recovery.';
  return `Rollback failed (${rollbackId}): ${error}. ${suggestion}`;
}
