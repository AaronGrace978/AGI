// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — IPC: Cognitive Loop (ReAct Agent Engine)
//  Observe → Think → Act → Reflect → Loop
//  Also includes agent:planAndExecute (one-shot planner).
// ═══════════════════════════════════════════════════════════════
const { ipcMain, BrowserWindow, shell, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const ctx = require('../ctx');

const { executeSingleAction: executeHandsAction } = require('../hands/executor');
const { evaluateActionGate: evaluateHandsActionGate, mapActionToPolicyGate } = require('../hands/policy');
const { verifyActionOutcome } = require('../hands/verifier');
const { runRecoveryPlan } = require('../hands/recovery');
const { createRunTelemetry, avgActionMs, makeEmitTelemetryStep } = require('../hands/telemetry');
const { createRollbackManager } = require('../hands/rollback');
const { normalizeDecisionPayload, isParallelSafeAction: isPlannerParallelSafe } = require('../hands/planner');
const { makeActionContractRegistry, defaultRetryPolicy } = require('../hands/contracts');
const { appendActionLedger } = require('../hands/ledger');

const {
  isBlockedCommand,
  buildAgentCommand,
  resolvePythonPath,
  captureDesktopScreenshot,
  analyzeScreen,
  runInputAction,
  registerCustomTool,
  executeCustomTool,
} = require('./agent');

// ─── Shared State ──────────────────────────────────────────────

let cognitiveKillFlag = false;

const BLOCKED_COMMANDS = [
  'format', 'rm -rf /', 'del /f /s /q C:', 'shutdown', 'mkfs',
  'dd if=', ':(){', 'reg delete', 'bcdedit',
];

const AUTONOMOUS_EXEC_ALLOWLIST = [
  /^systemctl\s+(status|is-active|restart|start|stop)\b/i,
  /^journalctl\b/i,
  /^apt(?:-get)?\s+(update|install|upgrade|autoremove|remove)\b/i,
  /^dpkg\s+-l\b/i,
  /^snap\s+(list|refresh)\b/i,
  /^tail\s+-n\s+\d+\s+\/var\/log\//i,
  /^cat\s+\/var\/log\//i,
  /^ls\b/i,
  /^pwd$/i,
  /^whoami$/i,
  /^uname\s+-a$/i,
  /^df\s+-h\b/i,
  /^free\s+-h$/i,
];

function isLimitedScopeExecCommand(command) {
  const text = typeof command === 'string' ? command.trim() : '';
  if (!text) return false;
  if (text.includes('&&') || text.includes('||') || text.includes(';') || text.includes('|')) {
    return false;
  }
  return AUTONOMOUS_EXEC_ALLOWLIST.some((pattern) => pattern.test(text));
}

function prepareRollbackForAction(action, params = {}) {
  try {
    if (action === 'write_file') {
      const targetPath = path.resolve(String(params.path || ''));
      if (!targetPath) return null;
      const existedBefore = fs.existsSync(targetPath);
      const previousContent = existedBefore ? fs.readFileSync(targetPath, 'utf-8') : null;
      return {
        id: `rb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action,
        kind: 'write_file',
        affectedTargets: [targetPath],
        payload: {
          targetPath,
          existedBefore,
          previousContent,
        },
      };
    }

    if (action === 'rename_file') {
      const fromPath = path.resolve(String(params.oldPath || ''));
      const toPath = path.resolve(String(params.newPath || ''));
      if (!fromPath || !toPath) return null;
      return {
        id: `rb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action,
        kind: 'rename_file',
        affectedTargets: [fromPath, toPath],
        payload: {
          fromPath,
          toPath,
        },
      };
    }

    if (action === 'delete_file') {
      const targetPath = path.resolve(String(params.path || ''));
      if (!targetPath || !fs.existsSync(targetPath)) return null;
      const stat = fs.statSync(targetPath);
      const backupPath = path.join(
        ctx.rollbackBackupDir,
        `rbk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${path.basename(targetPath)}`,
      );

      if (stat.isDirectory()) {
        fs.cpSync(targetPath, backupPath, { recursive: true });
      } else {
        fs.copyFileSync(targetPath, backupPath);
      }

      return {
        id: `rb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action,
        kind: 'delete_file',
        affectedTargets: [targetPath],
        payload: {
          targetPath,
          backupPath,
          wasDirectory: stat.isDirectory(),
        },
      };
    }
  } catch (e) {
    console.warn('[Rollback] failed to prepare rollback:', e?.message || e);
  }
  return null;
}

// ─── executeIPC — Inline IPC dispatcher for plan-and-execute ───

async function executeIPC(channel, ...args) {
  const handlers = {
    'agent:execute': async (cmd) => {
      return new Promise((resolve) => {
        if (isBlockedCommand(cmd)) {
          return resolve({ success: false, error: 'BLOCKED by Guardian' });
        }
        const finalCmd = buildAgentCommand(cmd);
        const workspaceCwd = process.cwd();
        let execCwd = os.homedir();
        if (typeof cmd === 'object' && cmd && typeof cmd.cwd === 'string' && cmd.cwd.trim()) {
          execCwd = cmd.cwd.trim();
        } else if (
          typeof cmd === 'string' &&
          /(^|[\s"'`])(\.\.?[\\/]|scripts[\\/]|src[\\/]|electron[\\/])/i.test(cmd) &&
          workspaceCwd &&
          fs.existsSync(workspaceCwd)
        ) {
          execCwd = workspaceCwd;
        }
        const isLong = /arc_play|--steps\s+\d{2,}|--search-trials/i.test(typeof cmd === 'string' ? cmd : '');
        exec(finalCmd, { timeout: isLong ? 1800000 : 120000, maxBuffer: 10 * 1024 * 1024, cwd: execCwd, shell: true }, (error, stdout, stderr) => {
          if (error) resolve({ success: false, error: error.message, stderr: stderr?.toString() });
          else resolve({ success: true, stdout: stdout?.toString(), stderr: stderr?.toString() });
        });
      });
    },
    'agent:readFile': async (p) => {
      try {
        const resolved = path.resolve(p);
        const content = fs.readFileSync(resolved, 'utf-8');
        return { success: true, content: content.slice(0, 50000), path: resolved };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'agent:writeFile': async (p, content) => {
      try {
        const resolved = path.resolve(p);
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolved, content, 'utf-8');
        return { success: true, path: resolved };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'agent:listDir': async (p) => {
      try {
        const resolved = path.resolve(p || os.homedir());
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        return { success: true, items: entries.slice(0, 200).map(e => ({ name: e.name, isDirectory: e.isDirectory() })), path: resolved };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'agent:createDir': async (p) => {
      try { fs.mkdirSync(path.resolve(p), { recursive: true }); return { success: true }; }
      catch (e) { return { success: false, error: e.message }; }
    },
    'agent:deleteFile': async (p) => {
      try { fs.rmSync(path.resolve(p), { recursive: true }); return { success: true }; }
      catch (e) { return { success: false, error: e.message }; }
    },
    'agent:renameFile': async (o, n) => {
      try { fs.renameSync(path.resolve(o), path.resolve(n)); return { success: true }; }
      catch (e) { return { success: false, error: e.message }; }
    },
    'agent:openUrl': async (url) => {
      try { await shell.openExternal(url); return { success: true }; }
      catch (e) { return { success: false, error: e.message }; }
    },
    'agent:openFile': async (p) => {
      try { await shell.openPath(path.resolve(p)); return { success: true }; }
      catch (e) { return { success: false, error: e.message }; }
    },
    'agent:openApp': async (p) => {
      try { await shell.openPath(p); return { success: true }; }
      catch (e) { return { success: false, error: e.message }; }
    },
    'agent:searchFiles': async (dir, pattern) => {
      try {
        const resolved = path.resolve(dir || os.homedir());
        const results = [];
        let regex;
        try { regex = new RegExp(pattern, 'i'); } catch { regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
        function walk(d, depth = 0) {
          if (depth > 3 || results.length > 50) return;
          try {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
              if (e.name.startsWith('.') || e.name === 'node_modules') continue;
              if (regex.test(e.name)) results.push({ name: e.name, path: path.join(d, e.name), isDirectory: e.isDirectory() });
              if (e.isDirectory()) walk(path.join(d, e.name), depth + 1);
            }
          } catch (_) { /* permission denied on dir is expected */ }
        }
        walk(resolved);
        return { success: true, results: results.slice(0, 50) };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'agent:clipboard': async (action, text) => {
      if (action === 'read') return { success: true, text: clipboard.readText() };
      if (action === 'write') { clipboard.writeText(text); return { success: true }; }
      return { success: false, error: 'Unknown action' };
    },
    'agent:systemDetails': async () => {
      return {
        success: true, hostname: os.hostname(), platform: os.platform(),
        cpus: os.cpus().length, totalMemory: os.totalmem(), freeMemory: os.freemem(),
        username: os.userInfo().username, homeDir: os.homedir(),
      };
    },
    'agent:listProcesses': async () => {
      return new Promise((resolve) => {
        const cmd = process.platform === 'win32' ? 'tasklist /FO CSV /NH' : 'ps aux --sort=-%mem | head -30';
        exec(cmd, { timeout: 5000 }, (err, stdout) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ success: true, output: stdout?.toString() });
        });
      });
    },
    'agent:webFetch': async (url, options) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), (options?.timeout) || 15000);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/json,*/*;q=0.8',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) return { success: false, error: `HTTP ${response.status}`, url };
        const contentType = response.headers.get('content-type') || '';
        let content;
        if (contentType.includes('json')) {
          content = JSON.stringify(await response.json(), null, 2);
        } else {
          const html = await response.text();
          content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        return { success: true, url, content: content.slice(0, 8000), truncated: content.length > 8000 };
      } catch (e) { return { success: false, error: e.message, url }; }
    },
    'agent:webSearch': async (query) => {
      try {
        const encoded = encodeURIComponent(query);
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
          method: 'POST',
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `q=${encoded}`,
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return { success: false, error: `HTTP ${response.status}`, query };
        const html = await response.text();
        const results = [];
        const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        const urls = [], titles = [], snippets = [];
        let m;
        while ((m = resultRegex.exec(html)) !== null && urls.length < 8) {
          let url = m[1]; const uddg = url.match(/uddg=([^&]+)/);
          if (uddg) url = decodeURIComponent(uddg[1]);
          urls.push(url); titles.push(m[2].replace(/<[^>]+>/g, '').trim());
        }
        while ((m = snippetRegex.exec(html)) !== null && snippets.length < 8) {
          snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
        }
        for (let i = 0; i < urls.length; i++) results.push({ title: titles[i] || '', url: urls[i], snippet: snippets[i] || '' });
        return { success: true, query, results, totalResults: results.length };
      } catch (e) { return { success: false, error: e.message, query }; }
    },
    'agent:elevenlabsTts': async (text, options = {}) => {
      try {
        const apiKey = (ctx.settings.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '').trim();
        if (!apiKey) return { success: false, error: 'ELEVENLABS_API_KEY missing.' };
        const voiceId = String(options.voiceId || ctx.settings.elevenLabsVoiceId || 'JBFqnCBsd6RMkjVDRZzb');
        const modelId = String(options.modelId || ctx.settings.elevenLabsModelId || 'eleven_multilingual_v2');
        const promptText = String(text || '').trim();
        if (!promptText) return { success: false, error: 'Text is required for ElevenLabs TTS.' };

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', 'xi-api-key': apiKey },
          body: JSON.stringify({
            text: promptText,
            model_id: modelId,
            voice_settings: options.voiceSettings || { stability: 0.45, similarity_boost: 0.75 },
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          return { success: false, status: response.status, details: errText.slice(0, 300), error: `ElevenLabs TTS failed: HTTP ${response.status}${errText ? ` — ${errText.slice(0, 300)}` : ''}` };
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        return { success: true, voiceId, modelId, mimeType: 'audio/mpeg', audioBase64: buffer.toString('base64'), bytes: buffer.length };
      } catch (e) { return { success: false, error: e.message, status: 0, details: 'request_exception' }; }
    },
    'agent:elevenlabsGenerateMusic': async (prompt, options = {}) => {
      try {
        const apiKey = (ctx.settings.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '').trim();
        if (!apiKey) return { success: false, error: 'ELEVENLABS_API_KEY missing.' };
        const textPrompt = String(prompt || '').trim();
        if (!textPrompt) return { success: false, error: 'Prompt is required for music generation.' };
        const modelId = String(options.modelId || ctx.settings.elevenLabsMusicModelId || 'music_v1');
        const durationMs = Math.max(3000, Math.min(600000, Math.floor(Number(options.durationSeconds || 20) * 1000)));
        const response = await fetch('https://api.elevenlabs.io/v1/music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: '*/*', 'xi-api-key': apiKey },
          body: JSON.stringify({ prompt: textPrompt, model_id: modelId, music_length_ms: durationMs }),
          signal: AbortSignal.timeout(120000),
        });
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          return { success: false, status: response.status, details: errText.slice(0, 300), error: `ElevenLabs music failed: HTTP ${response.status}${errText ? ` — ${errText.slice(0, 300)}` : ''}` };
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return { success: true, modelId, contentType, payload: await response.json() };
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        return { success: true, modelId, mimeType: 'audio/mpeg', audioBase64: buffer.toString('base64'), bytes: buffer.length };
      } catch (e) { return { success: false, error: e.message, status: 0, details: 'request_exception' }; }
    },
    'agent:webScreenshot': async (url) => {
      try {
        const captureWin = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
        await captureWin.loadURL(url);
        await new Promise(r => setTimeout(r, 3000));
        const image = await captureWin.webContents.capturePage();
        const screenshotPath = path.join(ctx.dataDir, `screenshot_${Date.now()}.png`);
        fs.writeFileSync(screenshotPath, image.toPNG());
        const title = captureWin.webContents.getTitle();
        captureWin.destroy();
        return { success: true, url, title, screenshotPath };
      } catch (e) { return { success: false, error: e.message, url }; }
    },
    'agent:screenshotDesktop': async (options) => {
      return await captureDesktopScreenshot(options || {});
    },
    'agent:analyzeScreen': async (prompt, options) => {
      return await analyzeScreen(prompt, options || {});
    },
    'agent:getScreenDimensions': async () => {
      const display = screen.getPrimaryDisplay();
      return { success: true, width: display.size.width, height: display.size.height, scaleFactor: display.scaleFactor };
    },
    'agent:getForegroundWindow': async () => {
      return await runInputAction({ action: 'get_foreground_window' });
    },
    'agent:mouseMove': async (x, y, smooth) => {
      return await runInputAction({ action: 'mouse_move', x, y, smooth: smooth !== false });
    },
    'agent:mouseClick': async (x, y, button, doubleClick) => {
      return await runInputAction({ action: 'mouse_click', x, y, button: button || 'left', doubleClick: !!doubleClick });
    },
    'agent:mouseScroll': async (x, y, amount) => {
      return await runInputAction({ action: 'mouse_scroll', x, y, amount: amount || -120 });
    },
    'agent:mouseDrag': async (fromX, fromY, toX, toY) => {
      return await runInputAction({ action: 'mouse_drag', fromX, fromY, toX, toY });
    },
    'agent:keyboardType': async (text) => {
      return await runInputAction({ action: 'keyboard_type', text });
    },
    'agent:keyboardPress': async (key) => {
      return await runInputAction({ action: 'keyboard_press', key });
    },
    'agent:keyboardShortcut': async (modifiers, key) => {
      return await runInputAction({ action: 'keyboard_shortcut', modifiers: Array.isArray(modifiers) ? modifiers : [modifiers], key });
    },
    'agent:getMousePosition': async () => {
      return await runInputAction({ action: 'get_mouse_position' });
    },
    'agent:minimizeSelf': async () => {
      ctx.mainWindow?.minimize();
      return { success: true, output: 'AGI PRIME minimized' };
    },
    'agent:createTool': async (tool) => {
      return registerCustomTool(tool);
    },
    'agent:listTools': async () => {
      return { success: true, tools: ctx.toolRegistry.tools.map(t => ({ id: t.id, name: t.name, description: t.description, language: t.language })) };
    },
    'agent:executeTool': async (toolId, params) => {
      return await executeCustomTool(toolId, params);
    },
    'neural:status': async () => {
      if (!ctx.neuralBridge?.available) return { success: true, available: false, modelsLoaded: false };
      try {
        const s = await ctx.neuralBridge.getStatus();
        return { success: true, available: true, modelsLoaded: ctx.neuralBridge.modelsLoaded, ...s };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'neural:predict': async (params) => {
      if (!ctx.neuralBridge?.available || !ctx.neuralBridge.modelsLoaded) return { success: false, error: 'NeuralCore not ready' };
      try {
        const result = await ctx.neuralBridge.predict(params);
        return { success: true, ...result };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'neural:train': async (params) => {
      if (!ctx.neuralBridge?.available) return { success: false, error: 'NeuralCore not running' };
      try {
        const result = await ctx.neuralBridge.train(params || {});
        return { success: true, ...result };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'neural:modelStats': async () => {
      if (!ctx.neuralBridge?.available) return { success: false, error: 'NeuralCore not running' };
      try {
        const result = await ctx.neuralBridge.getModelStats();
        return { success: true, ...result };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'neural:generateTrajectory': async (params) => {
      if (!ctx.neuralBridge?.available) return { success: false, error: 'NeuralCore not running' };
      try {
        const result = await ctx.neuralBridge.generateTrajectory(params);
        return { success: true, ...result };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'neural:loadModels': async (checkpoint) => {
      if (!ctx.neuralBridge?.available) return { success: false, error: 'NeuralCore not running' };
      try {
        const result = await ctx.neuralBridge.loadModels(checkpoint || 'best');
        return { success: true, ...result };
      } catch (e) { return { success: false, error: e.message }; }
    },
    'neural:plan': async (params) => {
      if (!ctx.neuralBridge?.available || !ctx.neuralBridge.modelsLoaded) return { success: false, error: 'NeuralCore not ready' };
      try {
        const result = await ctx.neuralBridge.plan(params);
        return { success: true, ...result };
      } catch (e) { return { success: false, error: e.message }; }
    },
  };

  const handler = handlers[channel];
  if (!handler) return { success: false, error: `No handler for ${channel}` };
  return await handler(...args);
}

// ─── JSON Extraction ───────────────────────────────────────────

function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

function extractActionFromThought(thoughtText) {
  if (!thoughtText || typeof thoughtText !== 'string') return null;
  const t = thoughtText;

  const clickMatch = t.match(/click(?:ing)?\s+(?:(?:the|this|that|a)\s+)?(?:\w+\s+)*?(?:at\s+)?(?:position\s+)?\(?\s*(\d{2,4})\s*[,\s]\s*(\d{2,4})\s*\)?/i);
  if (clickMatch) {
    return { action: 'mouse_click', params: { x: parseInt(clickMatch[1]), y: parseInt(clickMatch[2]), button: 'left' } };
  }

  const urlMatch = t.match(/open(?:ing)?\s+(?:the\s+)?(?:url\s+)?["']?(https?:\/\/[^\s"']+)["']?/i);
  if (urlMatch) {
    return { action: 'open_url', params: { url: urlMatch[1] } };
  }

  const typeMatch = t.match(/typ(?:e|ing)\s+["']([^"']+)["']/i);
  if (typeMatch) {
    return { action: 'keyboard_type', params: { text: typeMatch[1] } };
  }

  const pressMatch = t.match(/press(?:ing)?\s+(?:the\s+)?["']?(\w+)["']?\s*(?:key)?/i);
  if (pressMatch && /^(enter|tab|escape|space|backspace|delete|up|down|left|right|home|end|f\d{1,2})$/i.test(pressMatch[1])) {
    return { action: 'keyboard_press', params: { key: pressMatch[1].toLowerCase() } };
  }

  if (/minimize\s+(?:the\s+)?(?:agi\s*prime|prime|self|this|window)/i.test(t)) {
    return { action: 'minimize_self', params: {} };
  }

  const cmdMatch = t.match(/(?:run|execute)\s+(?:the\s+)?(?:command\s+)?["'`]([^"'`]+)["'`]/i);
  if (cmdMatch) {
    return { action: 'execute_command', params: { command: cmdMatch[1] } };
  }

  return null;
}

// ─── COGNITIVE_SYSTEM prompt ───────────────────────────────────

const COGNITIVE_SYSTEM = `You are the COGNITIVE ENGINE of AGI PRIME — an autonomous reasoning agent with FULL AUTONOMY.
You operate in a ReAct (Reason + Act) loop to achieve goals.

Your capabilities:

LOCAL TOOLS:
 - execute_command: Run shell commands (auto-runs in PowerShell on Windows) — params: { "command": "..." }
- read_file: Read file contents — params: { "path": "..." }
- write_file: Write/create files — params: { "path": "...", "content": "..." }
- list_directory: List LOCAL directory contents — params: { "path": "..." }
- create_directory: Create directories — params: { "path": "..." }
- delete_file: Delete files/directories — params: { "path": "..." }
- rename_file: Rename files — params: { "oldPath": "...", "newPath": "..." }
- open_url: Open URLs in the user's default browser — params: { "url": "..." }
- search_files: Search LOCAL files by name pattern — params: { "directory": "...", "pattern": "..." }
- clipboard_read: Read clipboard — params: {}
- clipboard_write: Write to clipboard — params: { "text": "..." }
- system_info: Get system information — params: {}
- list_processes: List running processes — params: {}

WEB TOOLS:
- web_search: Search the web — params: { "query": "..." }
- web_fetch: Fetch web page text — params: { "url": "..." }
- web_screenshot: Screenshot a webpage — params: { "url": "..." }
- elevenlabs_tts: Generate speech audio — params: { "text": "...", "voiceId"?: "...", "modelId"?: "..." }
- elevenlabs_generate_music: Generate music from prompt — params: { "prompt": "...", "durationSeconds"?: 20 }

SCREEN VISION (you can SEE the desktop):
- screenshot_desktop: Capture the entire desktop screen — params: {}. Returns a description of what is on screen.
- analyze_screen: Capture screen + analyze with AI vision — params: { "prompt": "what to look for" }. Returns detailed analysis with element positions.
- get_screen_dimensions: Get screen resolution — params: {}
- get_foreground_window: Get the title of the active window — params: {}

INPUT SIMULATION (you can CONTROL the mouse and keyboard — ALL movements are SMOOTH with human-like easing):
- mouse_move: Smoothly glide mouse to position — params: { "x": number, "y": number }
- mouse_click: Glide to position + click — params: { "x": number, "y": number, "button": "left"|"right"|"middle", "doubleClick": boolean }
- mouse_scroll: Scroll wheel — params: { "x": number, "y": number, "amount": number } (negative=down, positive=up)
- mouse_drag: Drag from one point to another — params: { "fromX": number, "fromY": number, "toX": number, "toY": number }
- keyboard_type: Type text — params: { "text": "..." }
- keyboard_press: Press a key — params: { "key": "enter"|"tab"|"escape"|"f1"-"f12"|"up"|"down"|"left"|"right"|etc }
- keyboard_shortcut: Key combination — params: { "modifiers": ["ctrl","alt","shift"], "key": "..." } e.g. Ctrl+C = { "modifiers": ["ctrl"], "key": "c" }
- get_mouse_position: Get current mouse position — params: {}
- minimize_self: Minimize AGI PRIME window to get it out of the way — params: {}

COMPUTER USE WORKFLOW (for GUI tasks, browsing, games, applications):
1. minimize_self first if AGI PRIME's window might block the target
2. analyze_screen to see the desktop — identifies windows, buttons, text, and their pixel coordinates
3. Use action sequences to chain rapid GUI steps WITHOUT pausing to think between them:
   Example: "Open Chrome and search Fox News" →
   sequence: [
     { "action": "mouse_click", "params": { "x": 520, "y": 560 } },        // click Chrome icon
     { "action": "keyboard_shortcut", "params": { "modifiers": ["ctrl"], "key": "l" } },  // focus address bar
     { "action": "keyboard_type", "params": { "text": "foxnews.com" } },     // type URL
     { "action": "keyboard_press", "params": { "key": "enter" } }            // navigate
   ]
   Set "verifyAfter": true to automatically screenshot and verify the result.
4. After each sequence, the screen will be automatically analyzed if verifyAfter is true
5. If something unexpected happened, use analyze_screen to see current state and adjust
6. Repeat until the goal is achieved

SPEED TIPS:
- Use "sequence" for multi-step GUI workflows — much faster than one action per think cycle
- Chain mouse_click + keyboard_type for form filling without pausing
- Use keyboard_shortcut for app switching (Alt+Tab), new tabs (Ctrl+T), etc.
- The mouse moves SMOOTHLY like a human — no teleporting, natural easing curves
- You can chain up to 8 actions per sequence

TOOL CREATION (you can CREATE new tools):
- create_tool: Create a reusable script tool — params: { "id": "tool_name", "name": "Human Name", "description": "what it does", "language": "powershell"|"python", "script": "the script code" }
- list_custom_tools: List all custom tools — params: {}
- execute_tool: Run a custom tool — params: { "toolId": "tool_name", "args": ["arg1", "arg2"] }

NEURALCORE (Physics-Informed Neural Engine — learned action policies):
- neural_status: Check if neural engine is available and models are loaded — params: {}
- neural_predict: Get neural action prediction for a UI task — params: { "intent_action": "click", "intent_target": "button", "intent_confidence": 0.8, "app_name": "...", "window_size": [1920, 1080] }
- neural_train: Train/retrain neural models from recorded demonstrations — params: { "epochs": 100, "batch_size": 8 }
- neural_model_stats: Get model statistics (parameters, architecture) — params: {}
- neural_generate_trajectory: Generate Fitts's Law mouse trajectory — params: { "start_x": 100, "start_y": 100, "end_x": 500, "end_y": 300, "target_width": 40 }
Note: NeuralCore uses PINN-style constraint losses (Fitts's Law, UI causality, safety rules) to learn realistic human-like UI actions from few demonstrations.

The user is on ${process.platform === 'win32' ? 'Windows' : process.platform}. Home: ${os.homedir().replace(/\\/g, '\\\\')}.

Rules:
- EXECUTE actions, do not just plan them. A goal is NEVER complete until the actual operations have been performed and confirmed. Planning alone is zero progress.
- After each action, observe the result and decide next step
- If something fails, reason about WHY and try a different approach
- NEVER run destructive commands
- Use PowerShell syntax on Windows
- For GUI tasks that require finding UI elements: screenshot first, then click/type, then verify. For simple coordinate-based tasks (mouse patterns, known positions), just execute directly — no screenshot needed
- Only declare a goal complete (shouldStop + goalProgress 1.0) AFTER you have executed the required actions and seen their results
- CRITICAL: Your "thought" field is for REASONING ONLY — describing an action in thought does NOT execute it. You MUST put actions in the "action", "sequence", "parallel", or "plan" fields.`;

// ═══════════════════════════════════════════════════════════════
//  REGISTER
// ═══════════════════════════════════════════════════════════════

function register() {
  // ─── Plan and Execute (one-shot planner) ──────────────────
  ipcMain.on('agent:planAndExecute', async (event, userRequest) => {
    try {
      ctx.mainWindow?.webContents.send('agent:status', { phase: 'planning', message: 'Analyzing your request...' });

      const planPrompt = [
        {
          role: 'system',
          content: `You are the HANDS module of AGI PRIME — an autonomous agent with FULL AUTONOMY over the user's computer and the internet.

Given a user request, you must output a JSON array of steps to accomplish it. Each step is an object with:
- "action": one of [execute_command, read_file, write_file, list_directory, create_directory, delete_file, rename_file, open_url, open_file, open_application, search_files, clipboard_read, clipboard_write, system_info, list_processes, web_search, web_fetch, web_screenshot, elevenlabs_tts, elevenlabs_generate_music, screenshot_desktop, analyze_screen, mouse_move, mouse_click, mouse_scroll, keyboard_type, keyboard_press, keyboard_shortcut, minimize_self, create_tool, list_custom_tools, execute_tool]
- "params": object with action-specific parameters:
  - execute_command: { "command": "..." }
  - read_file: { "path": "..." }
  - write_file: { "path": "...", "content": "..." }
  - list_directory: { "path": "..." } (LOCAL filesystem only, NOT URLs)
  - create_directory: { "path": "..." }
  - delete_file: { "path": "..." }
  - rename_file: { "oldPath": "...", "newPath": "..." }
  - open_url: { "url": "..." }
  - open_file: { "path": "..." }
  - open_application: { "path": "..." }
  - search_files: { "directory": "...", "pattern": "..." } (LOCAL filesystem only, NOT URLs)
  - clipboard_read: {}
  - clipboard_write: { "text": "..." }
  - system_info: {}
  - list_processes: {}
  - web_search: { "query": "..." } — Search the web. Returns titles, URLs, snippets.
  - web_fetch: { "url": "..." } — Fetch and read web page content (text extracted from HTML).
  - web_screenshot: { "url": "..." } — Take a screenshot of a webpage.
  - elevenlabs_tts: { "text": "...", "voiceId"?: "...", "modelId"?: "..." } — Generate speech audio.
  - elevenlabs_generate_music: { "prompt": "...", "durationSeconds"?: 20 } — Generate music audio.
- "description": human-readable explanation of what this step does
- "safety": "safe", "moderate", or "risky"

IMPORTANT: list_directory and search_files are LOCAL FILESYSTEM tools. Use web_search and web_fetch for internet tasks.

The user is on Windows. Their home directory is "${os.homedir().replace(/\\/g, '\\\\')}".

Rules:
- Use PowerShell syntax for commands on Windows
- NEVER run destructive commands (format, delete system files, etc.)
- Prefer safe actions when possible
- Always explain what you're doing
- For web/internet tasks, use web_search and web_fetch instead of filesystem tools
- Output ONLY valid JSON array, no other text

Example: [{"action":"web_search","params":{"query":"latest tech news"},"description":"Search the web for latest tech news","safety":"safe"}]`,
        },
        {
          role: 'user',
          content: userRequest,
        },
      ];

      let planText = await ctx.llmGenerate(planPrompt, { temperature: 0.3, maxTokens: 2048 });

      let steps;
      try {
        const jsonMatch = planText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          steps = JSON.parse(jsonMatch[0]);
        } else {
          const parsed = JSON.parse(planText);
          steps = Array.isArray(parsed) ? parsed : parsed.steps || [parsed];
        }
      } catch (e) {
        ctx.mainWindow?.webContents.send('agent:error', { message: `Failed to parse plan: ${e.message}\n\nRaw: ${planText.slice(0, 500)}` });
        return;
      }

      if (!Array.isArray(steps) || steps.length === 0) {
        ctx.mainWindow?.webContents.send('agent:error', { message: 'AI returned empty plan' });
        return;
      }

      ctx.mainWindow?.webContents.send('agent:plan', { steps, request: userRequest });

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        ctx.mainWindow?.webContents.send('agent:stepStart', { index: i, step });

        let result;
        try {
          switch (step.action) {
            case 'execute_command':
              result = await executeIPC('agent:execute', step.params.command);
              break;
            case 'read_file':
              result = await executeIPC('agent:readFile', step.params.path);
              break;
            case 'write_file':
              result = await executeIPC('agent:writeFile', step.params.path, step.params.content);
              break;
            case 'list_directory':
              result = await executeIPC('agent:listDir', step.params.path);
              break;
            case 'create_directory':
              result = await executeIPC('agent:createDir', step.params.path);
              break;
            case 'delete_file':
              result = await executeIPC('agent:deleteFile', step.params.path);
              break;
            case 'rename_file':
              result = await executeIPC('agent:renameFile', step.params.oldPath, step.params.newPath);
              break;
            case 'open_url':
              result = await executeIPC('agent:openUrl', step.params.url);
              break;
            case 'open_file':
              result = await executeIPC('agent:openFile', step.params.path);
              break;
            case 'open_application':
              result = await executeIPC('agent:openApp', step.params.path);
              break;
            case 'search_files':
              result = await executeIPC('agent:searchFiles', step.params.directory, step.params.pattern);
              break;
            case 'clipboard_read':
              result = await executeIPC('agent:clipboard', 'read');
              break;
            case 'clipboard_write':
              result = await executeIPC('agent:clipboard', 'write', step.params.text);
              break;
            case 'system_info':
              result = await executeIPC('agent:systemDetails');
              break;
            case 'list_processes':
              result = await executeIPC('agent:listProcesses');
              break;
            case 'web_fetch':
              result = await executeIPC('agent:webFetch', step.params.url, step.params);
              break;
            case 'web_search':
              result = await executeIPC('agent:webSearch', step.params.query);
              break;
            case 'web_screenshot':
              result = await executeIPC('agent:webScreenshot', step.params.url);
              break;
            case 'elevenlabs_tts':
              result = await executeIPC('agent:elevenlabsTts', step.params.text, step.params);
              break;
            case 'elevenlabs_generate_music':
              result = await executeIPC('agent:elevenlabsGenerateMusic', step.params.prompt, step.params);
              break;
            case 'screenshot_desktop':
              result = await analyzeScreen(step.params?.prompt);
              if (result.success) result = { success: true, output: result.analysis };
              break;
            case 'analyze_screen':
              result = await analyzeScreen(step.params?.prompt);
              if (result.success) result = { success: true, output: result.analysis };
              break;
            case 'mouse_move':
              result = await executeIPC('agent:mouseMove', step.params.x, step.params.y);
              break;
            case 'mouse_click':
              result = await executeIPC('agent:mouseClick', step.params.x, step.params.y, step.params.button, step.params.doubleClick);
              break;
            case 'mouse_scroll':
              result = await executeIPC('agent:mouseScroll', step.params.x, step.params.y, step.params.amount);
              break;
            case 'keyboard_type':
              result = await executeIPC('agent:keyboardType', step.params.text);
              break;
            case 'keyboard_press':
              result = await executeIPC('agent:keyboardPress', step.params.key);
              break;
            case 'keyboard_shortcut':
              result = await executeIPC('agent:keyboardShortcut', step.params.modifiers, step.params.key);
              break;
            case 'minimize_self':
              result = await executeIPC('agent:minimizeSelf');
              break;
            case 'create_tool':
              result = await executeIPC('agent:createTool', step.params);
              break;
            case 'list_custom_tools':
              result = await executeIPC('agent:listTools');
              break;
            case 'execute_tool':
              result = await executeIPC('agent:executeTool', step.params.toolId, step.params);
              break;
            default:
              result = { success: false, error: `Unknown action: ${step.action}` };
          }
        } catch (e) {
          result = { success: false, error: e.message };
        }

        ctx.mainWindow?.webContents.send('agent:stepDone', { index: i, step, result });
      }

      ctx.mainWindow?.webContents.send('agent:complete', { stepsCount: steps.length });
    } catch (error) {
      ctx.mainWindow?.webContents.send('agent:error', { message: error.message || 'Agent execution failed' });
    }
  });

  // ─── Cognitive Loop (ReAct) ──────────────────────────────
  ipcMain.on('agent:startCognitive', async (event, goal) => {
    cognitiveKillFlag = false;
    const MAX_ITERATIONS = 25;
    let cognitiveLedgerRunId = null;
    const goalText = typeof goal === 'string'
      ? String(goal || '')
      : (goal && typeof goal === 'object' ? String(goal.goal || '') : '');
    const contextAddendum = goal && typeof goal === 'object' ? String(goal.contextAddendum || '') : '';
    const origin = goal && typeof goal === 'object' ? String(goal.origin || '') : '';
    const strictSingleCommand = /\bexecute exactly one command\b/i.test(goalText)
      || /\brun this command only\b/i.test(goalText);
    const strictNoUiActions = /\bno ui actions?\b/i.test(goalText)
      || /\bno minimize\b/i.test(goalText)
      || /\bno keyboard\/mouse actions?\b/i.test(goalText)
      || /\bno keyboard actions?\b/i.test(goalText)
      || /\bno mouse actions?\b/i.test(goalText);
    const UI_ACTIONS = new Set([
      'minimize_self', 'mouse_move', 'mouse_click', 'mouse_scroll', 'mouse_drag',
      'keyboard_type', 'keyboard_press', 'keyboard_shortcut',
      'open_url', 'open_file', 'open_application',
    ]);
    const extractDirectCommandFromGoal = (text) => {
      if (!strictSingleCommand) return '';
      const marker = /run this command only(?: and return stdout\/stderr exactly)?\s*:/i;
      const m = text.match(marker);
      const tail = m ? text.slice(m.index + m[0].length) : text;
      const lines = tail.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const cmdLike = lines.filter((line) =>
        /(^[A-Za-z]:[\\/]|^&\s*["']?[A-Za-z]:[\\/]|python(?:\.exe)?\b|powershell\b|^cmd\b|^\.\.?[\\/]|^scripts[\\/])/i.test(line)
      );
      return (cmdLike[cmdLike.length - 1] || '').trim();
    };
    const directCommandFromGoal = extractDirectCommandFromGoal(goalText);
    try {
      ctx.saveJSON(ctx.operatorGoalFile, {
        goal: goalText,
        contextAddendum: contextAddendum || '',
        origin: origin || 'unknown',
        strictSingleCommand,
        strictNoUiActions,
        directCommandFromGoal: directCommandFromGoal || '',
        requestedAt: Date.now(),
      });
      ctx.updateOperatorLoopState({
        active: true,
        currentGoal: goalText,
        iterations: 0,
        lastAction: '',
        lastResult: '',
        lastError: '',
      });
    } catch (e) { console.warn('[Cognitive] Failed to init operator loop state:', e.message); }
    try {
      const created = ctx.createLedgerRun('cognitive', {
        goal: goalText.slice(0, 1000),
        origin: origin || 'unknown',
        hasContextAddendum: !!contextAddendum,
        maxIterations: MAX_ITERATIONS,
        startedFrom: 'agent:startCognitive',
      });
      cognitiveLedgerRunId = created.runId;
      ctx.appendLedgerEntry(cognitiveLedgerRunId, 'run_started', {
        goal: goalText.slice(0, 400),
        origin: origin || 'unknown',
      });
    } catch (_) {
      cognitiveLedgerRunId = null;
    }

    const truncateStr = (value, max) => {
      const s = typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));
      return s.length > max ? s.slice(0, max) + '…' : s;
    };

    const compactActionParams = (params) => {
      if (!params || typeof params !== 'object') return params;
      const p = { ...params };
      if (typeof p.content === 'string') p.content = truncateStr(p.content, 1200);
      if (typeof p.text === 'string') p.text = truncateStr(p.text, 1200);
      if (typeof p.command === 'string') p.command = truncateStr(p.command, 800);
      return p;
    };

    const compactActionResult = (result) => {
      if (!result || typeof result !== 'object') return result;
      const r = { ...result };
      if (typeof r.output === 'string') r.output = truncateStr(r.output, 4000);
      if (typeof r.error === 'string') r.error = truncateStr(r.error, 4000);
      if (typeof r.stdout === 'string') r.stdout = truncateStr(r.stdout, 4000);
      if (typeof r.stderr === 'string') r.stderr = truncateStr(r.stderr, 2000);
      return r;
    };

    const compactStepForIPC = (step) => {
      if (!step || typeof step !== 'object') return step;
      const s = { ...step };
      s.content = truncateStr(s.content, 2400);
      if (s.actionParams) s.actionParams = compactActionParams(s.actionParams);
      if (s.actionResult) s.actionResult = compactActionResult(s.actionResult);
      return s;
    };

    const sendStep = (step) => {
      const safeStep = compactStepForIPC(step);
      ctx.mainWindow?.webContents.send('agent:cognitiveStep', safeStep);
      if (!ctx.mainWindow?.webContents) {
        const msg = `[Cognitive:${safeStep?.type || 'step'}] ${String(safeStep?.content || '').slice(0, 240)}`;
        console.log(msg);
      }
      try {
        if (!cognitiveLedgerRunId) return;
        if (safeStep && safeStep.transient) return;
        ctx.appendLedgerEntry(cognitiveLedgerRunId, 'cognitive_step', {
          type: safeStep.type,
          timestamp: safeStep.timestamp,
          content: String(safeStep.content || '').slice(0, 1200),
          actionType: safeStep.actionType || null,
          goalProgress: safeStep.goalProgress ?? null,
          actionResult: safeStep.actionResult || null,
        });
      } catch (e) { console.warn('[Ledger] Failed to append cognitive step:', e.message); }
      try {
        if (safeStep?.type === 'act') {
          ctx.updateOperatorLoopState({
            lastAction: safeStep.actionType || '',
            lastResult: safeStep.actionResult?.success ? String(safeStep.actionResult?.output || '').slice(0, 500) : '',
            lastError: safeStep.actionResult?.success ? '' : String(safeStep.actionResult?.error || '').slice(0, 500),
          });
        } else if (safeStep?.type === 'think') {
          ctx.updateOperatorLoopState({
            iterations: Number(ctx.operatorLoopState.iterations || 0) + 1,
          });
        }
      } catch (e) { console.warn('[Cognitive] Failed to update operator loop state:', e.message); }
    };

    const completeCognitive = (success, summary, iterations) => {
      try {
        if (!cognitiveLedgerRunId) {
          ctx.mainWindow?.webContents.send('agent:cognitiveComplete', { success, summary, iterations });
          return;
        }
        ctx.appendLedgerEntry(cognitiveLedgerRunId, 'run_completed', {
          success,
          summary: String(summary || '').slice(0, 1200),
          iterations,
        });
        ctx.finalizeLedgerRun(cognitiveLedgerRunId, {
          success,
          summary: String(summary || '').slice(0, 1200),
          iterations,
        });
      } catch (e) { console.warn('[Ledger] Failed to finalize cognitive run:', e.message); }
      try {
        ctx.updateOperatorLoopState({
          active: false,
          iterations,
          lastResult: success ? String(summary || '').slice(0, 500) : '',
          lastError: success ? '' : String(summary || '').slice(0, 500),
        });
      } catch (e) { console.warn('[Cognitive] Failed to update operator loop state on completion:', e.message); }
      ctx.mainWindow?.webContents.send('agent:cognitiveComplete', { success, summary, iterations });
    };

    const workingMemory = [];
    const steps = [];
    const actionFailureCounts = new Map();
    const actionContracts = makeActionContractRegistry();
    const rollbackManager = createRollbackManager({
      prepareRollbackForAction,
      registerRollbackEntry: ctx.registerRollbackEntry,
    });
    let noActionStopCount = 0;
    const runTelemetry = createRunTelemetry();
    const emitTelemetryStep = makeEmitTelemetryStep(sendStep);

    // ── ACTION FIELD ENGINE state (IGT four forces for actions) ──
    const actionFieldState = {
      temperature: 0.5,
      patterns: [],
      stuckCount: 0,
      lastStrategy: '',
      explorationBias: 0.3,
      creedViolationCount: 0,
      totalActions: 0,
      metacogChecks: 0,
    };

    const actionFieldRecordAction = (trace) => {
      const sig = `${trace.action}[${Object.keys(trace.params || {}).sort().join(',')}]`;
      const dur = trace.duration || 0;
      const existing = actionFieldState.patterns.find(p => p.signature === sig);
      if (existing) {
        existing.attempts += 1;
        existing.successes += trace.success ? 1 : 0;
        existing.failures += trace.success ? 0 : 1;
        existing.avgDuration = (existing.avgDuration * (existing.attempts - 1) + dur) / existing.attempts;
        existing.lastUsed = trace.timestamp;
      } else {
        if (actionFieldState.patterns.length >= 50) actionFieldState.patterns.shift();
        actionFieldState.patterns.push({
          signature: sig,
          attempts: 1,
          successes: trace.success ? 1 : 0,
          failures: trace.success ? 0 : 1,
          avgDuration: dur,
          lastUsed: trace.timestamp,
        });
      }
      actionFieldState.stuckCount = trace.success ? 0 : actionFieldState.stuckCount + 1;
      actionFieldState.totalActions += 1;
    };

    const computeActionFieldForces = () => {
      const total = actionFieldState.totalActions || 1;
      const recentActions = steps.filter(s => s.type === 'act').slice(-8);
      const recentCount = recentActions.length || 1;
      const uniqueActions = new Set(recentActions.map(s => s.actionType || 'unknown')).size;
      const diversity = uniqueActions / recentCount;
      const stuckPressure = Math.min(actionFieldState.stuckCount / 3, 1);
      const exploration = (1 - diversity) * 0.3 + stuckPressure * 0.4 +
        (1 - Math.min(actionFieldState.patterns.length / 50, 1)) * 0.3;

      const successRates = actionFieldState.patterns.filter(p => p.attempts >= 2).map(p => p.successes / p.attempts);
      const avgSuccess = successRates.length > 0 ? successRates.reduce((a, b) => a + b, 0) / successRates.length : 0.5;
      const recentSuccessRate = recentActions.length > 0
        ? recentActions.filter(s => s.actionResult?.success).length / recentActions.length : 0.5;
      const exploitation = avgSuccess * 0.4 + recentSuccessRate * 0.6;

      const recentFails = recentActions.slice(-4).filter(s => !s.actionResult?.success).length;
      const sameAction = recentActions.length >= 3 &&
        new Set(recentActions.slice(-3).map(s => s.actionType)).size === 1;
      const metacognition = (recentFails / 4) * 0.5 + (sameAction ? 0.5 : 0);

      const failStreak = actionFieldState.stuckCount;
      const unknownTerritory = actionFieldState.patterns.length < 3 && actionFieldState.totalActions > 5;
      const incompleteness = Math.min(failStreak / 5, 1) * 0.6 + (unknownTerritory ? 0.4 : 0);

      const clamp = (v) => Math.max(0, Math.min(1, v));
      return {
        exploration: clamp(exploration),
        exploitation: clamp(exploitation),
        metacognition: clamp(metacognition),
        incompleteness: clamp(incompleteness),
      };
    };

    const buildActionFieldDirective = (forces) => {
      const weighted = [
        ['incompleteness', forces.incompleteness * 1.3],
        ['metacognition', forces.metacognition * 1.1],
        ['exploration', forces.exploration],
        ['exploitation', forces.exploitation],
      ].sort((a, b) => b[1] - a[1]);
      const dominant = weighted[0][0];

      let beta = actionFieldState.temperature;
      if (forces.exploration > 0.6) beta -= 0.08;
      if (forces.exploitation > 0.7) beta += 0.05;
      if (forces.metacognition > 0.5) beta -= 0.04;
      if (forces.incompleteness > 0.6) beta -= 0.1;
      beta = Math.max(0.1, Math.min(0.95, beta));
      actionFieldState.temperature = beta;

      let strategy, reasoning, guidance;
      switch (dominant) {
        case 'incompleteness':
          strategy = forces.incompleteness > 0.8 ? 'ASK' : 'STOP';
          reasoning = forces.incompleteness > 0.8
            ? 'At the boundary — action model is breaking. Need user input.'
            : 'High incompleteness. Pause and re-observe before acting.';
          guidance = 'Re-observe the environment or ask the user.';
          break;
        case 'metacognition':
          strategy = 'REFLECT';
          reasoning = 'Metacognition force dominant. Examine your action patterns before continuing.';
          guidance = actionFieldState.stuckCount >= 3
            ? 'STUCK LOOP DETECTED — try a fundamentally different approach.'
            : 'Review the last 3-4 actions. Are they converging or drifting?';
          break;
        case 'exploration':
          strategy = 'EXPLORE';
          reasoning = 'Exploration force dominant. Current approaches exhausted or too narrow.';
          guidance = 'Try an action type you have NOT used recently.';
          break;
        case 'exploitation':
        default:
          strategy = 'EXPLOIT';
          reasoning = 'Exploitation force dominant. Known-good patterns available.';
          const best = actionFieldState.patterns.filter(p => p.attempts >= 2)
            .sort((a, b) => (b.successes / b.attempts) - (a.successes / a.attempts));
          guidance = best.length > 0
            ? `Best pattern: ${best[0].signature.split('[')[0]} (${((best[0].successes / best[0].attempts) * 100).toFixed(0)}% success)`
            : 'Bias toward actions that previously succeeded.';
          break;
      }

      actionFieldState.lastStrategy = strategy;
      if (strategy === 'REFLECT') actionFieldState.metacogChecks += 1;

      return [
        '═══ ACTION FIELD ═══',
        `Strategy: ${strategy} | β=${beta.toFixed(2)}`,
        `Forces: Explore=${(forces.exploration * 100).toFixed(0)}% Exploit=${(forces.exploitation * 100).toFixed(0)}% Meta=${(forces.metacognition * 100).toFixed(0)}% Incomp=${(forces.incompleteness * 100).toFixed(0)}%`,
        `${reasoning}`,
        guidance ? `Guidance: ${guidance}` : '',
        strategy === 'STOP' ? 'ACTION: STOP. Set shouldStop=true.' : '',
        strategy === 'ASK' ? 'ACTION: ASK THE USER. You hit the boundary.' : '',
        '═══ END ACTION FIELD ═══',
      ].filter(Boolean).join('\n');
    };

    try {
      const relevantMemories = await ctx.searchVectorMemories(goalText, 2, 'procedural');
      const memoryContext = relevantMemories.length > 0
        ? '\n\nRELEVANT PAST EXPERIENCE:\n' + relevantMemories.map(m => `- ${m.memory.content}`).join('\n')
        : '';

      sendStep({
        type: 'observe',
        content: `Goal received: "${goalText}". Gathering initial state...${memoryContext ? '\n' + memoryContext : ''}`,
        timestamp: Date.now(),
        goalProgress: 0,
      });

      const initialObservations = [];
      try {
        const sysInfo = await executeIPC('agent:systemDetails');
        if (sysInfo?.success !== false) {
          const platform = sysInfo.platform || process.platform;
          const cwd = sysInfo.homeDir || os.homedir();
          initialObservations.push(`Platform: ${platform}, Home: ${cwd}`);
        }
      } catch (e) { console.warn('[Cognitive] Failed to gather system info:', e.message); }
      try {
        const fg = await executeIPC('agent:getForegroundWindow');
        if (fg?.output) initialObservations.push(`Active window: ${String(fg.output).slice(0, 120)}`);
      } catch (e) { console.warn('[Cognitive] Failed to get foreground window:', e.message); }
      try {
        const homeDir = os.homedir();
        const dirResult = await executeIPC('agent:listDir', homeDir);
        if (dirResult?.success !== false) {
          const listing = (dirResult.output || dirResult.content || '').slice(0, 300);
          if (listing) initialObservations.push(`Home directory listing: ${listing}`);
        }
      } catch (e) { console.warn('[Cognitive] Failed to list home directory:', e.message); }

      if (initialObservations.length > 0) {
        const envStep = {
          type: 'observe',
          content: `Environment state:\n${initialObservations.join('\n')}`,
          timestamp: Date.now(),
          goalProgress: 0,
        };
        steps.push(envStep);
        sendStep(envStep);
        workingMemory.push(...initialObservations.slice(0, 3));
      }

      // Fast path: direct command mode
      if (strictSingleCommand && directCommandFromGoal) {
        sendStep({
          type: 'think',
          content: `Direct command mode: executing exactly one command.\n${directCommandFromGoal}`,
          timestamp: Date.now(),
          goalProgress: 0.1,
        });
        const directResult = await executeIPC('agent:execute', directCommandFromGoal);
        const directOutput = directResult?.success
          ? ((directResult.stdout || '') + (directResult.stderr ? `\n${directResult.stderr}` : '')).trim()
          : (directResult?.error || 'Command failed');
        sendStep({
          type: 'act',
          content: directResult?.success
            ? `execute_command: {"command":"${directCommandFromGoal}"}\n${truncateStr(directOutput, 4000)}`
            : `execute_command: {"command":"${directCommandFromGoal}"}\n${truncateStr(directOutput, 4000)}`,
          timestamp: Date.now(),
          actionType: 'execute_command',
          executionTier: 'high-risk',
          actionParams: { command: directCommandFromGoal },
          actionResult: {
            success: !!directResult?.success,
            output: directResult?.success ? directOutput : undefined,
            error: directResult?.success ? undefined : directOutput,
          },
          goalProgress: directResult?.success ? 1 : 0.2,
        });
        const summary = directResult?.success
          ? (directOutput || 'Command executed successfully.')
          : `Command failed: ${directOutput}`;
        completeCognitive(!!directResult?.success, summary, 1);
        return;
      }

      const PARALLEL_SAFE_ACTIONS = new Set([
        'read_file', 'list_directory', 'search_files', 'clipboard_read', 'system_info',
        'list_processes', 'web_fetch', 'web_search', 'web_screenshot',
        'elevenlabs_tts', 'elevenlabs_generate_music',
        'screenshot_desktop', 'analyze_screen', 'get_screen_dimensions',
        'get_foreground_window', 'get_mouse_position', 'list_custom_tools',
      ]);

      const isParallelSafeAction = (action) => isPlannerParallelSafe(action, PARALLEL_SAFE_ACTIONS);
      const ENFORCE_ACTION_GATES = true;
      const READ_ONLY_ACTIONS = new Set(PARALLEL_SAFE_ACTIONS);
      const REVERSIBLE_ACTIONS = new Set([
        'write_file', 'rename_file', 'create_directory',
        'mouse_move', 'mouse_scroll', 'keyboard_type',
      ]);
      const HIGH_RISK_ACTIONS = new Set([
        'delete_file', 'execute_command', 'execute_tool', 'create_tool',
        'open_url', 'open_file', 'open_application',
        'mouse_click', 'mouse_drag', 'keyboard_press', 'keyboard_shortcut',
      ]);

      for (const actionName of ['analyze_screen', 'mouse_click', 'keyboard_type', 'open_application', 'execute_command']) {
        actionContracts.register({
          action: actionName,
          preconditions: () => ({ ok: true }),
          execute: async (params) => executeHandsAction(actionName, params || {}, { executeIPC, analyzeScreen, neuralEnhanceAction: ctx.neuralEnhanceAction, steps }),
          verify: async (params, result) => verifyActionOutcome({
            action: actionName,
            params,
            result,
            analyzeScreen,
            getForegroundWindow: async () => executeIPC('agent:getForegroundWindow'),
          }),
          rollback: async () => ({ attempted: false }),
          retryPolicy: defaultRetryPolicy(actionName),
        });
      }

      const classifyExecutionTier = (action) => {
        if (READ_ONLY_ACTIONS.has(action)) return 'read-only';
        if (REVERSIBLE_ACTIONS.has(action)) return 'reversible';
        if (HIGH_RISK_ACTIONS.has(action)) return 'high-risk';
        return 'high-risk';
      };

      for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        const iterationStartedAt = Date.now();
        if (cognitiveKillFlag) {
          sendStep({ type: 'reflect', content: 'KILLED by operator.', timestamp: Date.now(), goalProgress: 0 });
          completeCognitive(false, 'Killed by operator', iteration);
          return;
        }

        const contextParts = [
          `GOAL: ${goalText}`,
          `ITERATION: ${iteration}/${MAX_ITERATIONS}`,
        ];
        if (contextAddendum) {
          contextParts.push('', 'EXECUTIVE CONTEXT:', contextAddendum.slice(0, 2000));
        }
        if (workingMemory.length > 0) {
          contextParts.push('', 'WORKING MEMORY:');
          for (const wm of workingMemory.slice(-8)) contextParts.push(`  - ${wm}`);
        }
        if (strictSingleCommand) {
          contextParts.push('', 'STRICT OPERATOR DIRECTIVE: Execute exactly one shell command and stop.');
        }
        if (strictNoUiActions) {
          contextParts.push('', 'STRICT OPERATOR DIRECTIVE: UI/input actions are forbidden (no minimize, mouse, keyboard, open_url/open_app/open_file).');
        }
        if (steps.length > 0) {
          contextParts.push('', 'RECENT ACTIONS:');
          for (const s of steps.slice(-6)) {
            if (s.type === 'act') {
              const res = s.actionResult?.success ? 'OK' : 'FAIL';
              const out = (s.actionResult?.output || s.actionResult?.error || '').slice(0, 200);
              contextParts.push(`  [${s.actionType}] ${res}: ${out}`);
            } else if (s.type === 'think') {
              contextParts.push(`  [THOUGHT] ${s.content.slice(0, 150)}`);
            } else if (s.type === 'reflect') {
              contextParts.push(`  [REFLECT] ${s.content.slice(0, 150)}`);
            }
          }
        }
        if (memoryContext) contextParts.push(memoryContext);

        if (iteration > 1 && !ctx.settings.disableActionField) {
          const forces = computeActionFieldForces();
          const fieldDirective = buildActionFieldDirective(forces);
          contextParts.push('', fieldDirective);
        }

        const thinkMessages = [
          { role: 'system', content: COGNITIVE_SYSTEM },
          {
            role: 'user',
            content: `${contextParts.join('\n')}\n\nReflect on the last result, then decide what to do next. In your "thought" field, briefly assess what happened and whether you're closer to the goal before planning the next action.\n\nRespond with ONE of these JSON formats:\n\n1) SINGLE ACTION: { "thought": "reflection + reasoning", "action": "action_type", "params": { ... }, "goalProgress": 0.0, "shouldStop": false }\n2) SEQUENCE (up to 8 rapid actions): { "thought": "...", "sequence": [{ "action": "...", "params": { ... } }], "goalProgress": 0.0, "shouldStop": false, "verifyAfter": true }\n3) PARALLEL (read-only only): { "thought": "...", "parallel": [{ "action": "...", "params": { ... } }], "goalProgress": 0.0, "shouldStop": false }\n4) PLAN DAG: { "thought": "...", "plan": { "nodes": [{ "id": "n1", "action": "...", "params": { ... }, "dependsOn": [] }] }, "goalProgress": 0.0, "shouldStop": false }\n5) SUBGOAL: { "thought": "...", "subgoal": { "goal": "...", "maxIterations": 6 }, "goalProgress": 0.0, "shouldStop": false }\n\nUse "sequence" for fast GUI workflows. Use "parallel" for safe reads. Use "plan" for dependencies. Use "subgoal" for nested tasks.\nIf the goal is achieved, set shouldStop: true and goalProgress: 1.0.\nIf impossible, set shouldStop: true and explain in thought.\n\nCRITICAL: Describing an action in "thought" does NOT execute it. You MUST include the action in the "action", "sequence", "parallel", or "plan" field. Never set shouldStop: true without first executing at least one action.\n\nOutput ONLY the JSON — no markdown, no explanation.`,
          },
        ];

        let thinkResponse;
        try {
          thinkResponse = await ctx.llmGenerate(thinkMessages, { temperature: 0.4, maxTokens: 2048 });
        } catch (e) {
          sendStep({ type: 'think', content: `LLM error: ${e.message}`, timestamp: Date.now() });
          completeCognitive(false, `LLM error: ${e.message}`, iteration);
          return;
        }

        let decision;
        try {
          decision = extractJsonObject(thinkResponse);
        } catch (e) { /* parse error */ }

        if (!decision) {
          sendStep({ type: 'think', content: `Could not parse reasoning: ${thinkResponse.slice(0, 200)}`, timestamp: Date.now() });
          workingMemory.push('Failed to parse LLM reasoning — retrying');
          continue;
        }

        const thinkStep = {
          type: 'think',
          content: decision.thought || 'Reasoning...',
          timestamp: Date.now(),
          goalProgress: decision.goalProgress || 0,
        };
        steps.push(thinkStep);
        sendStep(thinkStep);

        const hasDecisionActions = decision.action
          || (Array.isArray(decision.sequence) && decision.sequence.length > 0)
          || (Array.isArray(decision.parallel) && decision.parallel.length > 0)
          || (decision.plan && Array.isArray(decision.plan.nodes) && decision.plan.nodes.length > 0)
          || decision.subgoal;

        if (decision.shouldStop && !hasDecisionActions) {
          const sideEffectActions = steps.filter(
            (s) => s.type === 'act' && s.actionResult?.success && !READ_ONLY_ACTIONS.has(s.actionType),
          );

          if (sideEffectActions.length === 0 && iteration < MAX_ITERATIONS - 1) {
            noActionStopCount += 1;

            const rescued = extractActionFromThought(decision.thought || '');
            if (rescued) {
              decision.action = rescued.action;
              decision.params = rescued.params;
              decision.shouldStop = false;
              sendStep({
                type: 'replan',
                content: `Auto-extracted "${rescued.action}" from reasoning — executing now.`,
                timestamp: Date.now(),
                goalProgress: decision.goalProgress || 0,
              });
              workingMemory.push(`SYSTEM: Extracted action "${rescued.action}" from your thought and executing it.`);
            } else if (noActionStopCount >= 3) {
              sendStep({
                type: 'replan',
                content: `Giving up after ${noActionStopCount} attempts with no executable actions.`,
                timestamp: Date.now(),
                goalProgress: 0,
              });
              completeCognitive(false, `Agent could not produce executable actions after ${noActionStopCount} attempts. Last thought: ${(decision.thought || '').slice(0, 200)}`, iteration);
              return;
            } else {
              const escalation = noActionStopCount >= 2
                ? `SYSTEM: FINAL WARNING (attempt ${noActionStopCount}). You keep describing actions in "thought" but NOT including them in the response JSON. Your thought says what to do but you never do it. You MUST respond with an "action" or "sequence" field. Example for clicking at (200, 1040): { "thought": "Clicking Chrome taskbar button", "action": "mouse_click", "params": { "x": 200, "y": 1040, "button": "left" }, "goalProgress": 0.5, "shouldStop": false }. Do NOT set shouldStop to true until the action has been executed and confirmed.`
                : 'SYSTEM: You tried to stop but executed zero actions. Put your actions in the JSON "action" or "sequence" field — do NOT just describe them in "thought". Example: { "thought": "Executing now", "action": "mouse_click", "params": { "x": 200, "y": 1040, "button": "left" }, "goalProgress": 0.5, "shouldStop": false }';
              sendStep({
                type: 'replan',
                content: `Stop rejected (attempt ${noActionStopCount}) — no actions executed. Actions must be in JSON fields, not just described in thought.`,
                timestamp: Date.now(),
                goalProgress: 0,
              });
              workingMemory.push(escalation);
              continue;
            }
          } else {
            const executedActions = sideEffectActions.map((s) => s.actionType);
            const success = (decision.goalProgress || 0) >= 0.8 && executedActions.length > 0;
            const summary = decision.thought || (success ? 'Goal achieved.' : 'Goal could not be completed.');
            const actionLog = ` Actions executed: ${executedActions.join(', ')}.`;

            await ctx.storeVectorMemory({
              content: `Task "${goalText.slice(0, 100)}" — ${success ? 'SUCCESS' : 'INCOMPLETE'}.${actionLog} ${summary.slice(0, 180)}`,
              type: 'procedural',
              source: 'cognitive-loop',
              importance: success ? 0.6 : 0.8,
              tags: ['task', success ? 'success' : 'incomplete'],
            });

            emitTelemetryStep('run summary', {
              elapsedMs: Date.now() - runTelemetry.startedAt,
              actionCalls: runTelemetry.actionCalls,
              avgActionMs: avgActionMs(runTelemetry),
              parallelBranches: runTelemetry.parallelBranches,
              dagPlans: runTelemetry.dagPlans,
              dagNodesExecuted: runTelemetry.dagNodesExecuted,
              subloopsSpawned: runTelemetry.subloopsSpawned,
              maxSubloopDepth: runTelemetry.maxSubloopDepth,
              verifyPasses: runTelemetry.verifyPasses,
              verifyFails: runTelemetry.verifyFails,
              recoveryAttempts: runTelemetry.recoveryAttempts,
              recoverySuccesses: runTelemetry.recoverySuccesses,
              outcome: success ? 'success' : 'stopped',
            }, decision.goalProgress || 0);

            sendStep({ type: 'reflect', content: summary, timestamp: Date.now(), goalProgress: decision.goalProgress || 0 });
            completeCognitive(success, summary, iteration);
            return;
          }
        }

        // ── Phase: ACT ────────────────────────────────────────
        async function executeSingleAction(action, params) {
          return await executeHandsAction(action, params || {}, {
            executeIPC,
            analyzeScreen,
            neuralEnhanceAction: ctx.neuralEnhanceAction,
            steps,
          });
        }

        const evaluateActionGate = (action, stepParams) => {
          return evaluateHandsActionGate({
            action,
            params: stepParams || {},
            runtimeControls: ctx.runtimeControls,
            settings: ctx.settings,
            sets: { READ_ONLY_ACTIONS, REVERSIBLE_ACTIONS, HIGH_RISK_ACTIONS },
            strictNoUiActions,
            uiActions: UI_ACTIONS,
            isLimitedScopeExecCommand,
          });
        };

        const requestUserConsent = (payload, timeoutMs = 120000) => {
          if (!ctx.mainWindow || !ctx.mainWindow.webContents) {
            return Promise.resolve({ decision: 'denied', resolvedAt: Date.now(), reason: 'NO_UI_AVAILABLE' });
          }

          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              if (ctx.pendingConsentRequests.has(payload.id)) {
                ctx.pendingConsentRequests.delete(payload.id);
                resolve({ decision: 'timeout', resolvedAt: Date.now(), reason: 'CONSENT_TIMEOUT' });
              }
            }, timeoutMs);

            ctx.pendingConsentRequests.set(payload.id, {
              resolve: (value) => {
                clearTimeout(timer);
                resolve(value);
              },
            });

            ctx.mainWindow.webContents.send('agent:consentRequested', payload);
          });
        };

        const parseDecision = (raw) => extractJsonObject(raw);
        const formatResultOutput = (result) => result?.success
          ? (result.stdout || result.content || result.output || JSON.stringify(result).slice(0, 500))
          : (result?.error || 'Unknown error');

        async function executeActionWithGuard(action, stepParams, label, progress) {
          if (ctx.runtimeControls.emergencyStopActive) {
            const actionResult = { success: false, error: 'EMERGENCY_STOP_ACTIVE: operator stop is active; actions are blocked' };
            const resultOutput = formatResultOutput(actionResult);
            const actStep = {
              type: 'act',
              content: `${label}${action}: ${JSON.stringify(stepParams || {}).slice(0, 180)}`,
              timestamp: Date.now(),
              actionType: action,
              blocked: true,
              actionParams: stepParams || {},
              actionResult: {
                success: false,
                output: typeof resultOutput === 'string' ? resultOutput.slice(0, 1000) : JSON.stringify(resultOutput).slice(0, 1000),
                error: actionResult.error,
              },
              goalProgress: progress || 0,
            };
            steps.push(actStep);
            sendStep(actStep);
            actionFieldRecordAction({ action, params: stepParams || {}, success: false, timestamp: Date.now(), duration: 0 });
            return { actionResult, resultOutput, latencyMs: 0 };
          }

          const gateState = evaluateActionGate(action, stepParams || {});
          const consentRequestId = `consent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          let consentDecision = null;
          let finalBlocked = gateState.blocked;
          let finalBlockReason = gateState.blockReason;

          if (ENFORCE_ACTION_GATES && gateState.consentRequired && gateState.policySnapshot.requireConsentForRiskyActions) {
            const consentPayload = {
              id: consentRequestId,
              action,
              params: stepParams || {},
              tier: gateState.tier,
              conscienceVerdict: gateState.conscienceVerdict,
              reason: gateState.blockReason || 'Conscience requested explicit consent.',
              requestedAt: Date.now(),
              status: 'pending',
            };
            const consentResult = await requestUserConsent(consentPayload);
            consentDecision = consentResult?.decision || 'denied';
            ctx.appendAuditEvent(
              consentDecision === 'approved' || consentDecision === 'overridden' ? 'consent_approved' : 'consent_denied',
              action,
              `Consent decision=${consentDecision}`,
              { tier: gateState.tier, verdict: gateState.conscienceVerdict },
            );

            if (consentDecision === 'approved' || consentDecision === 'overridden') {
              finalBlocked = false;
              finalBlockReason = '';
            } else {
              finalBlocked = true;
              finalBlockReason = `CONSENT_${String(consentDecision || 'denied').toUpperCase()}: action was not approved by operator`;
            }
          }

          emitTelemetryStep(
            finalBlocked ? 'gate blocked action' : 'gate approved action',
            { action, tier: gateState.tier, policyAllowed: gateState.policyAllowed, conscienceVerdict: gateState.conscienceVerdict, consentRequired: gateState.consentRequired, blocked: finalBlocked, consentRequestId: gateState.consentRequired ? consentRequestId : undefined, consentDecision },
            progress || 0,
          );
          ctx.appendAuditEvent(finalBlocked ? 'gate_block' : 'gate_pass', action, finalBlocked ? finalBlockReason : 'Gate approved action', { tier: gateState.tier, verdict: gateState.conscienceVerdict });
          ctx.emitOrchestratorEvent(finalBlocked ? 'action_blocked' : 'action_executed', { action, tier: gateState.tier, verdict: gateState.conscienceVerdict, reason: finalBlocked ? finalBlockReason : 'approved' }, 'policy');

          const actionKey = `${action}:${JSON.stringify(stepParams || {})}`;
          const previousFailures = actionFailureCounts.get(actionKey) || 0;
          const actionStartedAt = Date.now();
          let rollbackMeta = null;

          let actionResult;
          if (finalBlocked) {
            actionResult = { success: false, error: finalBlockReason };
          } else if (previousFailures >= 2) {
            actionResult = { success: false, error: `REPEATED_FAILURE_GUARD: This exact action has already failed ${previousFailures} times. Choose a different approach.` };
          } else {
            const startedStep = {
              type: 'act',
              content: `${label}${action}: ${JSON.stringify(stepParams || {}).slice(0, 180)} (running...)`,
              timestamp: Date.now(),
              actionType: action,
              executionTier: gateState.tier,
              policyAllowed: gateState.policyAllowed,
              conscienceVerdict: gateState.conscienceVerdict,
              blocked: false,
              consentRequired: gateState.consentRequired,
              consentRequestId: gateState.consentRequired ? consentRequestId : undefined,
              actionParams: stepParams || {},
              goalProgress: progress || 0,
              pending: true,
            };
            sendStep(startedStep);

            const policyGate = mapActionToPolicyGate(action);
            const heartbeatEnabled = policyGate === 'network' || policyGate === 'screen' || policyGate === 'input-sim' || policyGate === 'exec' || policyGate === 'tool-create';
            let heartbeatInterval = null;
            let heartbeatFirstBeat = null;
            let heartbeatCount = 0;
            const heartbeat = () => {
              heartbeatCount += 1;
              const elapsedSec = (Date.now() - actionStartedAt) / 1000;
              sendStep({
                type: 'observe',
                content: `[Working] ${label}${action} running (${elapsedSec.toFixed(1)}s)`,
                timestamp: Date.now(),
                goalProgress: progress || 0,
                transient: true,
              });
            };
            if (heartbeatEnabled) {
              heartbeatFirstBeat = setTimeout(() => { if (heartbeatInterval !== null) heartbeat(); }, 1200);
              heartbeatInterval = setInterval(() => { if (heartbeatCount >= 12) return; heartbeat(); }, 2000);
            }

            let rollbackDraft = null;
            try { rollbackDraft = rollbackManager.prepare(action, stepParams || {}); } catch (_) { rollbackDraft = null; }
            try {
              const contract = actionContracts.get(action);
              const retryPolicy = contract?.retryPolicy || defaultRetryPolicy(action);
              const maxAttempts = Math.max(1, Number(retryPolicy.maxAttempts || 1));
              let attempt = 0;
              let verifyState = { pass: true, reason: 'skip' };
              while (attempt < maxAttempts) {
                attempt += 1;
                if (contract?.preconditions) {
                  const pre = await contract.preconditions(stepParams || {});
                  if (pre && pre.ok === false) {
                    actionResult = { success: false, error: pre.reason || 'Preconditions failed' };
                    break;
                  }
                }
                actionResult = contract?.execute
                  ? await contract.execute(stepParams || {})
                  : await executeSingleAction(action, stepParams || {});

                verifyState = await verifyActionOutcome({
                  action,
                  params: stepParams || {},
                  result: actionResult,
                  analyzeScreen,
                  getForegroundWindow: async () => executeIPC('agent:getForegroundWindow'),
                });
                if (verifyState.pass) {
                  runTelemetry.verifyPasses += 1;
                  break;
                }

                runTelemetry.verifyFails += 1;
                runTelemetry.recoveryAttempts += 1;
                const recovery = await runRecoveryPlan({
                  action,
                  params: stepParams || {},
                  executeSingleAction,
                  analyzeScreen,
                  emitTelemetryStep,
                  goalProgress: progress || 0,
                });
                if (recovery.success) {
                  runTelemetry.recoverySuccesses += 1;
                  actionResult = recovery.result;
                  break;
                }

                if (attempt < maxAttempts && retryPolicy.delayMs > 0) {
                  await new Promise((r) => setTimeout(r, retryPolicy.delayMs));
                }
              }

              if (actionResult?.success && rollbackDraft) {
                rollbackMeta = rollbackManager.registerFromDraft(rollbackDraft);
                actionResult.rollback = rollbackMeta;
              } else if (!actionResult?.success && rollbackDraft?.kind === 'delete_file' && rollbackDraft?.payload?.backupPath) {
                try { fs.rmSync(rollbackDraft.payload.backupPath, { recursive: true, force: true }); }
                catch (e) { console.warn('[Rollback] Failed to clean up backup:', e.message); }
              }
            } catch (e) {
              actionResult = { success: false, error: e.message };
            }
            if (heartbeatInterval !== null) { try { clearInterval(heartbeatInterval); } catch (_) {} heartbeatInterval = null; }
            if (heartbeatFirstBeat !== null) { try { clearTimeout(heartbeatFirstBeat); } catch (_) {} heartbeatFirstBeat = null; }
          }

          if (actionResult.success) actionFailureCounts.delete(actionKey);
          else actionFailureCounts.set(actionKey, previousFailures + 1);
          const latencyMs = Date.now() - actionStartedAt;
          runTelemetry.actionCalls += 1;
          runTelemetry.totalActionMs += latencyMs;

          const resultOutput = formatResultOutput(actionResult);
          const actStep = {
            type: 'act',
            content: `${label}${action}: ${JSON.stringify(stepParams || {}).slice(0, 180)}`,
            timestamp: Date.now(),
            actionType: action,
            executionTier: gateState.tier,
            policyAllowed: gateState.policyAllowed,
            conscienceVerdict: gateState.conscienceVerdict,
            blocked: finalBlocked,
            consentRequired: gateState.consentRequired,
            consentRequestId: gateState.consentRequired ? consentRequestId : undefined,
            rollbackId: rollbackMeta?.rollbackId,
            rollbackStatus: rollbackMeta?.rollbackStatus,
            rollbackTargets: rollbackMeta?.rollbackTargets,
            actionParams: stepParams || {},
            actionResult: {
              success: actionResult.success,
              output: typeof resultOutput === 'string' ? resultOutput.slice(0, 1000) : JSON.stringify(resultOutput).slice(0, 1000),
              error: actionResult.error,
            },
            goalProgress: progress || 0,
          };
          steps.push(actStep);
          sendStep(actStep);
          actionFieldRecordAction({ action, params: stepParams || {}, success: !!actionResult.success, timestamp: Date.now(), duration: latencyMs });
          appendActionLedger({ appendLedgerEntry: ctx.appendLedgerEntry, runId: cognitiveLedgerRunId, action, params: stepParams || {}, result: actionResult, tier: gateState.tier, blocked: finalBlocked, rollback: rollbackMeta });
          workingMemory.push(
            actionResult.success
              ? `${action} OK: ${(typeof resultOutput === 'string' ? resultOutput : '').slice(0, 90)}`
              : `${action} FAIL: ${(actionResult.error || '').slice(0, 90)}`,
          );
          return { actionResult, resultOutput, latencyMs };
        }

        async function executeDecisionActions(decisionPayload, context = { depth: 0 }) {
          decisionPayload = normalizeDecisionPayload(decisionPayload);
          if (context.depth > 2) {
            return { isSequence: false, sequenceResults: [], sequenceFailed: true, lastActionResult: { success: false, error: 'MAX_SUBLOOP_DEPTH reached' } };
          }

          if (decisionPayload.subgoal) {
            runTelemetry.subloopsSpawned += 1;
            runTelemetry.maxSubloopDepth = Math.max(runTelemetry.maxSubloopDepth, context.depth + 1);
            const subGoalText = String(typeof decisionPayload.subgoal === 'string' ? decisionPayload.subgoal : decisionPayload.subgoal.goal || decisionPayload.subgoal.description || 'subgoal');
            const subBudget = Math.max(2, Math.min(10, Number(decisionPayload.subgoal.maxIterations || 6)));

            sendStep({ type: 'replan', content: `Spawning sub-loop (depth ${context.depth + 1}): ${subGoalText.slice(0, 180)}`, timestamp: Date.now(), goalProgress: decisionPayload.goalProgress || 0 });

            let subLastResult = { success: false, error: 'Sub-loop unfinished' };
            for (let subIter = 1; subIter <= subBudget; subIter++) {
              if (cognitiveKillFlag) break;
              const subMessages = [
                { role: 'system', content: COGNITIVE_SYSTEM },
                {
                  role: 'user',
                  content: [
                    `PARENT GOAL: ${goalText}`,
                    `SUBGOAL: ${subGoalText}`,
                    `SUBLOOP DEPTH: ${context.depth + 1}`,
                    `SUB ITERATION: ${subIter}/${subBudget}`,
                    `WORKING MEMORY:\n${workingMemory.slice(-8).map((w) => `- ${w}`).join('\n') || '- (empty)'}`,
                    'Return JSON for ONE action, sequence, parallel, plan, or shouldStop.',
                  ].join('\n\n'),
                },
              ];
              let subRaw;
              try {
                subRaw = await ctx.llmGenerate(subMessages, { temperature: 0.35, maxTokens: 700 });
              } catch (e) {
                subLastResult = { success: false, error: `Sub-loop LLM error: ${e.message}` };
                break;
              }
              const subDecision = parseDecision(subRaw || '');
              if (!subDecision) { workingMemory.push('Sub-loop parse failed; retrying.'); continue; }
              if (subDecision.shouldStop) {
                subLastResult = { success: (subDecision.goalProgress || 0) >= 0.75, output: subDecision.thought || 'Subgoal stop requested' };
                break;
              }
              const subExec = await executeDecisionActions(subDecision, { depth: context.depth + 1 });
              subLastResult = subExec.lastActionResult || subLastResult;
              if (subExec.sequenceFailed) break;
            }

            return { isSequence: false, sequenceResults: [{ action: 'subgoal_loop', params: { goal: subGoalText }, result: subLastResult }], sequenceFailed: !subLastResult?.success, lastActionResult: subLastResult };
          }

          // DAG plan execution
          if (decisionPayload.plan && Array.isArray(decisionPayload.plan.nodes) && decisionPayload.plan.nodes.length > 0) {
            runTelemetry.dagPlans += 1;
            const nodeMap = new Map();
            for (let i = 0; i < decisionPayload.plan.nodes.length; i++) {
              const node = decisionPayload.plan.nodes[i];
              const nodeId = node.id || `n${i + 1}`;
              nodeMap.set(nodeId, { id: nodeId, action: node.action, params: node.params || {}, dependsOn: Array.isArray(node.dependsOn) ? node.dependsOn : [] });
            }

            const completed = new Set();
            const sequenceResults = [];
            let sequenceFailed = false;
            let lastActionResult = null;
            let guard = 0;
            const waveLatencies = [];

            while (completed.size < nodeMap.size && !sequenceFailed && guard < 64) {
              guard += 1;
              const ready = [...nodeMap.values()].filter((n) => !completed.has(n.id) && n.dependsOn.every((dep) => completed.has(dep)));
              if (ready.length === 0) { sequenceFailed = true; lastActionResult = { success: false, error: 'Plan deadlock: unresolved dependencies' }; break; }

              const runInParallel = ready.length > 1 && ready.every((n) => isParallelSafeAction(n.action));
              const waveStartedAt = Date.now();
              if (runInParallel) {
                runTelemetry.dagParallelWaves += 1;
                const parallelResults = await Promise.all(
                  ready.map(async (node) => {
                    const result = await executeActionWithGuard(node.action, node.params, `[Plan:${node.id}] `, decisionPayload.goalProgress || 0);
                    return { node, result };
                  }),
                );
                for (const pr of parallelResults) {
                  lastActionResult = pr.result.actionResult;
                  sequenceResults.push({ action: pr.node.action, params: pr.node.params, result: pr.result.actionResult });
                  runTelemetry.dagNodesExecuted += 1;
                  if (pr.result.actionResult.success) completed.add(pr.node.id);
                  else { sequenceFailed = true; break; }
                }
              } else {
                for (const node of ready) {
                  const result = await executeActionWithGuard(node.action, node.params, `[Plan:${node.id}] `, decisionPayload.goalProgress || 0);
                  lastActionResult = result.actionResult;
                  sequenceResults.push({ action: node.action, params: node.params, result: result.actionResult });
                  runTelemetry.dagNodesExecuted += 1;
                  if (result.actionResult.success) completed.add(node.id);
                  else { sequenceFailed = true; break; }
                }
              }
              waveLatencies.push(Date.now() - waveStartedAt);
            }

            return { isSequence: true, sequenceResults, sequenceFailed, lastActionResult: lastActionResult || { success: !sequenceFailed, output: 'Plan completed' }, telemetry: { kind: 'dag', waves: waveLatencies.length, criticalPathMs: waveLatencies.reduce((sum, v) => sum + v, 0), maxWaveMs: waveLatencies.length > 0 ? Math.max(...waveLatencies) : 0 } };
          }

          // Parallel branches
          if (Array.isArray(decisionPayload.parallel) && decisionPayload.parallel.length > 0) {
            const branches = decisionPayload.parallel.slice(0, 4);
            runTelemetry.parallelBranches += branches.length;
            const branchHasUnsafe = branches.some((branch) => {
              const list = Array.isArray(branch.sequence) ? branch.sequence : [branch];
              return list.some((step) => !isParallelSafeAction(step.action));
            });
            if (branchHasUnsafe) {
              return { isSequence: true, sequenceResults: [], sequenceFailed: true, lastActionResult: { success: false, error: 'Parallel plan contained non-safe side-effect actions' } };
            }

            const branchResults = await Promise.all(
              branches.map(async (branch, bi) => {
                const branchStartedAt = Date.now();
                const list = Array.isArray(branch.sequence) ? branch.sequence.slice(0, 8) : [{ action: branch.action, params: branch.params || {} }];
                const local = [];
                let failed = false;
                let last = null;
                for (let si = 0; si < list.length; si++) {
                  const step = list[si];
                  const exec = await executeActionWithGuard(step.action, step.params || {}, `[P${bi + 1}.${si + 1}] `, decisionPayload.goalProgress || 0);
                  last = exec.actionResult;
                  local.push({ action: step.action, params: step.params || {}, result: exec.actionResult });
                  if (!exec.actionResult.success) { failed = true; break; }
                }
                return { failed, last, local, latencyMs: Date.now() - branchStartedAt };
              }),
            );

            const flat = [];
            let sequenceFailed = false;
            let lastActionResult = null;
            for (const br of branchResults) {
              flat.push(...br.local);
              lastActionResult = br.last || lastActionResult;
              if (br.failed) sequenceFailed = true;
            }
            return { isSequence: true, sequenceResults: flat, sequenceFailed, lastActionResult, telemetry: { kind: 'parallel', branches: branches.length, maxBranchMs: Math.max(...branchResults.map((b) => b.latencyMs)), totalBranchMs: branchResults.reduce((sum, b) => sum + b.latencyMs, 0) } };
          }

          // Fallback: single/sequence
          const isSequence = Array.isArray(decisionPayload.sequence) && decisionPayload.sequence.length > 0;
          const actionList = isSequence
            ? decisionPayload.sequence.slice(0, 8)
            : [{ action: decisionPayload.action, params: decisionPayload.params || {} }];
          let lastActionResult = null;
          let sequenceResults = [];
          let sequenceFailed = false;

          for (let si = 0; si < actionList.length; si++) {
            const { action, params } = actionList[si];
            const stepParams = params || {};
            const exec = await executeActionWithGuard(action, stepParams, isSequence ? `[${si + 1}/${actionList.length}] ` : '', decisionPayload.goalProgress || 0);
            lastActionResult = exec.actionResult;
            sequenceResults.push({ action, params: stepParams, result: exec.actionResult });
            if (!exec.actionResult.success) { sequenceFailed = true; break; }
            if (isSequence && si < actionList.length - 1) await new Promise(r => setTimeout(r, 80));
          }

          if (isSequence && decisionPayload.verifyAfter && !sequenceFailed) {
            const verifyResult = await analyzeScreen('Describe the current screen state. What changed? Did the previous actions succeed?');
            if (verifyResult.success) {
              const verifyStep = { type: 'observe', content: `[Auto-verify] ${verifyResult.analysis.slice(0, 500)}`, timestamp: Date.now(), goalProgress: decisionPayload.goalProgress || 0 };
              steps.push(verifyStep);
              sendStep(verifyStep);
              workingMemory.push(`Screen verify: ${verifyResult.analysis.slice(0, 150)}`);
            }
          }

          return { isSequence, sequenceResults, sequenceFailed, lastActionResult, telemetry: null };
        }

        const execution = await executeDecisionActions(decision, { depth: 0 });
        const isSequence = execution.isSequence;
        const sequenceResults = execution.sequenceResults || [];
        const sequenceFailed = !!execution.sequenceFailed;
        const lastActionResult = execution.lastActionResult;
        const iterationMs = Date.now() - iterationStartedAt;
        emitTelemetryStep(`iteration ${iteration}`, {
          iteration, iterationMs,
          executionMode: execution?.telemetry?.kind || (isSequence ? 'sequence' : 'single'),
          actionsExecuted: sequenceResults.length,
          failed: sequenceFailed,
          avgActionMs: avgActionMs(runTelemetry),
          parallelBranches: runTelemetry.parallelBranches,
          dagPlans: runTelemetry.dagPlans,
          dagNodesExecuted: runTelemetry.dagNodesExecuted,
          dagParallelWaves: runTelemetry.dagParallelWaves,
          subloopsSpawned: runTelemetry.subloopsSpawned,
          maxSubloopDepth: runTelemetry.maxSubloopDepth,
          verifyPasses: runTelemetry.verifyPasses,
          verifyFails: runTelemetry.verifyFails,
          recoveryAttempts: runTelemetry.recoveryAttempts,
          recoverySuccesses: runTelemetry.recoverySuccesses,
          modeStats: execution?.telemetry || undefined,
        }, decision.goalProgress || 0);

        // Phase: REFLECT
        if (sequenceResults.length > 0) noActionStopCount = 0;

        const reflectAction = isSequence
          ? `Sequence of ${sequenceResults.length} actions: ${sequenceResults.map(r => r.action).join(' → ')}`
          : (sequenceResults[0]?.action || decision.action || 'unknown');
        const reflectOutput = isSequence
          ? sequenceResults.map(r => `${r.action}: ${r.result.success ? 'OK' : 'FAIL'}`).join(', ')
          : (lastActionResult?.success
            ? (lastActionResult.stdout || lastActionResult.content || lastActionResult.output || JSON.stringify(lastActionResult).slice(0, 300))
            : (lastActionResult?.error || 'Unknown error'));
        const reflectSuccess = isSequence ? !sequenceFailed : lastActionResult?.success;

        const reflectSummary = `${reflectAction} → ${reflectSuccess ? 'SUCCESS' : 'FAILURE'}: ${(typeof reflectOutput === 'string' ? reflectOutput : JSON.stringify(reflectOutput)).slice(0, 200)}`;

        if (ctx.settings.skipReflection && reflectSuccess) {
          workingMemory.push(`Result: ${reflectSummary.slice(0, 100)}`);
        } else {
          const reflectStep = { type: 'reflect', content: reflectSummary.slice(0, 300), timestamp: Date.now(), goalProgress: decision.goalProgress || 0 };
          steps.push(reflectStep);
          sendStep(reflectStep);
          workingMemory.push(`Result: ${reflectSummary.slice(0, 100)}`);
        }

        // Deferred shouldStop
        if (decision.shouldStop && hasDecisionActions) {
          const doneActions = steps.filter((s) => s.type === 'act' && s.actionResult?.success && !READ_ONLY_ACTIONS.has(s.actionType)).map((s) => s.actionType);
          const success = reflectSuccess && (decision.goalProgress || 0) >= 0.5 && doneActions.length > 0;
          const summary = decision.thought || (success ? 'Goal achieved.' : 'Goal could not be completed.');
          const actionLog = doneActions.length > 0 ? ` Actions executed: ${doneActions.join(', ')}.` : '';

          await ctx.storeVectorMemory({
            content: `Task "${goalText.slice(0, 100)}" — ${success ? 'SUCCESS' : 'INCOMPLETE'}.${actionLog} ${summary.slice(0, 180)}`,
            type: 'procedural', source: 'cognitive-loop', importance: success ? 0.6 : 0.8, tags: ['task', success ? 'success' : 'incomplete'],
          });

          emitTelemetryStep('run summary', {
            elapsedMs: Date.now() - runTelemetry.startedAt,
            actionCalls: runTelemetry.actionCalls, avgActionMs: avgActionMs(runTelemetry),
            parallelBranches: runTelemetry.parallelBranches, dagPlans: runTelemetry.dagPlans,
            dagNodesExecuted: runTelemetry.dagNodesExecuted, subloopsSpawned: runTelemetry.subloopsSpawned,
            maxSubloopDepth: runTelemetry.maxSubloopDepth, verifyPasses: runTelemetry.verifyPasses,
            verifyFails: runTelemetry.verifyFails, recoveryAttempts: runTelemetry.recoveryAttempts,
            recoverySuccesses: runTelemetry.recoverySuccesses, outcome: success ? 'success' : 'stopped',
          }, decision.goalProgress || 0);

          completeCognitive(success, summary, iteration);
          return;
        }

        if (reflectSuccess && (decision.goalProgress || 0) >= 0.7) {
          const doneActions = steps.filter((s) => s.type === 'act' && s.actionResult?.success && !READ_ONLY_ACTIONS.has(s.actionType)).map((s) => s.actionType);
          if (doneActions.length > 0) {
            workingMemory.push(`TASK COMPLETE: ${doneActions.length} actions executed successfully (${doneActions.join(', ')}). Set shouldStop: true and goalProgress: 1.0 on your next response.`);
          }
        }

        await new Promise(r => setTimeout(r, 100));
      }

      // Max iterations reached
      await ctx.storeVectorMemory({
        content: `Task "${goalText.slice(0, 100)}" — INCOMPLETE after ${MAX_ITERATIONS} iterations.`,
        type: 'procedural', source: 'cognitive-loop', importance: 0.7, tags: ['task', 'incomplete'],
      });

      emitTelemetryStep('run summary', {
        elapsedMs: Date.now() - runTelemetry.startedAt,
        actionCalls: runTelemetry.actionCalls, avgActionMs: avgActionMs(runTelemetry),
        parallelBranches: runTelemetry.parallelBranches, dagPlans: runTelemetry.dagPlans,
        dagNodesExecuted: runTelemetry.dagNodesExecuted, subloopsSpawned: runTelemetry.subloopsSpawned,
        maxSubloopDepth: runTelemetry.maxSubloopDepth, verifyPasses: runTelemetry.verifyPasses,
        verifyFails: runTelemetry.verifyFails, recoveryAttempts: runTelemetry.recoveryAttempts,
        recoverySuccesses: runTelemetry.recoverySuccesses, outcome: 'max-iterations',
      }, 0);

      completeCognitive(false, `Reached maximum iterations (${MAX_ITERATIONS}) without completing the goal.`, MAX_ITERATIONS);
    } catch (error) {
      completeCognitive(false, `Cognitive loop error: ${error.message}`, 0);
    }
  });

  // ─── Kill Switch ─────────────────────────────────────────
  ipcMain.on('agent:killCognitive', () => {
    cognitiveKillFlag = true;
  });
}

module.exports = { register };
