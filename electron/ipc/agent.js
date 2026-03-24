// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — IPC: Agent (Hands Actions, Web Tools, Vision,
//  Input Simulation, Tool Registry, Runtime Controls, Operator Loop)
// ═══════════════════════════════════════════════════════════════
const { ipcMain, shell, clipboard, desktopCapturer, screen, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');
const ctx = require('../ctx');

// ─── Safety / Command Helpers ──────────────────────────────────

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

function isBlockedCommand(cmd) {
  const safe = typeof cmd === 'string'
    ? cmd
    : (cmd && typeof cmd === 'object' && typeof cmd.command === 'string' ? cmd.command : '');
  const lower = safe.toLowerCase();
  return BLOCKED_COMMANDS.some((blocked) => lower.includes(blocked));
}

const KNOWN_PYTHON_PATHS = [
  'A:\\Python\\python.exe',
  'C:\\Users\\AGrac\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
];

function resolvePythonPath() {
  for (const p of KNOWN_PYTHON_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return 'python';
}

function buildAgentCommand(command) {
  let safeCommand = typeof command === 'string' ? command : String(command || '');
  const pythonExe = resolvePythonPath();

  if (process.platform === 'win32') {
    safeCommand = safeCommand
      .replace(/(?:"[^"]*python(?:3(?:\.\d+)?)?(?:\.exe)?"|\S*python(?:3(?:\.\d+)?)?\.exe)\b/gi, `& "${pythonExe}"`)
      .replace(/(^|\s)python3?(?=\s)/gi, `$1& "${pythonExe}"`);
    safeCommand = safeCommand.replace(/&\s*&\s*"/g, '& "');

    const encoded = Buffer.from(safeCommand, 'utf16le').toString('base64');
    return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
  }
  return safeCommand;
}

// ─── Input Simulation Daemon ───────────────────────────────────

const inputDaemonPath = path.join(__dirname, '..', 'input-daemon.ps1');
let inputDaemon = null;
let inputDaemonReady = false;
let inputDaemonQueue = [];
let inputDaemonBuffer = '';

function spawnInputDaemon() {
  if (inputDaemon && !inputDaemon.killed) return;
  inputDaemonReady = false;
  inputDaemonBuffer = '';
  const proc = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', inputDaemonPath,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  proc.stdout.on('data', (chunk) => {
    inputDaemonBuffer += chunk.toString();
    let newlineIdx;
    while ((newlineIdx = inputDaemonBuffer.indexOf('\n')) !== -1) {
      const line = inputDaemonBuffer.slice(0, newlineIdx).trim();
      inputDaemonBuffer = inputDaemonBuffer.slice(newlineIdx + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.ready) {
          inputDaemonReady = true;
          console.log('[InputDaemon] Ready — persistent process online');
          continue;
        }
        const pending = inputDaemonQueue.shift();
        if (pending) pending.resolve(parsed);
      } catch {
        const pending = inputDaemonQueue.shift();
        if (pending) pending.resolve({ success: true, output: line });
      }
    }
  });

  proc.stderr.on('data', (data) => {
    console.error('[InputDaemon] stderr:', data.toString().trim());
  });

  proc.on('close', (code) => {
    console.log(`[InputDaemon] Exited (code ${code}), restarting...`);
    inputDaemon = null;
    inputDaemonReady = false;
    while (inputDaemonQueue.length > 0) {
      const pending = inputDaemonQueue.shift();
      pending.resolve({ success: false, error: 'Input daemon crashed' });
    }
    setTimeout(spawnInputDaemon, 500);
  });

  proc.on('error', (err) => {
    console.error('[InputDaemon] Spawn error:', err.message);
  });

  inputDaemon = proc;
}

function runInputAction(actionData) {
  return new Promise((resolve) => {
    if (!inputDaemon || inputDaemon.killed || !inputDaemonReady) {
      spawnInputDaemon();
      const fallbackChild = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ctx.inputHelperPath,
      ], { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      fallbackChild.stdout.on('data', (d) => { stdout += d.toString(); });
      fallbackChild.stderr.on('data', (d) => { stderr += d.toString(); });
      fallbackChild.on('close', (code) => {
        try { resolve(JSON.parse(stdout.trim())); }
        catch { resolve(code === 0 && stdout.trim() ? { success: true, output: stdout.trim() } : { success: false, error: stderr || stdout || `Exit code: ${code}` }); }
      });
      fallbackChild.on('error', (err) => resolve({ success: false, error: err.message }));
      fallbackChild.stdin.write(JSON.stringify(actionData));
      fallbackChild.stdin.end();
      return;
    }
    inputDaemonQueue.push({ resolve });
    inputDaemon.stdin.write(JSON.stringify(actionData) + '\n');
  });
}

// ─── Desktop Capture & Vision ──────────────────────────────────

async function captureDesktopScreenshot(options = {}) {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: options.width || 1920, height: options.height || 1080 },
    });
    if (!sources || sources.length === 0) {
      return { success: false, error: 'No screen sources available' };
    }
    const source = sources[0];
    const pngBuffer = source.thumbnail.toPNG();
    const base64 = pngBuffer.toString('base64');
    let savedPath = null;
    if (options.saveToDisk) {
      savedPath = path.join(ctx.dataDir, `desktop_${Date.now()}.png`);
      fs.writeFileSync(savedPath, pngBuffer);
    }
    return {
      success: true, base64, size: pngBuffer.length,
      width: source.thumbnail.getSize().width, height: source.thumbnail.getSize().height,
      savedPath, displayId: source.display_id, name: source.name,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function analyzeScreen(prompt, options = {}) {
  const screenshot = await captureDesktopScreenshot(options);
  if (!screenshot.success) return { success: false, error: `Screenshot failed: ${screenshot.error}` };
  try {
    const analysisPrompt = prompt ||
      'Describe what you see on this screen in detail. Identify all visible windows, applications, UI elements (buttons, text fields, menus), and any text content. Note the approximate pixel coordinates of key interactive elements using the format (x, y) from the top-left corner.';
    const visionSystemPrompt = `You are the VISION system of AGI PRIME. You analyze screenshots to understand what is on screen. The screen resolution is ${screenshot.width}x${screenshot.height}. When describing element positions, give approximate pixel coordinates as (x, y) from the top-left (0,0). Be precise about UI element locations so the agent can click on them.`;

    const visionConfig = {
      temperature: 0.2, maxTokens: 2048,
      systemPrompt: visionSystemPrompt,
    };
    if (ctx.settings.visionModel) {
      visionConfig.provider = ctx.settings.visionProvider || ctx.settings.provider;
      visionConfig.model = ctx.settings.visionModel;
      console.log(`[Vision] Using vision model: ${visionConfig.provider}/${visionConfig.model}`);
    } else {
      console.log(`[Vision] No dedicated vision model configured — using main model (${ctx.settings.provider}/${ctx.settings.model}). If vision fails, set OLLAMA_VISION_MODEL in .env`);
    }

    const analysis = await ctx.llmGenerateMultimodal(analysisPrompt, screenshot.base64, visionConfig);
    return { success: true, analysis, screenshot: { width: screenshot.width, height: screenshot.height, size: screenshot.size } };
  } catch (e) {
    const hint = !ctx.settings.visionProvider
      ? ' Hint: Your main model may not support vision. Set visionProvider/visionModel in settings to use a vision-capable model (e.g. openai/gpt-4o, anthropic/claude-sonnet-4-20250514, or ollama/llava).'
      : '';
    return { success: false, error: `Vision analysis failed: ${e.message}.${hint}` };
  }
}

// ─── Tool Registry ─────────────────────────────────────────────

function registerCustomTool(tool) {
  const existing = ctx.toolRegistry.tools.findIndex(t => t.id === tool.id);
  if (existing >= 0) {
    ctx.toolRegistry.tools[existing] = { ...ctx.toolRegistry.tools[existing], ...tool, updatedAt: Date.now() };
  } else {
    ctx.toolRegistry.tools.push({ ...tool, createdAt: Date.now(), updatedAt: Date.now(), usageCount: 0 });
  }
  ctx.saveJSON(ctx.toolRegistryFile, ctx.toolRegistry);
  return { success: true, toolId: tool.id };
}

async function executeCustomTool(toolId, params) {
  const tool = ctx.toolRegistry.tools.find(t => t.id === toolId);
  if (!tool) return { success: false, error: `Custom tool not found: ${toolId}` };
  try {
    const ext = tool.language === 'python' ? '.py' : (process.platform === 'win32' ? '.ps1' : '.sh');
    const scriptPath = path.join(ctx.dataDir, `tool_${toolId}${ext}`);
    fs.writeFileSync(scriptPath, tool.script, 'utf-8');
    if (process.platform !== 'win32' && ext === '.sh') {
      fs.chmodSync(scriptPath, 0o755);
    }
    const cmd = tool.language === 'python'
      ? `"${resolvePythonPath()}" "${scriptPath}" ${(params?.args || []).map(a => `"${a}"`).join(' ')}`
      : process.platform === 'win32'
        ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${(params?.args || []).map(a => `"${a}"`).join(' ')}`
        : `bash "${scriptPath}" ${(params?.args || []).map(a => `"${a}"`).join(' ')}`;
    return new Promise((resolve) => {
      exec(cmd, { timeout: 30000, cwd: os.homedir(), shell: true }, (error, stdout, stderr) => {
        tool.usageCount = (tool.usageCount || 0) + 1;
        tool.lastUsed = Date.now();
        ctx.saveJSON(ctx.toolRegistryFile, ctx.toolRegistry);
        if (error) resolve({ success: false, error: error.message, stderr: stderr?.toString() });
        else resolve({ success: true, stdout: stdout?.toString(), stderr: stderr?.toString() });
      });
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Register IPC Handlers ─────────────────────────────────────

function register() {
  spawnInputDaemon();

  // ─── Execute Shell Command ───────────────────────────────
  ipcMain.handle('agent:execute', async (_, command, requireConfirm) => {
    if (isBlockedCommand(command)) {
      return { success: false, error: 'BLOCKED: This command is classified as destructive and has been prevented by the Guardian system.' };
    }

    return new Promise((resolve) => {
      const finalCommand = buildAgentCommand(command);
      const isLongRunning = /arc_play|--steps\s+\d{2,}|--search-trials/i.test(command);
      exec(finalCommand, {
        timeout: isLongRunning ? 1800000 : 120000,
        maxBuffer: 1024 * 1024 * 10,
        cwd: os.homedir(),
        shell: true,
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message,
            stderr: stderr?.toString() || '',
            code: error.code,
          });
        } else {
          resolve({
            success: true,
            stdout: stdout?.toString() || '',
            stderr: stderr?.toString() || '',
          });
        }
      });
    });
  });

  // ─── File System Operations ──────────────────────────────
  ipcMain.handle('agent:readFile', async (_, filePath) => {
    try {
      const resolved = path.resolve(filePath);
      const stat = fs.statSync(resolved);
      if (stat.size > 5 * 1024 * 1024) {
        return { success: false, error: 'File too large (>5MB)' };
      }
      const content = fs.readFileSync(resolved, 'utf-8');
      return { success: true, content, size: stat.size, path: resolved };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:writeFile', async (_, filePath, content) => {
    try {
      const resolved = path.resolve(filePath);
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(resolved, content, 'utf-8');
      return { success: true, path: resolved, size: Buffer.byteLength(content) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:listDir', async (_, dirPath) => {
    try {
      const resolved = path.resolve(dirPath || os.homedir());
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const items = entries.slice(0, 200).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        path: path.join(resolved, entry.name),
      }));
      return { success: true, items, path: resolved, total: entries.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:createDir', async (_, dirPath) => {
    try {
      const resolved = path.resolve(dirPath);
      fs.mkdirSync(resolved, { recursive: true });
      return { success: true, path: resolved };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:deleteFile', async (_, filePath) => {
    try {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'File not found' };
      }
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        fs.rmSync(resolved, { recursive: true });
      } else {
        fs.unlinkSync(resolved);
      }
      return { success: true, path: resolved };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:renameFile', async (_, oldPath, newPath) => {
    try {
      const resolvedOld = path.resolve(oldPath);
      const resolvedNew = path.resolve(newPath);
      fs.renameSync(resolvedOld, resolvedNew);
      return { success: true, from: resolvedOld, to: resolvedNew };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:searchFiles', async (_, directory, pattern) => {
    try {
      const resolved = path.resolve(directory || os.homedir());
      const results = [];
      let regex;
      try {
        regex = new RegExp(pattern, 'i');
      } catch {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escaped, 'i');
      }

      function walk(dir, depth = 0) {
        if (depth > 4 || results.length > 100) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            if (regex.test(entry.name)) {
              results.push({
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
              });
            }
            if (entry.isDirectory() && depth < 4) {
              walk(fullPath, depth + 1);
            }
          }
        } catch (e) { /* skip inaccessible dirs */ }
      }

      walk(resolved);
      return { success: true, results: results.slice(0, 100), searchPath: resolved };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ─── System Operations ───────────────────────────────────
  ipcMain.handle('agent:openUrl', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true, url };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:openApp', async (_, appPath) => {
    try {
      await shell.openPath(appPath);
      return { success: true, path: appPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:openFile', async (_, filePath) => {
    try {
      const resolved = path.resolve(filePath);
      await shell.openPath(resolved);
      return { success: true, path: resolved };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:clipboard', async (_, action, text) => {
    try {
      if (action === 'read') {
        return { success: true, text: clipboard.readText() };
      } else if (action === 'write') {
        clipboard.writeText(text);
        return { success: true };
      }
      return { success: false, error: 'Unknown clipboard action' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:systemDetails', async () => {
    return {
      success: true,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      homeDir: os.homedir(),
      tempDir: os.tmpdir(),
      username: os.userInfo().username,
    };
  });

  ipcMain.handle('agent:listProcesses', async () => {
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32'
        ? 'tasklist /FO CSV /NH'
        : 'ps aux --sort=-%mem | head -30';
      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true, output: stdout?.toString() || '' });
        }
      });
    });
  });

  // ─── Web Tools ───────────────────────────────────────────
  ipcMain.handle('agent:webFetch', async (_, url, options = {}) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);

      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}`, url };
      }

      const contentType = response.headers.get('content-type') || '';
      let content;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
      } else {
        const html = await response.text();
        content = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
      }

      const maxLen = options.maxLength || 8000;
      const truncated = content.length > maxLen;
      content = content.slice(0, maxLen);

      return {
        success: true,
        url,
        contentType,
        content,
        truncated,
        length: content.length,
        statusCode: response.status,
      };
    } catch (e) {
      return { success: false, error: e.message, url };
    }
  });

  ipcMain.handle('agent:webSearch', async (_, query, options = {}) => {
    try {
      const maxResults = options.maxResults || 8;
      const encodedQuery = encodeURIComponent(query);

      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `q=${encodedQuery}`,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { success: false, error: `Search failed: HTTP ${response.status}`, query };
      }

      const html = await response.text();

      const results = [];
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

      let match;
      const urls = [];
      const titles = [];
      const snippets = [];

      while ((match = resultRegex.exec(html)) !== null && urls.length < maxResults) {
        let url = match[1];
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
        urls.push(url);
        titles.push(match[2].replace(/<[^>]+>/g, '').trim());
      }

      while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
        snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
      }

      for (let i = 0; i < urls.length; i++) {
        results.push({
          title: titles[i] || '',
          url: urls[i],
          snippet: snippets[i] || '',
          position: i + 1,
        });
      }

      return {
        success: true,
        query,
        results,
        totalResults: results.length,
      };
    } catch (e) {
      return { success: false, error: e.message, query };
    }
  });

  // ─── ElevenLabs TTS ──────────────────────────────────────
  ipcMain.handle('agent:elevenlabsTts', async (_, text, options = {}) => {
    try {
      const apiKey = (ctx.settings.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '').trim();
      if (!apiKey) {
        return { success: false, error: 'ELEVENLABS_API_KEY missing. Add it in Settings or .env.' };
      }
      const voiceId = String(options.voiceId || ctx.settings.elevenLabsVoiceId || 'JBFqnCBsd6RMkjVDRZzb');
      const modelId = String(options.modelId || ctx.settings.elevenLabsModelId || 'eleven_multilingual_v2');
      const promptText = String(text || '').trim();
      if (!promptText) return { success: false, error: 'Text is required for ElevenLabs TTS.' };

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: promptText,
          model_id: modelId,
          voice_settings: options.voiceSettings || {
            stability: 0.45,
            similarity_boost: 0.75,
          },
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return {
          success: false,
          status: response.status,
          details: errText.slice(0, 300),
          error: `ElevenLabs TTS failed: HTTP ${response.status}${errText ? ` — ${errText.slice(0, 300)}` : ''}`,
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const audioBase64 = buffer.toString('base64');
      let savedPath = null;
      if (options.saveToDisk) {
        savedPath = path.join(ctx.dataDir, `eleven_tts_${Date.now()}.mp3`);
        fs.writeFileSync(savedPath, buffer);
      }

      return {
        success: true,
        voiceId,
        modelId,
        mimeType: 'audio/mpeg',
        audioBase64,
        bytes: buffer.length,
        savedPath,
      };
    } catch (e) {
      return { success: false, error: e.message, status: 0, details: 'request_exception' };
    }
  });

  // ─── ElevenLabs Music Generation ─────────────────────────
  ipcMain.handle('agent:elevenlabsGenerateMusic', async (_, prompt, options = {}) => {
    try {
      const apiKey = (ctx.settings.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '').trim();
      if (!apiKey) {
        return { success: false, error: 'ELEVENLABS_API_KEY missing. Add it in Settings or .env.' };
      }
      const textPrompt = String(prompt || '').trim();
      if (!textPrompt) return { success: false, error: 'Prompt is required for music generation.' };
      const modelId = String(options.modelId || ctx.settings.elevenLabsMusicModelId || 'music_v1');
      const durationMs = Math.max(3000, Math.min(600000, Math.floor(Number(options.durationSeconds || 20) * 1000)));

      const response = await fetch('https://api.elevenlabs.io/v1/music', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          prompt: textPrompt,
          model_id: modelId,
          music_length_ms: durationMs,
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return {
          success: false,
          status: response.status,
          details: errText.slice(0, 300),
          error: `ElevenLabs music failed: HTTP ${response.status}${errText ? ` — ${errText.slice(0, 300)}` : ''}`,
        };
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        return { success: true, modelId, contentType, payload: json };
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const audioBase64 = buffer.toString('base64');
      let savedPath = null;
      if (options.saveToDisk !== false) {
        savedPath = path.join(ctx.dataDir, `eleven_music_${Date.now()}.mp3`);
        fs.writeFileSync(savedPath, buffer);
      }
      return {
        success: true,
        modelId,
        mimeType: 'audio/mpeg',
        audioBase64,
        bytes: buffer.length,
        savedPath,
      };
    } catch (e) {
      return { success: false, error: e.message, status: 0, details: 'request_exception' };
    }
  });

  // ─── ElevenLabs Sing ─────────────────────────────────────
  ipcMain.handle('agent:elevenlabsSing', async (_, options = {}) => {
    try {
      const apiKey = (ctx.settings.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '').trim();
      if (!apiKey) {
        return { success: false, error: 'ELEVENLABS_API_KEY missing. Add it in Settings or .env.' };
      }

      const prompt = String(options.prompt || '').trim();
      const lyrics = options.lyrics || null;
      const durationMs = Math.max(3000, Math.min(600000, Number(options.durationMs || 30000)));
      const instrumental = !!options.instrumental;

      if (!prompt && !lyrics) {
        return { success: false, error: 'Either prompt or lyrics required for singing.' };
      }

      let compositionPlan = options.compositionPlan || null;

      if (!compositionPlan) {
        console.log('[ElevenLabs Sing] Creating composition plan...');
        const planBody = {
          prompt: prompt || 'A heartfelt song',
          music_length_ms: durationMs,
          model_id: 'music_v1',
        };

        const planResponse = await fetch('https://api.elevenlabs.io/v1/music/plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify(planBody),
          signal: AbortSignal.timeout(30000),
        });

        if (!planResponse.ok) {
          const errText = await planResponse.text().catch(() => '');
          console.error(`[ElevenLabs Sing] Plan failed ${planResponse.status}:`, errText.slice(0, 300));
          return {
            success: false,
            status: planResponse.status,
            details: errText.slice(0, 300),
            error: `Composition plan failed: HTTP ${planResponse.status}${errText ? ` — ${errText.slice(0, 300)}` : ''}`,
          };
        }

        compositionPlan = await planResponse.json();
        console.log(`[ElevenLabs Sing] Plan created: ${(compositionPlan.sections || []).length} sections`);

        if (lyrics && compositionPlan.sections) {
          const lyricSections = String(lyrics).split(/\n\s*\n/).filter(Boolean);
          for (let i = 0; i < compositionPlan.sections.length && i < lyricSections.length; i++) {
            compositionPlan.sections[i].lines = lyricSections[i]
              .split('\n')
              .map(l => l.trim())
              .filter(Boolean)
              .map(l => l.length > 200 ? l.slice(0, 200) : l);
          }
        }
      }

      console.log('[ElevenLabs Sing] Composing audio...');
      const composeBody = { composition_plan: compositionPlan };
      if (instrumental) composeBody.force_instrumental = true;

      const composeResponse = await fetch('https://api.elevenlabs.io/v1/music/detailed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify(composeBody),
        signal: AbortSignal.timeout(180000),
      });

      if (!composeResponse.ok) {
        const errText = await composeResponse.text().catch(() => '');
        return {
          success: false,
          status: composeResponse.status,
          details: errText.slice(0, 300),
          error: `Compose failed: HTTP ${composeResponse.status}${errText ? ` — ${errText.slice(0, 300)}` : ''}`,
        };
      }

      const contentType = composeResponse.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await composeResponse.json();
        return { success: true, contentType, payload: json };
      }

      const arrayBuffer = await composeResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const audioBase64 = buffer.toString('base64');

      const savedPath = path.join(ctx.dataDir, `eleven_sing_${Date.now()}.mp3`);
      fs.writeFileSync(savedPath, buffer);

      console.log(`[ElevenLabs Sing] Done: ${buffer.length} bytes, saved to ${savedPath}`);

      return {
        success: true,
        mimeType: 'audio/mpeg',
        audioBase64,
        bytes: buffer.length,
        savedPath,
        compositionPlan,
      };
    } catch (e) {
      return { success: false, error: e.message, status: 0, details: 'request_exception' };
    }
  });

  // ─── Web Screenshot ──────────────────────────────────────
  ipcMain.handle('agent:webScreenshot', async (_, url) => {
    try {
      const captureWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      await captureWindow.loadURL(url);
      await new Promise(r => setTimeout(r, 3000));

      const image = await captureWindow.webContents.capturePage();
      const screenshotPath = path.join(ctx.dataDir, `screenshot_${Date.now()}.png`);
      fs.writeFileSync(screenshotPath, image.toPNG());

      const title = captureWindow.webContents.getTitle();
      const pageUrl = captureWindow.webContents.getURL();

      captureWindow.destroy();

      return {
        success: true,
        url: pageUrl,
        title,
        screenshotPath,
        message: `Screenshot saved to ${screenshotPath}`,
      };
    } catch (e) {
      return { success: false, error: e.message, url };
    }
  });

  // ─── Desktop Capture & Vision ────────────────────────────
  ipcMain.handle('agent:screenshotDesktop', async (_, options) => {
    return await captureDesktopScreenshot(options || {});
  });

  ipcMain.handle('agent:analyzeScreen', async (_, prompt, options) => {
    return await analyzeScreen(prompt, options || {});
  });

  ipcMain.handle('agent:getScreenDimensions', async () => {
    const display = screen.getPrimaryDisplay();
    return { success: true, width: display.size.width, height: display.size.height, scaleFactor: display.scaleFactor, bounds: display.bounds };
  });

  // ─── Input Simulation ────────────────────────────────────
  ipcMain.handle('agent:mouseMove', async (_, x, y, smooth) => {
    return await runInputAction({ action: 'mouse_move', x, y, smooth: smooth !== false });
  });
  ipcMain.handle('agent:mouseClick', async (_, x, y, button, doubleClick) => {
    return await runInputAction({ action: 'mouse_click', x, y, button: button || 'left', doubleClick: !!doubleClick });
  });
  ipcMain.handle('agent:mouseScroll', async (_, x, y, amount) => {
    return await runInputAction({ action: 'mouse_scroll', x, y, amount: amount || -120 });
  });
  ipcMain.handle('agent:mouseDrag', async (_, fromX, fromY, toX, toY) => {
    return await runInputAction({ action: 'mouse_drag', fromX, fromY, toX, toY });
  });
  ipcMain.handle('agent:keyboardType', async (_, text) => {
    return await runInputAction({ action: 'keyboard_type', text });
  });
  ipcMain.handle('agent:keyboardPress', async (_, key) => {
    return await runInputAction({ action: 'keyboard_press', key });
  });
  ipcMain.handle('agent:keyboardShortcut', async (_, modifiers, key) => {
    return await runInputAction({ action: 'keyboard_shortcut', modifiers: Array.isArray(modifiers) ? modifiers : [modifiers], key });
  });
  ipcMain.handle('agent:getMousePosition', async () => {
    return await runInputAction({ action: 'get_mouse_position' });
  });
  ipcMain.handle('agent:getForegroundWindow', async () => {
    return await runInputAction({ action: 'get_foreground_window' });
  });
  ipcMain.handle('agent:minimizeSelf', async () => {
    ctx.mainWindow?.minimize();
    return { success: true, output: 'AGI PRIME window minimized' };
  });

  // ─── Tool Registry ───────────────────────────────────────
  ipcMain.handle('agent:createTool', async (_, tool) => {
    return registerCustomTool(tool);
  });
  ipcMain.handle('agent:listTools', async () => {
    return { success: true, tools: ctx.toolRegistry.tools.map(t => ({ id: t.id, name: t.name, description: t.description, language: t.language, usageCount: t.usageCount })) };
  });
  ipcMain.handle('agent:executeTool', async (_, toolId, params) => {
    return await executeCustomTool(toolId, params);
  });

  // ─── Consent Resolution ──────────────────────────────────
  ipcMain.handle('agent:resolveConsent', async (_, requestId, decision) => {
    const entry = ctx.pendingConsentRequests.get(requestId);
    if (!entry) {
      return { success: false, requestId, error: 'Consent request not found or already resolved' };
    }

    ctx.pendingConsentRequests.delete(requestId);
    entry.resolve({
      decision: decision || 'denied',
      resolvedAt: Date.now(),
    });
    return { success: true, requestId, decision: decision || 'denied' };
  });

  // ─── Runtime Controls ────────────────────────────────────
  ipcMain.handle('agent:setRuntimeControls', async (_, partial) => {
    try {
      const patch = partial && typeof partial === 'object' ? partial : {};
      const previousEmergency = Boolean(ctx.runtimeControls.emergencyStopActive);
      Object.assign(ctx.runtimeControls, patch);

      if (ctx.runtimeControls.executionTierLimit === 'read-only') {
        ctx.runtimeControls.allowFileSystemWrites = false;
        ctx.runtimeControls.allowProcessExecution = false;
        ctx.runtimeControls.allowInputSimulation = false;
        ctx.runtimeControls.allowToolCreation = false;
        ctx.runtimeControls.allowLimitedExecOnly = true;
      } else if (ctx.runtimeControls.executionTierLimit === 'reversible') {
        ctx.runtimeControls.allowFileSystemWrites = true;
        ctx.runtimeControls.allowProcessExecution = false;
        ctx.runtimeControls.allowInputSimulation = false;
        ctx.runtimeControls.allowToolCreation = false;
        ctx.runtimeControls.allowLimitedExecOnly = true;
      } else if (ctx.runtimeControls.executionTierLimit === 'high-risk') {
        if (!('allowFileSystemWrites' in patch)) ctx.runtimeControls.allowFileSystemWrites = true;
        if (!('allowProcessExecution' in patch)) ctx.runtimeControls.allowProcessExecution = true;
        if (!('allowInputSimulation' in patch)) ctx.runtimeControls.allowInputSimulation = true;
        if (!('allowToolCreation' in patch)) ctx.runtimeControls.allowToolCreation = true;
        if (!('allowLimitedExecOnly' in patch)) ctx.runtimeControls.allowLimitedExecOnly = ctx.DAEMON_MODE;
      }

      ctx.emitOrchestratorEvent('policy_updated', { patch, controls: { ...ctx.runtimeControls } }, 'operator');
      if (!previousEmergency && ctx.runtimeControls.emergencyStopActive) {
        ctx.emitOrchestratorEvent('emergency_stop_enabled', { reason: 'runtime_controls_patch' }, 'operator');
        ctx.appendAuditEvent('emergency_stop', 'runtime_controls', 'Emergency stop enabled');
      } else if (previousEmergency && !ctx.runtimeControls.emergencyStopActive) {
        ctx.emitOrchestratorEvent('emergency_stop_cleared', { reason: 'runtime_controls_patch' }, 'operator');
        ctx.appendAuditEvent('emergency_clear', 'runtime_controls', 'Emergency stop cleared');
      }

      return { success: true, controls: { ...ctx.runtimeControls } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('agent:getRuntimeControls', async () => {
    return { success: true, controls: { ...ctx.runtimeControls } };
  });

  // ─── Operator Loop ───────────────────────────────────────
  ipcMain.handle('agent:operatorLoop:get', async () => {
    return {
      success: true,
      goalContract: ctx.loadJSON(ctx.operatorGoalFile, null),
      state: { ...ctx.operatorLoopState },
    };
  });

  ipcMain.handle('agent:operatorLoop:setGoal', async (_, contract) => {
    try {
      const next = contract && typeof contract === 'object' ? contract : {};
      ctx.saveJSON(ctx.operatorGoalFile, {
        ...next,
        updatedAt: Date.now(),
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = {
  register,
  isBlockedCommand,
  buildAgentCommand,
  resolvePythonPath,
  captureDesktopScreenshot,
  analyzeScreen,
  runInputAction,
  registerCustomTool,
  executeCustomTool,
};
