// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — IPC: System (Health, Updates, Event Monitoring)
// ═══════════════════════════════════════════════════════════════
const { ipcMain, shell, app } = require('electron');
const { exec } = require('child_process');
const ctx = require('../ctx');
const { detectSteamDeck, hostLabel } = require('../platform');
const { buildSystemInfo } = require('../system-info');

const UPDATE_MANIFEST_URL = process.env.AGIPRIME_UPDATE_MANIFEST_URL || '';

function compareSemverLoose(a, b) {
  const av = String(a || '').split('.').map((v) => parseInt(v, 10) || 0);
  const bv = String(b || '').split('.').map((v) => parseInt(v, 10) || 0);
  const max = Math.max(av.length, bv.length);
  for (let i = 0; i < max; i++) {
    const ai = av[i] || 0;
    const bi = bv[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

// ─── Event Monitoring ──────────────────────────────────────────

let eventMonitorTimer = null;
let lastDiskCheckTime = 0;
let lastGoalCheckTime = 0;

function emitOperationalEvent(payload) {
  if (ctx.mainWindow?.webContents) {
    ctx.mainWindow.webContents.send('proactive:event', payload);
    return;
  }
  console.log(`[Proactive:${payload.type}] ${payload.message}`);
}

async function checkProactiveEvents() {
  try {
    if (Date.now() - lastDiskCheckTime > 1800000) {
      lastDiskCheckTime = Date.now();
      if (process.platform === 'win32') {
        exec('powershell -NoProfile -Command "Get-PSDrive C | Select-Object @{N=\'FreeGB\';E={[math]::Round($_.Free/1GB,1)}},@{N=\'UsedGB\';E={[math]::Round($_.Used/1GB,1)}} | ConvertTo-Json"',
          { timeout: 5000 }, (err, stdout) => {
            if (!err && stdout) {
              try {
                const info = JSON.parse(stdout);
                if (info.FreeGB < 5) {
                  emitOperationalEvent({
                    type: 'low_disk',
                    message: `Low disk space: ${info.FreeGB}GB free. Consider cleaning up temporary files.`,
                    severity: info.FreeGB < 2 ? 'high' : 'medium',
                    timestamp: Date.now(),
                  });
                }
              } catch {}
            }
          });
      } else {
        exec(`sh -lc "df -Pk / | awk 'NR==2 {print \\$4}'"`, { timeout: 5000 }, (err, stdout) => {
          if (!err && stdout) {
            const kbFree = Number(String(stdout).trim());
            if (Number.isFinite(kbFree) && kbFree > 0) {
              const freeGb = Math.round((kbFree / 1024 / 1024) * 10) / 10;
              if (freeGb < 5) {
                emitOperationalEvent({
                  type: 'low_disk',
                  message: `Low disk space: ${freeGb}GB free on /. Consider apt cleanup and log rotation.`,
                  severity: freeGb < 2 ? 'high' : 'medium',
                  timestamp: Date.now(),
                });
              }
            }
          }
        });
      }
    }

    if (Date.now() - lastGoalCheckTime > 300000 && ctx.persistentGoals.goals.length > 0) {
      lastGoalCheckTime = Date.now();
      const activeGoals = ctx.persistentGoals.goals.filter(g => g.status === 'active');
      const staleGoals = activeGoals.filter(g => Date.now() - g.updatedAt > 86400000);
      if (staleGoals.length > 0) {
        emitOperationalEvent({
          type: 'stale_goals',
          message: `${staleGoals.length} goal(s) haven't been updated in 24+ hours: ${staleGoals.map(g => g.description).join('; ')}`,
          severity: 'low',
          goals: staleGoals.map(g => g.id),
          timestamp: Date.now(),
        });
      }
    }
  } catch (e) {
    console.log('[EventMonitor] Error:', e.message);
  }
}

function startEventMonitor() {
  eventMonitorTimer = setInterval(checkProactiveEvents, 60000);
  setTimeout(checkProactiveEvents, 10000);
}

function emitOpsSnapshot() {
  try {
    const runs = ctx.listLedgerRuns().slice(0, 5);
    const completed = runs.filter((r) => r.status === 'completed').length;
    console.log(`[Ops] ledgers=${runs.length} completed=${completed} activeGoals=${ctx.persistentGoals.goals.filter(g => g.status === 'active').length} memories=${ctx.getVectorStats().total}`);
  } catch (e) {
    console.log('[Ops] Snapshot failed:', e.message);
  }
}

function register() {
  ipcMain.handle('system:info', () => {
    return buildSystemInfo({
      uptime: process.uptime(),
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      isSteamDeck: detectSteamDeck(),
      hostLabel: hostLabel(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      memory: process.memoryUsage(),
      paths: {
        userData: app.getPath('userData'),
        dataDir: ctx.dataDir,
        memoryFile: ctx.memoryFile,
        vectorFile: ctx.vectorFile,
        settingsFile: ctx.settingsFile,
        sparkFile: ctx.sparkFile,
      },
      gpuHardwareAcceleration: ctx.gpuHardwareAcceleration !== false,
      gpuPolicyReason: ctx.gpuPolicyReason || '',
    });
  });

  ipcMain.handle('system:healthSummary', () => {
    return ctx.getRuntimeHealthSummary();
  });

  ipcMain.handle('update:check', async () => {
    const currentVersion = app.getVersion();
    if (!UPDATE_MANIFEST_URL) {
      return {
        configured: false,
        currentVersion,
        updateAvailable: false,
        message: 'Set AGIPRIME_UPDATE_MANIFEST_URL to enable update checks.',
      };
    }

    try {
      const res = await fetch(UPDATE_MANIFEST_URL, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return {
          configured: true,
          currentVersion,
          updateAvailable: false,
          error: `Manifest request failed: ${res.status}`,
        };
      }

      const manifest = await res.json();
      const latestVersion = String(manifest.version || '');
      const cmp = compareSemverLoose(latestVersion, currentVersion);
      return {
        configured: true,
        currentVersion,
        latestVersion,
        updateAvailable: cmp > 0,
        notes: manifest.notes || '',
        downloadUrl: manifest.downloadUrl || '',
        raw: manifest,
      };
    } catch (e) {
      return {
        configured: true,
        currentVersion,
        updateAvailable: false,
        error: e?.message || 'Update check failed',
      };
    }
  });

  ipcMain.handle('update:openDownload', async (_, url) => {
    const target = String(url || '').trim();
    if (!target) return { success: false, error: 'Missing URL' };
    try {
      await shell.openExternal(target);
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'Failed to open URL' };
    }
  });
}

module.exports = { register, startEventMonitor, emitOpsSnapshot };
