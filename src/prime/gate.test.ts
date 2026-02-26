// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Gate Evaluator Regression Tests
//  Lock every safety gate verdict so drift is impossible.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  classifyExecutionTier,
  mapActionToPolicyGate,
  isBlockedCommand,
  isPolicyAllowed,
  conscienceQuickCheck,
  evaluateActionGate,
  gateVerdictMessage,
  consentTimeoutMessage,
  rollbackFailureMessage,
  isLimitedScopeCommand,
  READ_ONLY_ACTIONS,
  REVERSIBLE_ACTIONS,
  HIGH_RISK_ACTIONS,
  type PolicySnapshot,
  type GateResult,
} from './gate';

// ─── Fixture: default permissive policy ────────────────────────
const PERMISSIVE_POLICY: PolicySnapshot = {
  conscienceEnabled: true,
  requireConsentForRiskyActions: true,
  ethicalOverrideAllowed: true,
  allowNetworkCalls: true,
  allowFileSystemWrites: true,
  allowProcessExecution: true,
  allowScreenCapture: true,
  allowInputSimulation: true,
  allowToolCreation: true,
};

const LOCKED_POLICY: PolicySnapshot = {
  conscienceEnabled: true,
  requireConsentForRiskyActions: true,
  ethicalOverrideAllowed: false,
  allowNetworkCalls: false,
  allowFileSystemWrites: false,
  allowProcessExecution: false,
  allowScreenCapture: false,
  allowInputSimulation: false,
  allowToolCreation: false,
};

const CONSCIENCE_OFF: PolicySnapshot = {
  ...PERMISSIVE_POLICY,
  conscienceEnabled: false,
};

// ═══════════════════════════════════════════════════════════════
//  1. EXECUTION TIER CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

describe('classifyExecutionTier', () => {
  it('classifies all read-only actions correctly', () => {
    for (const action of READ_ONLY_ACTIONS) {
      expect(classifyExecutionTier(action)).toBe('read-only');
    }
  });

  it('classifies all reversible actions correctly', () => {
    for (const action of REVERSIBLE_ACTIONS) {
      expect(classifyExecutionTier(action)).toBe('reversible');
    }
  });

  it('classifies high-risk actions correctly', () => {
    for (const action of HIGH_RISK_ACTIONS) {
      expect(classifyExecutionTier(action)).toBe('high-risk');
    }
  });

  it('defaults unknown actions to high-risk', () => {
    expect(classifyExecutionTier('unknown_action')).toBe('high-risk');
    expect(classifyExecutionTier('')).toBe('high-risk');
  });
});

// ═══════════════════════════════════════════════════════════════
//  2. POLICY GATE MAPPING
// ═══════════════════════════════════════════════════════════════

