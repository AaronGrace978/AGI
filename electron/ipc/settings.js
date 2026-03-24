// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Settings, Window, AGI Score, Memory (basic),
//  Operator Profile, Spark, Gate IPC Handlers
// ═══════════════════════════════════════════════════════════════

const { ipcMain } = require('electron');
const ctx = require('../ctx');

const DEFAULT_AGI_SCORE = {
  version: 1,
  config: {
    version: 1,
    weights: {
      abstractReasoningLogic: 0.2,
      learningFlexibility: 0.15,
      domainGenerality: 0.2,
      autonomousGoalSetting: 0.2,
      selfModelingMetaCognition: 0.15,
      creativeProblemSolving: 0.1,
    },
    requireRealWorkflowCountForFullCredit: 1,
    optimizeInAutoCycle: true,
  },
  snapshots: [],
};

function loadOperatorProfile() {
  return ctx.loadJSON(ctx.operatorProfileFile, {
    observations: [],
    rhythm: { avgTypingDelayMs: 0, avgSessionLengthMin: 0, peakHours: [], preferredApps: [], correctionRate: 0, lastUpdated: 0 },
    preferences: {},
    totalObservations: 0,
    totalSessions: 0,
    synthesisNotes: [],
    lastSynthesisAt: null,
  });
}

// ─── Standalone Fallbacks (no PrimeOS bridge needed) ────────────
const { evaluateActionGate: evaluateHandsGate } = require('../hands/policy');

const GATE_ACTION_SETS = {
  READ_ONLY_ACTIONS: new Set([
    'list_directory', 'read_file', 'system_info', 'open_url', 'clipboard_read',
    'search_files', 'web_fetch', 'web_search', 'web_screenshot',
    'screenshot_desktop', 'analyze_screen', 'get_mouse_position',
    'get_screen_dimensions', 'list_custom_tools', 'get_foreground_window', 'list_processes',
  ]),
  REVERSIBLE_ACTIONS: new Set(['write_file', 'rename_file', 'create_directory']),
  HIGH_RISK_ACTIONS: new Set([
    'delete_file', 'execute_command', 'execute_tool', 'create_tool',
    'open_file', 'open_application', 'mouse_drag', 'mouse_click',
    'keyboard_press', 'keyboard_shortcut', 'keyboard_type', 'mouse_move',
    'mouse_scroll', 'clipboard_write', 'minimize_self',
  ]),
};

const LIMITED_EXEC_ALLOWLIST = [
  /^systemctl\s+(status|is-active|restart|start|stop)\b/i,
  /^journalctl\b/i,
  /^apt(?:-get)?\s+(update|install|upgrade|autoremove|remove)\b/i,
  /^dpkg\s+-l\b/i,
  /^snap\s+(list|refresh)\b/i,
  /^tail\s+-n\s+\d+\s+\/var\/log\//i,
  /^cat\s+\/var\/log\//i,
  /^ls\b/i, /^pwd$/i, /^whoami$/i, /^uname\s+-a$/i, /^df\s+-h\b/i, /^free\s+-h$/i,
];

function isLimitedScopeExecCommand(command) {
  const text = String(command || '').trim();
  if (!text) return false;
  if (text.includes('&&') || text.includes('||') || text.includes(';') || text.includes('|')) return false;
  return LIMITED_EXEC_ALLOWLIST.some((p) => p.test(text));
}

function gateEvaluateStandalone(action, params) {
  return evaluateHandsGate({
    action,
    params,
    runtimeControls: ctx.runtimeControls || {},
    settings: ctx.settings || {},
    sets: GATE_ACTION_SETS,
    strictNoUiActions: false,
    uiActions: new Set(),
    isLimitedScopeExecCommand,
  });
}

async function sparkReasonStandalone(input) {
  if (!input || !ctx.llmGenerate) return null;
  try {
    const response = await ctx.llmGenerate(
      [
        { role: 'system', content: 'You are the SPARK reasoning engine — the cognitive core of AGI PRIME. Analyze the input, identify key concepts, detect logical patterns, and provide structured reasoning. Be concise but thorough.' },
        { role: 'user', content: input },
      ],
      { temperature: 0.3, maxTokens: 1024 },
    );
    return { reasoning: response, source: 'standalone', timestamp: Date.now() };
  } catch (e) {
    console.warn('[Spark Standalone] reasoning failed:', e?.message);
    return null;
  }
}

