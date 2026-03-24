const { ipcMain } = require('electron');
const { exec } = require('child_process');
const ctx = require('../ctx');

const ORCHESTRATOR_RUNBOOK_ACTIONS = {
  service_status: {
    command: 'systemctl status agiprime-orchestrator.service --no-pager',
    description: 'Read orchestrator service status',
    highImpact: false,
    requiredRole: 'observer',
  },
  service_restart: {
    command: 'systemctl restart agiprime-orchestrator.service',
    description: 'Restart orchestrator service',
    highImpact: true,
    requiredRole: 'operator',
  },
  logs_tail: {
    command: 'journalctl -u agiprime-orchestrator.service -n 120 --no-pager',
    description: 'Tail orchestrator logs',
    highImpact: false,
    requiredRole: 'observer',
  },
  apt_update: {
    command: 'apt-get update',
    description: 'Refresh apt package index',
    highImpact: true,
    requiredRole: 'maintainer',
  },
  disk_health: {
    command: 'df -h',
    description: 'Show disk usage',
    highImpact: false,
    requiredRole: 'observer',
  },
  memory_health: {
    command: 'free -h',
    description: 'Show memory usage',
    highImpact: false,
    requiredRole: 'observer',
  },
};

function roleRank(role) {
  if (role === 'maintainer') return 3;
  if (role === 'operator') return 2;
  return 1;
}