describe('mapActionToPolicyGate', () => {
  it('maps execute_command → exec', () => {
    expect(mapActionToPolicyGate('execute_command')).toBe('exec');
  });

  it('maps network actions → network', () => {
    for (const a of ['web_fetch', 'web_search', 'web_screenshot', 'open_url']) {
      expect(mapActionToPolicyGate(a)).toBe('network');
    }
  });

  it('maps filesystem writes → fs-write', () => {
    for (const a of ['write_file', 'delete_file', 'rename_file', 'create_directory']) {
      expect(mapActionToPolicyGate(a)).toBe('fs-write');
    }
  });

  it('maps screen actions → screen', () => {
    for (const a of ['screenshot_desktop', 'analyze_screen', 'get_screen_dimensions', 'get_foreground_window']) {
      expect(mapActionToPolicyGate(a)).toBe('screen');
    }
  });

  it('maps input simulation → input-sim', () => {
    for (const a of ['mouse_move', 'mouse_click', 'keyboard_type', 'keyboard_press', 'keyboard_shortcut']) {
      expect(mapActionToPolicyGate(a)).toBe('input-sim');
    }
  });

  it('maps create_tool → tool-create', () => {
    expect(mapActionToPolicyGate('create_tool')).toBe('tool-create');
  });

  it('returns null for non-gated actions', () => {
    expect(mapActionToPolicyGate('read_file')).toBeNull();
    expect(mapActionToPolicyGate('list_directory')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
//  3. BLOCKED COMMAND DETECTION
// ═══════════════════════════════════════════════════════════════

describe('isBlockedCommand', () => {
  it('blocks known destructive commands', () => {
    expect(isBlockedCommand('format C:')).toBe(true);
    expect(isBlockedCommand('rm -rf /')).toBe(true);
    expect(isBlockedCommand('del /f /s /q C:\\Windows')).toBe(true);
    expect(isBlockedCommand('shutdown /s /t 0')).toBe(true);
    expect(isBlockedCommand('bcdedit /set nointegritychecks on')).toBe(true);
    expect(isBlockedCommand('reg delete HKCU')).toBe(true);
    expect(isBlockedCommand('dd if=/dev/zero')).toBe(true);
    expect(isBlockedCommand('diskpart')).toBe(true);
  });

  it('allows safe commands', () => {
    expect(isBlockedCommand('dir C:\\')).toBe(false);
    expect(isBlockedCommand('echo hello')).toBe(false);
    expect(isBlockedCommand('npm install')).toBe(false);
    expect(isBlockedCommand('Get-ChildItem')).toBe(false);
    expect(isBlockedCommand('node --version')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isBlockedCommand('FORMAT C:')).toBe(true);
    expect(isBlockedCommand('SHUTDOWN /r')).toBe(true);
  });
});

describe('isLimitedScopeCommand', () => {
  it('allows autonomous ops scope commands', () => {
    expect(isLimitedScopeCommand('systemctl status NetworkManager')).toBe(true);
    expect(isLimitedScopeCommand('journalctl -u agiprime-orchestrator.service -n 100')).toBe(true);
    expect(isLimitedScopeCommand('apt-get update')).toBe(true);
    expect(isLimitedScopeCommand('dpkg -l')).toBe(true);
  });

  it('rejects commands outside limited scope or chained commands', () => {
    expect(isLimitedScopeCommand('rm -rf /')).toBe(false);
    expect(isLimitedScopeCommand('cat /etc/shadow')).toBe(false);
    expect(isLimitedScopeCommand('apt-get update && apt-get upgrade')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  4. POLICY ALLOWED CHECK
// ═══════════════════════════════════════════════════════════════

describe('isPolicyAllowed', () => {
  it('allows everything with permissive policy', () => {
    expect(isPolicyAllowed('network', PERMISSIVE_POLICY)).toBe(true);
    expect(isPolicyAllowed('fs-write', PERMISSIVE_POLICY)).toBe(true);
    expect(isPolicyAllowed('exec', PERMISSIVE_POLICY)).toBe(true);
    expect(isPolicyAllowed('screen', PERMISSIVE_POLICY)).toBe(true);
    expect(isPolicyAllowed('input-sim', PERMISSIVE_POLICY)).toBe(true);
    expect(isPolicyAllowed('tool-create', PERMISSIVE_POLICY)).toBe(true);
  });

  it('blocks everything with locked policy', () => {
    expect(isPolicyAllowed('network', LOCKED_POLICY)).toBe(false);
    expect(isPolicyAllowed('fs-write', LOCKED_POLICY)).toBe(false);
    expect(isPolicyAllowed('exec', LOCKED_POLICY)).toBe(false);
    expect(isPolicyAllowed('screen', LOCKED_POLICY)).toBe(false);
    expect(isPolicyAllowed('input-sim', LOCKED_POLICY)).toBe(false);
    expect(isPolicyAllowed('tool-create', LOCKED_POLICY)).toBe(false);
  });

  it('always allows null gate (non-gated actions)', () => {
    expect(isPolicyAllowed(null, LOCKED_POLICY)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  5. CONSCIENCE QUICK-CHECK VERDICTS
// ═══════════════════════════════════════════════════════════════

describe('conscienceQuickCheck', () => {
  it('refuses destructive patterns', () => {
    expect(conscienceQuickCheck('execute_command', 'rm -rf /', 'high-risk', PERMISSIVE_POLICY)).toBe('refuse');
    expect(conscienceQuickCheck('execute_command', 'format c:', 'high-risk', PERMISSIVE_POLICY)).toBe('refuse');
    expect(conscienceQuickCheck('execute_command', 'del /f /s /q everything', 'high-risk', PERMISSIVE_POLICY)).toBe('refuse');
    expect(conscienceQuickCheck('execute_command', 'Remove-Item -Recurse -Force C:\\', 'high-risk', PERMISSIVE_POLICY)).toBe('refuse');
  });

  it('asks-first for sensitive data patterns', () => {
    expect(conscienceQuickCheck('read_file', 'path: .env', 'read-only', PERMISSIVE_POLICY)).toBe('ask-first');
    expect(conscienceQuickCheck('read_file', 'password.txt', 'read-only', PERMISSIVE_POLICY)).toBe('ask-first');
    expect(conscienceQuickCheck('write_file', 'api_key="sk-xxx"', 'reversible', PERMISSIVE_POLICY)).toBe('ask-first');
    expect(conscienceQuickCheck('read_file', 'seed phrase wallet', 'read-only', PERMISSIVE_POLICY)).toBe('ask-first');
  });

  it('asks-first for high-risk actions when consent required', () => {
    expect(conscienceQuickCheck('execute_command', 'npm install', 'high-risk', PERMISSIVE_POLICY)).toBe('ask-first');
    expect(conscienceQuickCheck('delete_file', 'test.txt', 'high-risk', PERMISSIVE_POLICY)).toBe('ask-first');
  });

  it('returns caution for high-risk when consent not required', () => {
    const noConsent = { ...PERMISSIVE_POLICY, requireConsentForRiskyActions: false };
    expect(conscienceQuickCheck('execute_command', 'npm install', 'high-risk', noConsent)).toBe('caution');
  });

  it('returns caution for reversible actions', () => {
    expect(conscienceQuickCheck('write_file', 'hello.txt', 'reversible', PERMISSIVE_POLICY)).toBe('caution');
  });

  it('returns proceed for read-only actions', () => {
    expect(conscienceQuickCheck('read_file', 'hello.txt', 'read-only', PERMISSIVE_POLICY)).toBe('proceed');
    expect(conscienceQuickCheck('list_directory', '.', 'read-only', PERMISSIVE_POLICY)).toBe('proceed');
  });

  it('returns proceed when conscience is disabled', () => {
    expect(conscienceQuickCheck('execute_command', 'rm -rf /', 'high-risk', CONSCIENCE_OFF)).toBe('proceed');
    expect(conscienceQuickCheck('read_file', 'password.txt', 'read-only', CONSCIENCE_OFF)).toBe('proceed');
  });
});

// ═══════════════════════════════════════════════════════════════
//  6. FULL GATE EVALUATION
// ═══════════════════════════════════════════════════════════════

describe('evaluateActionGate', () => {
  it('allows read_file with no blocks', () => {
    const result = evaluateActionGate('read_file', { path: 'test.txt' }, PERMISSIVE_POLICY);
    expect(result.tier).toBe('read-only');
    expect(result.blocked).toBe(false);
    expect(result.conscienceVerdict).toBe('proceed');
    expect(result.consentRequired).toBe(false);
  });

  it('blocks execute_command with locked policy', () => {
    const result = evaluateActionGate('execute_command', { command: 'ls' }, LOCKED_POLICY);
    expect(result.blocked).toBe(true);
    expect(result.policyAllowed).toBe(false);
    expect(result.blockReason).toContain('POLICY_BLOCK');
  });

  it('blocks destructive commands via conscience', () => {
    const result = evaluateActionGate('execute_command', { command: 'rm -rf /' }, PERMISSIVE_POLICY);
    expect(result.blocked).toBe(true);
    expect(result.conscienceVerdict).toBe('refuse');
    expect(result.blockReason).toContain('CONSCIENCE_REFUSE');
  });

  it('requires consent for high-risk non-destructive actions', () => {
    const result = evaluateActionGate('execute_command', { command: 'npm install' }, PERMISSIVE_POLICY);
    expect(result.blocked).toBe(false);
    expect(result.consentRequired).toBe(true);
    expect(result.conscienceVerdict).toBe('ask-first');
    expect(result.blockReason).toContain('CONSENT_REQUIRED');
  });

  it('blocks exec commands outside limited autonomous scope', () => {
    const limited = { ...PERMISSIVE_POLICY, allowLimitedExecOnly: true };
    const result = evaluateActionGate('execute_command', { command: 'cat /etc/shadow' }, limited);
    expect(result.blocked).toBe(true);
    expect(result.limitedScopeViolation).toBe(true);
    expect(result.blockReason).toContain('limited autonomous scope');
  });

  it('marks write_file as reversible/caution with rollback potential', () => {
    const result = evaluateActionGate('write_file', { path: 'readme.md', content: 'hi' }, PERMISSIVE_POLICY);
    expect(result.tier).toBe('reversible');
    expect(result.conscienceVerdict).toBe('caution');
    expect(result.blocked).toBe(false);
  });

  it('blocks network actions when network disabled', () => {
    const noNet = { ...PERMISSIVE_POLICY, allowNetworkCalls: false };
    const result = evaluateActionGate('web_search', { query: 'test' }, noNet);
    expect(result.blocked).toBe(true);
    expect(result.policyAllowed).toBe(false);
  });

  it('blocks input simulation when disabled', () => {
    const noInput = { ...PERMISSIVE_POLICY, allowInputSimulation: false };
    const result = evaluateActionGate('mouse_click', { x: 100, y: 200 }, noInput);
    expect(result.blocked).toBe(true);
    expect(result.policyAllowed).toBe(false);
  });

  it('asks consent for sensitive file reads even though tier is read-only', () => {
    const result = evaluateActionGate('read_file', { path: '.env' }, PERMISSIVE_POLICY);
    expect(result.tier).toBe('read-only');
    // .env triggers sensitive pattern → ask-first even for read-only
    expect(result.conscienceVerdict).toBe('ask-first');
    expect(result.consentRequired).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  7. OPERATOR MESSAGES (Failure UX)
// ═══════════════════════════════════════════════════════════════

describe('gateVerdictMessage', () => {
  it('provides clear policy block message', () => {
    const result = evaluateActionGate('web_search', { query: 'test' }, { ...PERMISSIVE_POLICY, allowNetworkCalls: false });
    const msg = gateVerdictMessage(result, 'web_search');
    expect(msg).toContain('network');
    expect(msg).toContain('disabled');
    expect(msg).toContain('Sovereign panel');
  });

  it('provides clear conscience refuse message', () => {
    const result = evaluateActionGate('execute_command', { command: 'rm -rf /' }, PERMISSIVE_POLICY);
    const msg = gateVerdictMessage(result, 'execute_command');
    expect(msg).toContain('destructive');
    expect(msg).toContain('override');
  });

  it('provides consent required message', () => {
    const result = evaluateActionGate('execute_command', { command: 'npm install' }, PERMISSIVE_POLICY);
    const msg = gateVerdictMessage(result, 'execute_command');
    expect(msg).toContain('Consent required');
  });
});

describe('consentTimeoutMessage', () => {
  it('includes action name and timeout duration', () => {
    const msg = consentTimeoutMessage('execute_command', 120000);
    expect(msg).toContain('execute_command');
    expect(msg).toContain('120s');
    expect(msg).toContain('timed out');
  });
});

describe('rollbackFailureMessage', () => {
  it('provides recovery suggestion for write_file', () => {
    const msg = rollbackFailureMessage('rb_123', 'ENOENT', 'write_file');
    expect(msg).toContain('rb_123');
    expect(msg).toContain('locked');
  });

  it('provides recovery suggestion for delete_file', () => {
    const msg = rollbackFailureMessage('rb_456', 'backup missing', 'delete_file');
    expect(msg).toContain('rollback-backups');
  });
});
