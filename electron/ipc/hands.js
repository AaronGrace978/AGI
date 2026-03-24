// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — IPC: Hands (Rollback, Ledger, Replay, Diagnostics)
// ═══════════════════════════════════════════════════════════════
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ctx = require('../ctx');

const { exportPrimeOSRuntimeBundle } = require('../hands/primeos-adapter');

function normalizeRollbackEntries() {
  if (!ctx.rollbackRegistry || !Array.isArray(ctx.rollbackRegistry.entries)) {
    ctx.rollbackRegistry = { entries: [], version: 1 };
  }
}

function applyRollbackEntry(entry) {
  if (!entry) return { success: false, error: 'Rollback entry not found' };
  const payload = entry.payload || {};

  try {
    if (entry.kind === 'write_file') {
      if (payload.existedBefore) {
        const dir = path.dirname(payload.targetPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(payload.targetPath, payload.previousContent ?? '', 'utf-8');
      } else if (fs.existsSync(payload.targetPath)) {
        fs.rmSync(payload.targetPath, { recursive: true, force: true });
      }
      return { success: true };
    }

    if (entry.kind === 'rename_file') {
      if (!fs.existsSync(payload.toPath)) {
        return { success: false, error: 'Cannot rollback rename: destination not found' };
      }
      const dir = path.dirname(payload.fromPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.renameSync(payload.toPath, payload.fromPath);
      return { success: true };
    }

    if (entry.kind === 'delete_file') {
      if (!fs.existsSync(payload.backupPath)) {
        return { success: false, error: 'Cannot rollback delete: backup missing' };
      }
      const dir = path.dirname(payload.targetPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (payload.wasDirectory) {
        fs.cpSync(payload.backupPath, payload.targetPath, { recursive: true });
      } else {
        fs.copyFileSync(payload.backupPath, payload.targetPath);
      }
      return { success: true };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }

  return { success: false, error: `Unsupported rollback kind: ${entry.kind}` };
}

function register() {
  ipcMain.handle('agent:listRollbacks', async () => {
    normalizeRollbackEntries();
    return {
      success: true,
      entries: [...ctx.rollbackRegistry.entries]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 200),
    };
  });

  ipcMain.handle('agent:executeRollback', async (_, rollbackId) => {
    normalizeRollbackEntries();
    const entry = ctx.rollbackRegistry.entries.find((r) => r.id === rollbackId);
    if (!entry) {
      ctx.appendAuditEvent('rollback_failed', 'execute_rollback', `Rollback entry not found: ${rollbackId}`);
      return { success: false, error: 'Rollback entry not found', rollbackId };
    }
    if (entry.status !== 'ready') {
      ctx.appendAuditEvent('rollback_failed', 'execute_rollback', `Rollback not executable (status=${entry.status})`, { rollbackId });
      return { success: false, error: `Rollback not executable (status=${entry.status})`, rollbackId };
    }

    const result = applyRollbackEntry(entry);
    if (result.success) {
      ctx.updateRollbackEntry(rollbackId, {
        status: 'applied',
        appliedAt: Date.now(),
        lastError: null,
      });
      ctx.appendAuditEvent('rollback_executed', entry.action || 'execute_rollback', `Rollback applied: ${rollbackId}`, { rollbackId });
      return { success: true, rollbackId };
    }

    ctx.updateRollbackEntry(rollbackId, {
      status: 'failed',
      lastError: result.error || 'Unknown rollback error',
      lastTriedAt: Date.now(),
    });
    ctx.appendAuditEvent('rollback_failed', entry.action || 'execute_rollback', result.error || 'Unknown rollback error', { rollbackId });
    return { success: false, error: result.error || 'Unknown rollback error', rollbackId };
  });

  ipcMain.handle('agent:ledgerCreateRun', async (_, kind, metadata) => {
    try {
      const created = ctx.createLedgerRun(kind || 'generic', metadata || {});
      return { success: true, ...created };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:ledgerAppend', async (_, runId, entryType, payload) => {
    try {
      return ctx.appendLedgerEntry(runId, entryType || 'event', payload || {});
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:ledgerFinalize', async (_, runId, summary) => {
    try {
      return ctx.finalizeLedgerRun(runId, summary || {});
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:ledgerListRuns', async () => {
    try {
      return { success: true, runs: ctx.listLedgerRuns() };
    } catch (e) {
      return { success: false, error: e.message, runs: [] };
    }
  });

  ipcMain.handle('agent:ledgerReadRun', async (_, runId) => {
    try {
      const ledgerPath = ctx.getLedgerPath(runId);
      if (!fs.existsSync(ledgerPath)) {
        return { success: false, error: 'Ledger run not found' };
      }
      const run = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
      return { success: true, run };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:replayListRuns', async () => {
    try {
      return { success: true, runs: ctx.listLedgerRuns() };
    } catch (e) {
      return { success: false, error: e.message, runs: [] };
    }
  });

  ipcMain.handle('agent:replayLoadRun', async (_, runId) => {
    try {
      const ledgerPath = ctx.getLedgerPath(runId);
      if (!fs.existsSync(ledgerPath)) {
        return { success: false, error: 'Replay run not found' };
      }
      const run = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
      return { success: true, run };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:handsDoctor', async () => {
    try {
      const runs = ctx.listLedgerRuns().slice(0, 200);
      const actionLatencies = [];
      let verifyPasses = 0;
      let verifyFails = 0;
      let retries = 0;
      let recoveries = 0;
      let rollbackReady = 0;
      let rollbackApplied = 0;
      const errors = {};

      for (const runMeta of runs) {
        const filePath = ctx.getLedgerPath(runMeta.id);
        if (!fs.existsSync(filePath)) continue;
        const run = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        for (const entry of run.entries || []) {
          if (entry.type === 'hands_action' || entry.type === 'cognitive_step') {
            const payload = entry.payload || {};
            if (payload.latencyMs) actionLatencies.push(Number(payload.latencyMs));
            if (payload.verifyPasses) verifyPasses += Number(payload.verifyPasses);
            if (payload.verifyFails) verifyFails += Number(payload.verifyFails);
            if (payload.recoveryAttempts) retries += Number(payload.recoveryAttempts);
            if (payload.recoverySuccesses) recoveries += Number(payload.recoverySuccesses);
            if (payload.rollback && payload.rollback.rollbackStatus === 'ready') rollbackReady += 1;
            if (payload.rollback && payload.rollback.rollbackStatus === 'applied') rollbackApplied += 1;
            if (payload.error) {
              const key = String(payload.error).slice(0, 80);
              errors[key] = (errors[key] || 0) + 1;
            }
          }
        }
      }

      const sorted = actionLatencies.sort((a, b) => a - b);
      const pct = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
      const topError = Object.entries(errors).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      return {
        success: true,
        metrics: {
          runsAnalyzed: runs.length,
          latency: { p50: pct(50), p90: pct(90), p99: pct(99) },
          verify: { pass: verifyPasses, fail: verifyFails },
          retries: { attempts: retries, successfulRecoveries: recoveries },
          rollback: { ready: rollbackReady, applied: rollbackApplied },
          lastErrorTaxonomy: topError,
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:handsReplayCheck', async (_, runId) => {
    try {
      const ledgerPath = ctx.getLedgerPath(runId);
      if (!fs.existsSync(ledgerPath)) return { success: false, error: 'Replay run not found' };
      const run = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
      const actions = (run.entries || []).filter((e) => e.type === 'hands_action' || e.type === 'cognitive_step');
      const signature = actions
        .map((e) => `${e.type}:${e.payload?.action || e.payload?.actionType || e.payload?.type || 'na'}`)
        .join('|');
      const signatureHash = crypto.createHash('sha1').update(signature).digest('hex');
      return {
        success: true,
        runId,
        actionCount: actions.length,
        deterministicSignature: signatureHash,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:handsExportPrimeOS', async (_, opts = {}) => {
    try {
      const outputDir = opts.outputDir || path.join(ctx.dataDir, 'hands-primeos');
      const exported = exportPrimeOSRuntimeBundle({
        outputDir,
        runtimeControls: ctx.runtimeControls,
        profile: ctx.orchestratorState.profile,
        version: 'v2',
      });
      return { success: true, ...exported };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { register };