function register() {
  // ─── Window Controls ───────────────────────────────────────────
  ipcMain.on('window:minimize', () => ctx.mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (ctx.mainWindow?.isMaximized()) {
      ctx.mainWindow.unmaximize();
    } else {
      ctx.mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => ctx.mainWindow?.close());

  // ─── Settings IPC ──────────────────────────────────────────────
  ipcMain.handle('settings:get', () => ctx.settings);
  ipcMain.handle('settings:set', (_, newSettings) => {
    ctx.settings = { ...ctx.settings, ...newSettings };
    if (typeof ctx.settings.ollamaApiKey === 'string' && ctx.settings.ollamaApiKey.trim()) {
      process.env.OLLAMA_API_KEY = ctx.settings.ollamaApiKey;
    }
    if (typeof ctx.settings.arcApiKey === 'string' && ctx.settings.arcApiKey.trim()) {
      process.env.ARC_API_KEY = ctx.settings.arcApiKey;
      process.env.ARC_AGI_API = ctx.settings.arcApiKey;
    }
    if (typeof ctx.settings.elevenLabsApiKey === 'string' && ctx.settings.elevenLabsApiKey.trim()) {
      process.env.ELEVENLABS_API_KEY = ctx.settings.elevenLabsApiKey;
    }
    ctx.runtimeControls.conscienceEnabled = !ctx.settings.disableConscience;
    ctx.saveJSON(ctx.settingsFile, ctx.settings);
    return ctx.settings;
  });

  // ─── AGI Score IPC (rubric config + snapshot history) ───────────
  ipcMain.handle('agiScore:getConfig', () => {
    try {
      if (!ctx.agiScore || typeof ctx.agiScore !== 'object') ctx.agiScore = { ...DEFAULT_AGI_SCORE };
      if (!ctx.agiScore.config) ctx.agiScore.config = { ...DEFAULT_AGI_SCORE.config };
      return ctx.agiScore.config;
    } catch {
      return DEFAULT_AGI_SCORE.config;
    }
  });

  ipcMain.handle('agiScore:setConfig', (_, partial) => {
    try {
      if (!ctx.agiScore || typeof ctx.agiScore !== 'object') ctx.agiScore = { ...DEFAULT_AGI_SCORE };
      const next = { ...(ctx.agiScore.config || DEFAULT_AGI_SCORE.config), ...(partial || {}) };
      next.weights = { ...DEFAULT_AGI_SCORE.config.weights, ...(next.weights || {}) };
      ctx.agiScore.config = next;
      ctx.saveAgiScore();
      return ctx.agiScore.config;
    } catch (e) {
      console.warn('[AGI Score] setConfig failed:', e?.message || e);
      return ctx.agiScore?.config || DEFAULT_AGI_SCORE.config;
    }
  });

  ipcMain.handle('agiScore:appendSnapshot', (_, snapshot) => {
    try {
      if (!ctx.agiScore || typeof ctx.agiScore !== 'object') ctx.agiScore = { ...DEFAULT_AGI_SCORE };
      if (!Array.isArray(ctx.agiScore.snapshots)) ctx.agiScore.snapshots = [];

      const createdAt = typeof snapshot?.createdAt === 'number' ? snapshot.createdAt : Date.now();
      const id = snapshot?.id || `agi_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
      const normalized = { ...snapshot, id, createdAt };

      ctx.agiScore.snapshots.push(normalized);
      ctx.agiScore.snapshots = ctx.agiScore.snapshots.slice(-250);
      ctx.saveAgiScore();

      return normalized;
    } catch (e) {
      console.warn('[AGI Score] appendSnapshot failed:', e?.message || e);
      return snapshot || null;
    }
  });

  ipcMain.handle('agiScore:listSnapshots', (_, options) => {
    try {
      if (!ctx.agiScore || typeof ctx.agiScore !== 'object') ctx.agiScore = { ...DEFAULT_AGI_SCORE };
      const list = Array.isArray(ctx.agiScore.snapshots) ? ctx.agiScore.snapshots : [];
      const limit = Math.max(1, Math.min(500, Number(options?.limit) || 50));
      return [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit);
    } catch {
      return [];
    }
  });

  // ─── Memory IPC ────────────────────────────────────────────────
  ipcMain.handle('memory:get', async () => {
    if (ctx.osBridgeEnabled) {
      try {
        return await ctx.osBridge.routeMemorySnapshot(12);
      } catch (e) {
        console.warn('[PrimeOS Bridge] memory:get fallback:', e?.message);
      }
    }
    return ctx.memory;
  });
  ipcMain.handle('memory:getSummary', (_, options) => {
    if (ctx.osBridgeEnabled) {
      return ctx.osBridge.routeMemorySnapshot(options?.maxItems ?? 5).catch((e) => {
        console.warn('[PrimeOS Bridge] memory:getSummary fallback:', e?.message);
        return {
          facts: [],
          conversations: [],
          soul: {},
          consciousness: { insights: [] },
          counts: { facts: 0, conversations: 0, insights: 0 },
        };
      });
    }
    const maxItems = Math.max(1, Math.min(12, Number(options?.maxItems ?? 5)));
    const safeFacts = Array.isArray(ctx.memory?.facts) ? ctx.memory.facts : [];
    const safeConversations = Array.isArray(ctx.memory?.conversations) ? ctx.memory.conversations : [];
    const safeInsights = Array.isArray(ctx.memory?.consciousness?.insights) ? ctx.memory.consciousness.insights : [];

    return {
      facts: safeFacts.slice(-maxItems),
      conversations: safeConversations.slice(-maxItems),
      soul: ctx.memory?.soul || {},
      consciousness: {
        ...(ctx.memory?.consciousness || {}),
        insights: safeInsights.slice(-maxItems),
      },
      counts: {
        facts: safeFacts.length,
        conversations: safeConversations.length,
        insights: safeInsights.length,
      },
    };
  });
  ipcMain.handle('memory:update', (_, updates) => {
    if (ctx.osBridgeEnabled) {
      return ctx.osBridge.routeMemoryStore({
        content: `Legacy memory update snapshot: ${JSON.stringify(updates || {})}`,
        type: 'semantic',
        source: 'legacy-memory-update',
        tags: ['legacy', 'snapshot'],
      }).then(() => ctx.memory);
    }
    ctx.memory = { ...ctx.memory, ...updates };
    ctx.saveJSON(ctx.memoryFile, ctx.memory);
    return ctx.memory;
  });
  ipcMain.handle('memory:addFact', (_, fact) => {
    if (ctx.osBridgeEnabled) {
      return ctx.osBridge.routeMemoryStore({
        content: typeof fact === 'string' ? fact : JSON.stringify(fact || {}),
        type: 'semantic',
        source: 'memory:addFact',
        tags: ['fact'],
      });
    }
    ctx.memory.facts.push({ ...fact, timestamp: Date.now() });
    if (ctx.memory.facts.length > 500) ctx.memory.facts = ctx.memory.facts.slice(-500);
    ctx.saveJSON(ctx.memoryFile, ctx.memory);
    return ctx.memory;
  });

  // ─── Operator Synthesis Profile (persisted, set-and-forget) ─────
  ipcMain.handle('operatorProfile:get', () => loadOperatorProfile());
  ipcMain.handle('operatorProfile:save', (_, profile) => {
    if (profile && typeof profile === 'object') {
      ctx.saveJSON(ctx.operatorProfileFile, profile);
    }
    return { success: true };
  });

  // ─── SPARK — Cognitive Architecture State Persistence ───────────
  ipcMain.handle('spark:getState', () => {
    return ctx.loadJSON(ctx.sparkFile, null);
  });

  ipcMain.handle('spark:saveState', (_, state) => {
    ctx.saveJSON(ctx.sparkFile, state);
  });

  ipcMain.handle('spark:reason', async (_, input) => {
    if (ctx.osBridgeEnabled) {
      try {
        return await ctx.osBridge.routeSparkReason(String(input || ''));
      } catch (e) {
        console.warn('[PrimeOS Bridge] spark:reason failed, using standalone fallback:', e?.message);
      }
    }
    return sparkReasonStandalone(String(input || ''));
  });

  // ─── Gate Evaluation ───────────────────────────────────────────
  ipcMain.handle('gate:evaluate', async (_, action, params) => {
    if (ctx.osBridgeEnabled) {
      try {
        return await ctx.osBridge.routeGateEvaluate(action, params);
      } catch (e) {
        console.warn('[PrimeOS Bridge] gate:evaluate failed, using standalone fallback:', e?.message);
      }
    }
    return gateEvaluateStandalone(action, params || {});
  });
}

module.exports = { register };