function issueRunbookConfirmation(actionId, ttlMs = 30000) {
  const token = `rbcf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Date.now() + ttlMs;
  ctx.pendingRunbookConfirmations.set(token, {
    actionId,
    expiresAt,
  });
  return { token, expiresAt };
}

function consumeRunbookConfirmation(token, actionId) {
  if (!token || !ctx.pendingRunbookConfirmations.has(token)) return false;
  const entry = ctx.pendingRunbookConfirmations.get(token);
  ctx.pendingRunbookConfirmations.delete(token);
  if (!entry) return false;
  if (entry.actionId !== actionId) return false;
  if (Date.now() > Number(entry.expiresAt || 0)) return false;
  return true;
}

function applyOrchestratorProfile(profile) {
  const { applyOwnerDirectProfile } = require('../hands/controller');
  const normalized = String(profile || '').trim().toLowerCase();
  if (normalized === 'owner-direct') {
    Object.assign(ctx.runtimeControls, applyOwnerDirectProfile(ctx.runtimeControls));
    ctx.orchestratorState.profile = 'owner-direct';
    return;
  }

  if (normalized === 'manual-operator') {
    Object.assign(ctx.runtimeControls, {
      autonomyLevel: 'manual',
      consentMode: 'manual',
      requireConsentForRiskyActions: true,
      allowNetworkCalls: false,
      allowFileSystemWrites: false,
      allowProcessExecution: false,
      allowScreenCapture: false,
      allowInputSimulation: false,
      allowToolCreation: false,
      allowLimitedExecOnly: true,
      executionTierLimit: 'read-only',
    });
    ctx.orchestratorState.profile = 'manual-operator';
    return;
  }

  if (normalized === 'autonomous-limited') {
    Object.assign(ctx.runtimeControls, {
      autonomyLevel: 'autonomous',
      consentMode: 'auto',
      requireConsentForRiskyActions: false,
      allowNetworkCalls: false,
      allowFileSystemWrites: false,
      allowProcessExecution: true,
      allowScreenCapture: false,
      allowInputSimulation: false,
      allowToolCreation: false,
      allowLimitedExecOnly: true,
      executionTierLimit: 'high-risk',
    });
    ctx.orchestratorState.profile = 'autonomous-limited';
    return;
  }

  Object.assign(ctx.runtimeControls, {
    autonomyLevel: 'sovereign',
    consentMode: 'ask-first',
    requireConsentForRiskyActions: true,
    allowNetworkCalls: ctx.settings?.allowNetworkCalls ?? true,
    allowFileSystemWrites: ctx.settings?.allowFileSystemWrites ?? true,
    allowProcessExecution: ctx.settings?.allowProcessExecution ?? true,
    allowScreenCapture: ctx.settings?.allowScreenCapture ?? true,
    allowInputSimulation: ctx.settings?.allowInputSimulation ?? true,
    allowToolCreation: ctx.settings?.allowToolCreation ?? true,
    allowLimitedExecOnly: false,
    executionTierLimit: 'high-risk',
  });
  ctx.orchestratorState.profile = 'sovereign-desktop';
}

function register() {
  ctx.applyOrchestratorProfile = applyOrchestratorProfile;

  ipcMain.handle('orchestrator:status', async () => {
    const status = {
      ...ctx.orchestratorState,
      uptimeMs: Date.now() - ctx.orchestratorState.startedAt,
      mode: ctx.DAEMON_MODE ? 'daemon' : 'desktop',
      runtimeControls: { ...ctx.runtimeControls },
    };
    return {
      success: true,
      state: status,
    };
  });

  ipcMain.handle('orchestrator:setRunbookRole', async (_, role) => {
    try {
      const normalized = String(role || '').trim().toLowerCase();
      if (!['observer', 'operator', 'maintainer'].includes(normalized)) {
        return { success: false, error: 'Invalid runbook role' };
      }
      ctx.orchestratorState.runbookRole = normalized;
      ctx.appendAuditEvent('policy_change', 'orchestrator_runbook_role', `Runbook role set to ${normalized}`);
      ctx.emitOrchestratorEvent('policy_updated', { runbookRole: normalized }, 'operator');
      return { success: true, runbookRole: normalized };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('orchestrator:missionSnapshot', async (_, options = {}) => {
    try {
      const eventLimit = Number(options?.eventLimit ?? 120);
      const events = ctx.listOrchestratorEvents(eventLimit);
      const goals = Array.isArray(ctx.persistentGoals?.goals) ? ctx.persistentGoals.goals : [];
      const activeGoals = goals.filter((g) => g.status === 'active');
      const completedGoals = goals.filter((g) => g.status === 'completed');
      const blockedGoals = goals.filter((g) => g.status === 'blocked');
      const runs = ctx.listLedgerRuns().slice(0, 50);
      const runningRuns = runs.filter((r) => r.status === 'running').length;
      const completedRuns = runs.filter((r) => r.status === 'completed').length;
      const status = {
        ...ctx.orchestratorState,
        uptimeMs: Date.now() - ctx.orchestratorState.startedAt,
        mode: ctx.DAEMON_MODE ? 'daemon' : 'desktop',
        runtimeControls: { ...ctx.runtimeControls },
      };
      return {
        success: true,
        snapshot: {
          status,
          latestEvents: events,
          goals: {
            total: goals.length,
            active: activeGoals.length,
            completed: completedGoals.length,
            blocked: blockedGoals.length,
            topActive: activeGoals
              .sort((a, b) => (b.priority || 0) - (a.priority || 0))
              .slice(0, 5),
          },
          ledgers: {
            recentRuns: runs.slice(0, 10),
            runningRuns,
            completedRuns,
          },
          audit: ctx.summarizeAuditEntries(300),
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('orchestrator:listEvents', async (_, options = {}) => {
    try {
      const limit = Number(options?.limit ?? 200);
      return { success: true, events: ctx.listOrchestratorEvents(limit) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('orchestrator:exportEvents', async (_, options = {}) => {
    try {
      const result = ctx.exportOrchestratorEvents(options || {});
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('orchestrator:prepareRunbookAction', async (_, actionId) => {
    try {
      const key = String(actionId || '').trim();
      const action = ORCHESTRATOR_RUNBOOK_ACTIONS[key];
      if (!action) return { success: false, actionId: key, error: 'Unknown runbook action' };
      const currentRole = String(ctx.orchestratorState.runbookRole || 'observer');
      if (roleRank(currentRole) < roleRank(action.requiredRole || 'observer')) {
        return {
          success: false,
          actionId: key,
          error: `Role "${currentRole}" cannot run this action (requires ${action.requiredRole})`,
          requiredRole: action.requiredRole,
        };
      }
      if (!action.highImpact) {
        return { success: true, actionId: key, confirmationRequired: false };
      }
      const confirmation = issueRunbookConfirmation(key);
      return {
        success: true,
        actionId: key,
        confirmationRequired: true,
        token: confirmation.token,
        expiresAt: confirmation.expiresAt,
      };
    } catch (e) {
      return { success: false, actionId: String(actionId || ''), error: e.message };
    }
  });

  ipcMain.handle('orchestrator:runbookAction', async (_, actionId, options = {}) => {
    try {
      const key = String(actionId || '').trim();
      const action = ORCHESTRATOR_RUNBOOK_ACTIONS[key];
      if (!action) {
        return { success: false, actionId: key, error: 'Unknown runbook action' };
      }
      const currentRole = String(ctx.orchestratorState.runbookRole || 'observer');
      if (roleRank(currentRole) < roleRank(action.requiredRole || 'observer')) {
        ctx.appendAuditEvent('gate_block', 'orchestrator_runbook', `Blocked runbook action ${key}: role ${currentRole} below required ${action.requiredRole}`);
        ctx.emitOrchestratorEvent('action_blocked', { actionId: key, reason: 'insufficient_role', role: currentRole, requiredRole: action.requiredRole }, 'policy');
        return { success: false, actionId: key, error: `Insufficient runbook role: requires ${action.requiredRole}` };
      }
      if (action.highImpact) {
        const token = String(options?.confirmationToken || '');
        const ok = consumeRunbookConfirmation(token, key);
        if (!ok) {
          ctx.appendAuditEvent('gate_block', 'orchestrator_runbook', `Blocked high-impact runbook action ${key}: missing/invalid confirmation token`);
          ctx.emitOrchestratorEvent('action_blocked', { actionId: key, reason: 'missing_or_invalid_confirmation' }, 'policy');
          return { success: false, actionId: key, error: 'Confirmation required: call prepareRunbookAction and retry with token' };
        }
      }
      if (!ctx.isLimitedScopeExecCommand(action.command)) {
        ctx.appendAuditEvent('gate_block', 'orchestrator_runbook', `Blocked runbook action ${key}: command outside limited scope`);
        ctx.emitOrchestratorEvent('action_blocked', { actionId: key, reason: 'outside_limited_scope' }, 'policy');
        return { success: false, actionId: key, error: 'Runbook action blocked by limited scope policy' };
      }

      return await new Promise((resolve) => {
        exec(action.command, { timeout: 120000, maxBuffer: 10 * 1024 * 1024, shell: true }, (error, stdout, stderr) => {
          if (error) {
            ctx.appendAuditEvent('gate_block', 'orchestrator_runbook', `Runbook action failed ${key}: ${error.message}`);
            ctx.emitOrchestratorEvent('action_blocked', { actionId: key, reason: error.message }, 'executor');
            resolve({
              success: false,
              actionId: key,
              description: action.description,
              error: error.message,
              stderr: String(stderr || '').slice(0, 12000),
            });
            return;
          }

          ctx.appendAuditEvent('gate_pass', 'orchestrator_runbook', `Runbook action executed: ${key}`);
          ctx.emitOrchestratorEvent('action_executed', { actionId: key, description: action.description }, 'executor');
          resolve({
            success: true,
            actionId: key,
            description: action.description,
            stdout: String(stdout || '').slice(0, 16000),
            stderr: String(stderr || '').slice(0, 6000),
          });
        });
      });
    } catch (e) {
      return { success: false, actionId: String(actionId || ''), error: e.message };
    }
  });

  ipcMain.handle('orchestrator:setProfile', async (_, profile) => {
    try {
      applyOrchestratorProfile(profile);
      ctx.appendAuditEvent('policy_change', 'orchestrator_profile', `Profile set to ${ctx.orchestratorState.profile}`);
      ctx.emitOrchestratorEvent('profile_changed', { profile: ctx.orchestratorState.profile }, 'operator');
      return {
        success: true,
        profile: ctx.orchestratorState.profile,
        controls: { ...ctx.runtimeControls },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('orchestrator:command', async (_, input) => {
    try {
      const command = input && typeof input === 'object' ? input : {};
      const type = String(command.type || '').trim();
      const payload = command.payload && typeof command.payload === 'object' ? command.payload : {};

      if (type === 'set_profile') {
        applyOrchestratorProfile(payload.profile);
        ctx.appendAuditEvent('policy_change', 'orchestrator_profile', `Profile set to ${ctx.orchestratorState.profile}`);
        ctx.emitOrchestratorEvent('profile_changed', { profile: ctx.orchestratorState.profile }, 'operator');
        return { success: true, command: type, profile: ctx.orchestratorState.profile, controls: { ...ctx.runtimeControls } };
      }

      if (type === 'submit_goal') {
        if (!payload.description || typeof payload.description !== 'string') {
          return { success: false, command: type, error: 'Missing payload.description' };
        }
        const newGoal = {
          id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          description: payload.description,
          type: payload.goalType || 'user-set',
          status: 'active',
          priority: Number(payload.priority || 5),
          subgoals: Array.isArray(payload.subgoals) ? payload.subgoals : [],
          progress: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          evidence: [],
          checkpoints: [],
        };
        ctx.persistentGoals.goals.push(newGoal);
        ctx.saveJSON(ctx.goalsFile, ctx.persistentGoals);
        ctx.emitOrchestratorEvent('goal_submitted', { goalId: newGoal.id, description: newGoal.description, priority: newGoal.priority }, 'operator');
        return { success: true, command: type, goal: newGoal };
      }

      if (type === 'pause_autonomy' || type === 'emergency_stop') {
        ctx.runtimeControls.emergencyStopActive = true;
        ctx.appendAuditEvent('emergency_stop', 'orchestrator_command', type);
        ctx.emitOrchestratorEvent('emergency_stop_enabled', { reason: type }, 'operator');
        return { success: true, command: type, controls: { ...ctx.runtimeControls } };
      }

      if (type === 'resume_autonomy' || type === 'clear_emergency_stop') {
        ctx.runtimeControls.emergencyStopActive = false;
        ctx.appendAuditEvent('emergency_clear', 'orchestrator_command', type);
        ctx.emitOrchestratorEvent('emergency_stop_cleared', { reason: type }, 'operator');
        return { success: true, command: type, controls: { ...ctx.runtimeControls } };
      }

      if (type === 'apply_runtime_patch') {
        const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : {};
        const previousEmergency = Boolean(ctx.runtimeControls.emergencyStopActive);
        Object.assign(ctx.runtimeControls, patch);
        ctx.emitOrchestratorEvent('policy_updated', { patch, controls: { ...ctx.runtimeControls } }, 'operator');
        if (!previousEmergency && ctx.runtimeControls.emergencyStopActive) {
          ctx.emitOrchestratorEvent('emergency_stop_enabled', { reason: 'orchestrator_command_patch' }, 'operator');
          ctx.appendAuditEvent('emergency_stop', 'orchestrator_command', 'Emergency stop enabled');
        } else if (previousEmergency && !ctx.runtimeControls.emergencyStopActive) {
          ctx.emitOrchestratorEvent('emergency_stop_cleared', { reason: 'orchestrator_command_patch' }, 'operator');
          ctx.appendAuditEvent('emergency_clear', 'orchestrator_command', 'Emergency stop cleared');
        }
        return { success: true, command: type, controls: { ...ctx.runtimeControls } };
      }

      return { success: false, command: type, error: 'Unknown orchestrator command type' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { register, applyOrchestratorProfile, ORCHESTRATOR_RUNBOOK_ACTIONS };
