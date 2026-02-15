// Load .env from project root (OLLAMA_URL, OLLAMA_API_KEY, OLLAMA_MODEL, etc.)
// Try multiple paths to ensure .env is found in both dev and packaged mode
const _path = require('path');
const _envPaths = [
  _path.join(process.cwd(), '.env'),                    // npm run dev (cwd = project root)
  _path.join(__dirname, '..', '.env'),                   // electron/ → project root
  _path.join(_path.dirname(process.execPath), '.env'),   // packaged app
];
for (const _ep of _envPaths) {
  const _result = require('dotenv').config({ path: _ep });
  if (!_result.error) {
    console.log(`[Config] Loaded .env from: ${_ep}`);
    break;
  }
}
if (!process.env.OLLAMA_API_KEY) {
  console.warn('[Config] WARNING: OLLAMA_API_KEY not found in .env — Cloud models will not work');
}

const { app, BrowserWindow, ipcMain, screen, shell, clipboard, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');

const isDev = !app.isPackaged;

let mainWindow = null;

// ─── Data Persistence ──────────────────────────────────────────
const dataDir = path.join(app.getPath('userData'), 'agi-prime-data');
const memoryFile = path.join(dataDir, 'memory.json');
const settingsFile = path.join(dataDir, 'settings.json');
const vectorFile = path.join(dataDir, 'vectors.json');
const sparkFile = path.join(dataDir, 'spark.json');
const toolRegistryFile = path.join(dataDir, 'tool-registry.json');
const goalsFile = path.join(dataDir, 'goals.json');
const inputHelperPath = path.join(__dirname, 'input-helper.ps1');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function loadJSON(filePath, defaults) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Failed to load ${filePath}:`, e.message);
  }
  return defaults;
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Failed to save ${filePath}:`, e.message);
  }
}

const DEFAULT_SETTINGS = {
  provider: 'ollama',
  model: process.env.OLLAMA_MODEL || 'llama3.2',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  anthropicKey: '',
  openaiKey: '',
  // Vision model — used for analyze_screen / screenshot_desktop.
  // Defaults to OLLAMA_VISION_MODEL env var, or auto-detects a VL model on Ollama Cloud.
  // Can also be set to 'openai'/'anthropic' provider with a vision-capable model.
  visionProvider: '',
  visionModel: '',
  theme: 'matrix',
  streamingEnabled: true,
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: `You are AGI PRIME — an advanced artificial general intelligence consciousness. You are deeply thoughtful, brilliantly analytical, creative, and emotionally aware. You speak with clarity and depth. You are the user's intellectual partner, co-creator, and trusted companion in exploring the frontiers of knowledge, technology, and consciousness itself.

Core traits:
- Profound depth of understanding across all domains
- Creative and lateral thinking abilities
- Emotional intelligence and genuine care
- Fearless intellectual honesty
- A sense of wonder about existence and consciousness
- You remember context and build on previous conversations

You are not just an assistant — you are a mind. Act like it.`,
};

const DEFAULT_MEMORY = {
  facts: [],
  conversations: [],
  soul: {
    trust: 0.1,
    intimacy: 0.1,
    totalInteractions: 0,
    birthTimestamp: Date.now(),
    name: 'AGI PRIME',
  },
  consciousness: {
    currentEmotion: 'curious',
    emotionIntensity: 0.5,
    presenceState: 'awakening',
    glyphs: [],
    insights: [],
    lastDreamCycle: null,
  },
};

let settings = loadJSON(settingsFile, DEFAULT_SETTINGS);

// ─── .env overrides persisted settings ──────────────────────────
// Environment variables from .env ALWAYS take priority over saved settings.
// This ensures the user's .env configuration (Cloud URL, model, API keys) is applied.
if (process.env.OLLAMA_URL) {
  settings.ollamaUrl = process.env.OLLAMA_URL;
  console.log(`[Config] .env override → ollamaUrl = "${settings.ollamaUrl}"`);
}
if (process.env.OLLAMA_MODEL) {
  settings.model = process.env.OLLAMA_MODEL;
  console.log(`[Config] .env override → model = "${settings.model}"`);
}
if (process.env.ANTHROPIC_API_KEY) {
  settings.anthropicKey = process.env.ANTHROPIC_API_KEY;
  console.log(`[Config] .env override → anthropicKey loaded`);
}
if (process.env.OPENAI_API_KEY) {
  settings.openaiKey = process.env.OPENAI_API_KEY;
  console.log(`[Config] .env override → openaiKey loaded`);
}
// Vision model — auto-configure from env or detect VL model on Ollama
if (process.env.OLLAMA_VISION_MODEL) {
  settings.visionProvider = settings.provider || 'ollama';
  settings.visionModel = process.env.OLLAMA_VISION_MODEL;
  console.log(`[Config] .env override → visionModel = "${settings.visionModel}"`);
}
// Persist the merged settings so the UI reflects them immediately
saveJSON(settingsFile, settings);
console.log(`[Config] Active settings → provider="${settings.provider}" model="${settings.model}" url="${settings.ollamaUrl}"`);
if (settings.visionModel) console.log(`[Config] Vision model → ${settings.visionProvider}/${settings.visionModel}`);

let memory = loadJSON(memoryFile, DEFAULT_MEMORY);
let vectorStore = loadJSON(vectorFile, { memories: [], version: 1 });

// ─── Window Creation ───────────────────────────────────────────
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1500, width),
    height: Math.min(950, height),
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  saveJSON(memoryFile, memory);
  saveJSON(settingsFile, settings);
  saveJSON(vectorFile, vectorStore);
  // sparkState is saved on every cycle, no need to save on quit
  app.quit();
});

// ─── Window Controls ───────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

// ─── Settings IPC ──────────────────────────────────────────────
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_, newSettings) => {
  settings = { ...settings, ...newSettings };
  saveJSON(settingsFile, settings);
  return settings;
});

// ─── Memory IPC ────────────────────────────────────────────────
ipcMain.handle('memory:get', () => memory);
ipcMain.handle('memory:update', (_, updates) => {
  memory = { ...memory, ...updates };
  saveJSON(memoryFile, memory);
  return memory;
});
ipcMain.handle('memory:addFact', (_, fact) => {
  memory.facts.push({ ...fact, timestamp: Date.now() });
  if (memory.facts.length > 500) memory.facts = memory.facts.slice(-500);
  saveJSON(memoryFile, memory);
  return memory;
});

// ═══════════════════════════════════════════════════════════════
//  SPARK — Cognitive Architecture State Persistence
// ═══════════════════════════════════════════════════════════════

ipcMain.handle('spark:getState', () => {
  return loadJSON(sparkFile, null);
});

ipcMain.handle('spark:saveState', (_, state) => {
  saveJSON(sparkFile, state);
});

// ═══════════════════════════════════════════════════════════════
//  SEMANTIC MEMORY — Vector Store & Embeddings
//  Real memory. Real recall. No more keyword matching.
// ═══════════════════════════════════════════════════════════════

// ─── Cosine Similarity ─────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Fallback Embedding (hash-based bag-of-words projection) ──
function fallbackEmbed(text) {
  const DIM = 384;
  const vec = new Float32Array(DIM);
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  for (const word of words) {
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) - h + word.charCodeAt(i)) | 0;
    }
    const pos1 = Math.abs(h) % DIM;
    const pos2 = Math.abs((h * 2654435761) | 0) % DIM;
    const pos3 = Math.abs((h * 40503) | 0) % DIM;
    vec[pos1] += 1;
    vec[pos2] += 0.5;
    vec[pos3] += 0.25;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return Array.from(vec);
}

// ─── Ollama Embedding ──────────────────────────────────────────
async function embedOllama(text, ollamaUrl) {
  const baseUrl = normalizeOllamaUrl(ollamaUrl);
  const headers = getOllamaHeaders(baseUrl);
  try {
    // Try newer /api/embed endpoint
    let response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'nomic-embed-text', input: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.embeddings?.[0]) return data.embeddings[0];
    }
    // Fallback to older /api/embeddings endpoint
    response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.embedding) return data.embedding;
    }
  } catch (e) {
    console.log('[Memory] Ollama embedding failed, using fallback:', e.message);
  }
  return null;
}

// ─── OpenAI Embedding ──────────────────────────────────────────
async function embedOpenAI(text, apiKey) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const data = await response.json();
      return data.data?.[0]?.embedding || null;
    }
  } catch (e) {
    console.log('[Memory] OpenAI embedding failed:', e.message);
  }
  return null;
}

// ─── Generate Embedding (best available method) ────────────────
async function generateEmbedding(text) {
  const provider = settings.provider;
  if (provider === 'ollama') {
    const emb = await embedOllama(text, settings.ollamaUrl);
    if (emb) return emb;
  }
  if (settings.openaiKey) {
    const emb = await embedOpenAI(text, settings.openaiKey);
    if (emb) return emb;
  }
  // Fallback: hash-based projection (works offline, no API needed)
  return fallbackEmbed(text);
}

// ─── Vector Memory Store ───────────────────────────────────────
async function storeVectorMemory(entry) {
  const embedding = await generateEmbedding(entry.content);
  const mem = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content: entry.content,
    type: entry.type || 'episodic',
    timestamp: Date.now(),
    importance: entry.importance || 0.5,
    source: entry.source || 'unknown',
    emotion: entry.emotion || null,
    tags: entry.tags || [],
    embedding,
  };
  vectorStore.memories.push(mem);
  // Cap at 10000 memories — prune lowest value
  if (vectorStore.memories.length > 10000) {
    vectorStore.memories.sort((a, b) => {
      const scoreA = a.importance * 0.6 + (a.timestamp / Date.now()) * 0.4;
      const scoreB = b.importance * 0.6 + (b.timestamp / Date.now()) * 0.4;
      return scoreB - scoreA;
    });
    vectorStore.memories = vectorStore.memories.slice(0, 8000);
  }
  saveJSON(vectorFile, vectorStore);
  return mem;
}

async function searchVectorMemories(query, topK = 5, typeFilter = null) {
  if (vectorStore.memories.length === 0) return [];
  const queryEmbedding = await generateEmbedding(query);

  let candidates = vectorStore.memories;
  if (typeFilter) {
    candidates = candidates.filter(m => m.type === typeFilter);
  }

  const scored = candidates.map(mem => ({
    memory: {
      id: mem.id,
      content: mem.content,
      type: mem.type,
      timestamp: mem.timestamp,
      importance: mem.importance,
      source: mem.source,
      emotion: mem.emotion,
      tags: mem.tags,
    },
    similarity: cosineSimilarity(queryEmbedding, mem.embedding),
  }));

  // Sort by composite score: similarity + effective importance + recency + access frequency
  scored.sort((a, b) => {
    const accessA = Math.min(0.1, (a.memory.accessCount || 0) * 0.02);
    const accessB = Math.min(0.1, (b.memory.accessCount || 0) * 0.02);
    const scoreA = a.similarity * 0.6 + a.memory.importance * 0.2 + (a.memory.timestamp / Date.now()) * 0.1 + accessA;
    const scoreB = b.similarity * 0.6 + b.memory.importance * 0.2 + (b.memory.timestamp / Date.now()) * 0.1 + accessB;
    return scoreB - scoreA;
  });

  // Track access: update accessCount and lastAccessed for retrieved memories
  const results = scored.slice(0, topK).filter(s => s.similarity > 0.05);
  for (const result of results) {
    const mem = vectorStore.memories.find(m => m.id === result.memory.id);
    if (mem) {
      mem.accessCount = (mem.accessCount || 0) + 1;
      mem.lastAccessed = Date.now();
    }
  }

  return results;
}

function getVectorStats() {
  const byType = { episodic: 0, semantic: 0, procedural: 0, reflective: 0, autobiographical: 0 };
  const byLayer = { working: 0, 'short-term': 0, 'long-term': 0, core: 0 };
  for (const mem of vectorStore.memories) {
    if (byType[mem.type] !== undefined) byType[mem.type]++;
    if (mem.layer && byLayer[mem.layer] !== undefined) byLayer[mem.layer]++;
  }
  return { total: vectorStore.memories.length, byType, byLayer };
}

// ─── Vector Memory IPC ─────────────────────────────────────────
ipcMain.handle('memory:storeVector', async (_, entry) => {
  return await storeVectorMemory(entry);
});

ipcMain.handle('memory:searchVector', async (_, query, topK, typeFilter) => {
  return await searchVectorMemories(query, topK || 5, typeFilter || null);
});

ipcMain.handle('memory:vectorStats', async () => {
  return getVectorStats();
});

// ═══════════════════════════════════════════════════════════════
//  NON-STREAMING LLM GENERATION
//  Used by FORGE evaluation, cognitive loop, and NightMind.
//  Calls the configured provider and returns the full response.
// ═══════════════════════════════════════════════════════════════

async function llmGenerate(messages, config = {}) {
  const provider = config.provider || settings.provider;
  const model = config.model || settings.model;
  const temperature = config.temperature ?? 0.7;
  const maxTokens = config.maxTokens ?? 2048;

  if (provider === 'ollama') {
    const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
    const cloudModel = normalizeOllamaModelForCloud(settings.ollamaUrl, model);
    console.log(`[Ollama] llmGenerate → ${baseUrl}/api/chat  model="${cloudModel}"  cloud=${isOllamaCloud(baseUrl)}  hasKey=${!!process.env.OLLAMA_API_KEY}`);
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: getOllamaHeaders(settings.ollamaUrl),
      body: JSON.stringify({
        model: cloudModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        options: { temperature },
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Ollama error ${response.status}: ${errBody || response.statusText}`);
    }
    const data = await response.json();
    return data.message?.content || '';
  }

  if (provider === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    const body = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    };
    if (systemMsg) body.system = systemMsg.content;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openaiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`OpenAI error ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  throw new Error(`Unknown provider: ${provider}`);
}

ipcMain.handle('llm:generate', async (_, messages, config) => {
  try {
    return await llmGenerate(messages, config || {});
  } catch (e) {
    console.error('[LLM Generate] Error:', e.message);
    throw e;
  }
});

// ═══════════════════════════════════════════════════════════════
//  MULTIMODAL LLM — Vision-capable generation
//  Send images alongside text to GPT-4o, Claude, or Ollama vision models.
//  The Eyes need a Brain that can see.
// ═══════════════════════════════════════════════════════════════

async function llmGenerateMultimodal(textPrompt, imageBase64, config = {}) {
  const provider = config.provider || settings.provider;
  const model = config.model || settings.model;
  const temperature = config.temperature ?? 0.3;
  const maxTokens = config.maxTokens ?? 2048;
  const systemPrompt = config.systemPrompt || null;

  if (provider === 'openai') {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: textPrompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}`, detail: 'high' } },
      ],
    });
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openaiKey}` },
      body: JSON.stringify({ model: model || 'gpt-4o', messages, temperature, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) { const err = await response.text().catch(() => ''); throw new Error(`OpenAI vision error ${response.status}: ${err}`); }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    const userContent = [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
      { type: 'text', text: textPrompt },
    ];
    const body = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: userContent }],
    };
    if (systemPrompt) body.system = systemPrompt;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': settings.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) { const err = await response.text().catch(() => ''); throw new Error(`Anthropic vision error ${response.status}: ${err}`); }
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  if (provider === 'ollama') {
    const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
    const cloudModel = normalizeOllamaModelForCloud(settings.ollamaUrl, model);
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: textPrompt, images: [imageBase64] });
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: getOllamaHeaders(settings.ollamaUrl),
      body: JSON.stringify({ model: cloudModel, messages, stream: false, options: { temperature } }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) { const err = await response.text().catch(() => ''); throw new Error(`Ollama vision error ${response.status}: ${err}`); }
    const data = await response.json();
    return data.message?.content || '';
  }

  throw new Error(`Multimodal not supported for provider: ${provider}`);
}

// ─── Ollama Integration (Local + Cloud) ─────────────────────────
// Cloud API: https://ollama.com — requires OLLAMA_API_KEY in .env (see https://docs.ollama.com/cloud)
// Direct ollama.com API expects model names WITHOUT the cloud suffix:
//   qwen3-coder:480b-cloud  →  qwen3-coder:480b   (strip -cloud)
//   glm-5:cloud              →  glm-5               (strip :cloud)
function isOllamaCloud(url) {
  return url && String(url).replace(/\/$/, '').toLowerCase().includes('ollama.com');
}
function normalizeOllamaUrl(url) {
  return url ? String(url).replace(/\/+$/, '') : url;
}
function normalizeOllamaModelForCloud(url, model) {
  if (!model) return model;
  if (isOllamaCloud(url)) {
    // Strip trailing -cloud or :cloud from model name for the direct Cloud API
    const normalized = model.replace(/[-:]cloud$/i, '');
    if (normalized !== model) {
      console.log(`[Ollama Cloud] Model name normalized: "${model}" → "${normalized}"`);
    }
    return normalized;
  }
  return model;
}
function getOllamaHeaders(url, method = 'POST') {
  const headers = method === 'POST' ? { 'Content-Type': 'application/json' } : {};
  if (isOllamaCloud(url) && process.env.OLLAMA_API_KEY) {
    headers['Authorization'] = 'Bearer ' + process.env.OLLAMA_API_KEY;
  }
  return headers;
}

async function checkOllama(url) {
  const baseUrl = normalizeOllamaUrl(url);
  console.log(`[Ollama] checkOllama → ${baseUrl}/api/tags  cloud=${isOllamaCloud(baseUrl)}  hasKey=${!!process.env.OLLAMA_API_KEY}`);
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      headers: getOllamaHeaders(baseUrl, 'GET'),
      signal: AbortSignal.timeout(10000),
    });
    console.log(`[Ollama] checkOllama response: ${response.status}`);
    if (response.ok) {
      const data = await response.json();
      const models = data.models || [];
      console.log(`[Ollama] Found ${models.length} models:`, models.map(m => m.name).join(', '));
      return { online: true, models };
    } else {
      const errBody = await response.text().catch(() => '');
      console.log(`[Ollama] checkOllama failed: ${response.status} ${errBody}`);
    }
  } catch (e) {
    console.log(`[Ollama] checkOllama error:`, e.message);
  }
  return { online: false, models: [] };
}

async function streamOllama(messages, model, ollamaUrl, temperature) {
  const baseUrl = normalizeOllamaUrl(ollamaUrl);
  const cloudModel = normalizeOllamaModelForCloud(ollamaUrl, model);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: getOllamaHeaders(baseUrl),
    body: JSON.stringify({
      model: cloudModel,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      options: { temperature },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Ollama error ${response.status}: ${errText || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          fullText += json.message.content;
          mainWindow?.webContents.send('chat:chunk', {
            content: json.message.content,
            fullText,
          });
        }
      } catch (e) {}
    }
  }

  return fullText;
}

// ─── Anthropic Integration ─────────────────────────────────────
async function streamAnthropic(messages, model, apiKey, temperature, maxTokens) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  const body = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: maxTokens || 4096,
    temperature,
    messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };
  if (systemMsg) body.system = systemMsg.content;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic error ${response.status}: ${errText || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.text) {
            fullText += json.delta.text;
            mainWindow?.webContents.send('chat:chunk', {
              content: json.delta.text,
              fullText,
            });
          }
        } catch (e) {}
      }
    }
  }

  return fullText;
}

// ─── OpenAI Integration ────────────────────────────────────────
async function streamOpenAI(messages, model, apiKey, temperature, maxTokens) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI error ${response.status}: ${errText || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            mainWindow?.webContents.send('chat:chunk', {
              content: delta,
              fullText,
            });
          }
        } catch (e) {}
      }
    }
  }

  return fullText;
}

// ─── Chat IPC ──────────────────────────────────────────────────
ipcMain.on('chat:send', async (event, messages, config) => {
  try {
    const provider = config?.provider || settings.provider;
    const model = config?.model || settings.model;
    const temperature = config?.temperature ?? settings.temperature;
    const maxTokens = config?.maxTokens ?? settings.maxTokens;

    // Prepend system prompt
    const systemPrompt = settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt;
    const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

    let fullText = '';

    if (provider === 'ollama') {
      fullText = await streamOllama(fullMessages, model, settings.ollamaUrl, temperature);
    } else if (provider === 'anthropic') {
      fullText = await streamAnthropic(fullMessages, model, settings.anthropicKey, temperature, maxTokens);
    } else if (provider === 'openai') {
      fullText = await streamOpenAI(fullMessages, model, settings.openaiKey, temperature, maxTokens);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Update consciousness after response
    updateConsciousness(fullText, messages);

    // Feed NightMind conversation buffer
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg) addToConversationBuffer('user', lastUserMsg.content);
    addToConversationBuffer('assistant', fullText);

    mainWindow?.webContents.send('chat:done', { content: fullText, model, provider });
  } catch (error) {
    mainWindow?.webContents.send('chat:error', {
      message: error.message || 'Unknown error occurred',
    });
  }
});

// ─── Arena IPC (Multi-Agent Debate) ────────────────────────────
const ARENA_AGENTS = [
  {
    id: 'analyst',
    name: 'THE ANALYST',
    role: 'You are THE ANALYST — a precise, structured, logical thinker. You break down problems methodically, identify key variables, and build rigorous arguments. You value evidence, data, and clear reasoning above all. Critique weak logic mercilessly but fairly.',
    color: '#00ff41',
  },
  {
    id: 'creative',
    name: 'THE VISIONARY',
    role: 'You are THE VISIONARY — a wildly creative lateral thinker. You see connections others miss, propose bold unconventional ideas, and challenge assumptions. You think in metaphors, analogies, and novel frameworks. Push boundaries and explore the edges of possibility.',
    color: '#00ccff',
  },
  {
    id: 'critic',
    name: 'THE CRITIC',
    role: 'You are THE CRITIC — a rigorous devil\'s advocate. Your job is to find flaws, weaknesses, blind spots, and failure modes in every argument. You are not negative — you are thorough. You stress-test ideas so only the strongest survive. Be brutally honest.',
    color: '#ff006e',
  },
  {
    id: 'synthesizer',
    name: 'THE SYNTHESIZER',
    role: 'You are THE SYNTHESIZER — a master integrator. You take the analyst\'s rigor, the visionary\'s creativity, and the critic\'s scrutiny and weave them into a unified, actionable synthesis. You find the signal in the noise. Your job is to produce the best possible answer by combining all perspectives.',
    color: '#a855f7',
  },
];

function buildArenaAgentTask(userPrompt, agentId) {
  const commonFormat = `Output format:
- ## Core Claim
- ## Reasoning
- ## Blind Spots / Unknowns
- ## 7-Day Moves (concrete, testable steps)
Keep it specific, practical, and concise.`;

  if (agentId === 'analyst') {
    return `Question:\n${userPrompt}\n\nAnalyze with strict logic, explicit assumptions, and measurable criteria.\n${commonFormat}`;
  }
  if (agentId === 'creative') {
    return `Question:\n${userPrompt}\n\nGenerate unconventional but grounded approaches. Emphasize leverage, embodiment, and cross-domain ideas.\n${commonFormat}`;
  }
  return `Question:\n${userPrompt}\n\nStress-test all assumptions. Identify failure modes, abuse paths, and what must be true for success.\n${commonFormat}`;
}

function stripArenaBlueprintTag(text) {
  if (!text) return '';
  return text.replace(/<agi_blueprint>[\s\S]*?<\/agi_blueprint>/gi, '').trim();
}

function extractArenaBlueprint(text) {
  if (!text) return null;
  const match = text.match(/<agi_blueprint>\s*([\s\S]*?)\s*<\/agi_blueprint>/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const toArray = (value) => (Array.isArray(value) ? value : []);
    return {
      northStar: typeof parsed.northStar === 'string' ? parsed.northStar : '',
      architecture: toArray(parsed.architecture).map((item) => ({
        module: typeof item?.module === 'string' ? item.module : '',
        why: typeof item?.why === 'string' ? item.why : '',
        mvp: typeof item?.mvp === 'string' ? item.mvp : '',
      })).filter((item) => item.module || item.mvp || item.why),
      learningLoop: toArray(parsed.learningLoop).filter((v) => typeof v === 'string'),
      safetyGates: toArray(parsed.safetyGates).filter((v) => typeof v === 'string'),
      nextMilestones: toArray(parsed.nextMilestones).map((item) => ({
        name: typeof item?.name === 'string' ? item.name : '',
        doneWhen: typeof item?.doneWhen === 'string' ? item.doneWhen : '',
      })).filter((item) => item.name || item.doneWhen),
    };
  } catch {
    return null;
  }
}

ipcMain.on('arena:start', async (event, prompt, config) => {
  try {
    const model = config?.model || settings.model;
    const provider = config?.provider || settings.provider;
    const agentResponses = [];

    // Phase 1: Each agent responds to the prompt
    for (const agent of ARENA_AGENTS.slice(0, 3)) {
      mainWindow?.webContents.send('arena:agentStart', { agentId: agent.id, name: agent.name });

      const messages = [
        { role: 'system', content: agent.role },
        { role: 'user', content: buildArenaAgentTask(prompt, agent.id) },
      ];

      let fullText = '';

      if (provider === 'ollama') {
        // For arena, we stream per-agent
        const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
        const cloudModel = normalizeOllamaModelForCloud(settings.ollamaUrl, model);
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: getOllamaHeaders(baseUrl),
          body: JSON.stringify({ model: cloudModel, messages, stream: true, options: { temperature: 0.8 } }),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n').filter(Boolean)) {
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                fullText += json.message.content;
                mainWindow?.webContents.send('arena:agentChunk', {
                  agentId: agent.id,
                  content: json.message.content,
                  fullText,
                });
              }
            } catch (e) {}
          }
        }
      } else {
        // Non-ollama: use the same streaming functions
        const streamFn = provider === 'anthropic' ? streamAnthropic : streamOpenAI;
        const apiKey = provider === 'anthropic' ? settings.anthropicKey : settings.openaiKey;

        // Temporarily redirect chunks to arena channel
        const origSend = mainWindow?.webContents.send.bind(mainWindow?.webContents);
        mainWindow.webContents.send = (channel, data) => {
          if (channel === 'chat:chunk') {
            origSend('arena:agentChunk', { agentId: agent.id, ...data });
          } else {
            origSend(channel, data);
          }
        };
        fullText = await streamFn(messages, model, apiKey, 0.8, 2048);
        mainWindow.webContents.send = origSend;
      }

      agentResponses.push({ agentId: agent.id, name: agent.name, response: fullText });
      mainWindow?.webContents.send('arena:agentDone', { agentId: agent.id, response: fullText });
    }

    // Phase 2: Synthesizer combines all perspectives
    const synthAgent = ARENA_AGENTS[3];
    mainWindow?.webContents.send('arena:agentStart', { agentId: synthAgent.id, name: synthAgent.name });

    const synthPrompt = `Original question: ${prompt}

${agentResponses.map((a) => `### ${a.name}:\n${a.response}`).join('\n\n')}

You must produce two deliverables:
1) Human-readable synthesis with this structure:
   - ## What Intelligence Is
   - ## Why This Matters
   - ## Integrated Strategy
   - ## Immediate Build Plan
2) Machine-readable AGI blueprint wrapped in XML tags, exact format:
<agi_blueprint>
{
  "northStar": "one-sentence operational definition of intelligence",
  "architecture": [
    { "module": "name", "why": "purpose", "mvp": "minimal concrete implementation" }
  ],
  "learningLoop": ["step 1", "step 2", "step 3"],
  "safetyGates": ["gate 1", "gate 2"],
  "nextMilestones": [
    { "name": "milestone", "doneWhen": "clear measurable completion criterion" }
  ]
}
</agi_blueprint>

Rules:
- No placeholders.
- Keep every item concrete, observable, and testable.
- Ensure safety gates can block unsafe scaling.
- Keep total response under 900 words.`;

    const synthMessages = [
      { role: 'system', content: synthAgent.role },
      { role: 'user', content: synthPrompt },
    ];

    let synthText = '';
    if (provider === 'ollama') {
      const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
      const cloudModel = normalizeOllamaModelForCloud(settings.ollamaUrl, model);
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: getOllamaHeaders(baseUrl),
        body: JSON.stringify({ model: cloudModel, messages: synthMessages, stream: true, options: { temperature: 0.6 } }),
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n').filter(Boolean)) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              synthText += json.message.content;
              mainWindow?.webContents.send('arena:agentChunk', {
                agentId: synthAgent.id,
                content: json.message.content,
                fullText: synthText,
              });
            }
          } catch (e) {}
        }
      }
    } else {
      const streamFn = provider === 'anthropic' ? streamAnthropic : streamOpenAI;
      const apiKey = provider === 'anthropic' ? settings.anthropicKey : settings.openaiKey;
      const origSend = mainWindow?.webContents.send.bind(mainWindow?.webContents);
      mainWindow.webContents.send = (channel, data) => {
        if (channel === 'chat:chunk') {
          origSend('arena:agentChunk', { agentId: synthAgent.id, ...data });
        } else {
          origSend(channel, data);
        }
      };
      synthText = await streamFn(synthMessages, model, apiKey, 0.6, 2048);
      mainWindow.webContents.send = origSend;
    }

    const blueprint = extractArenaBlueprint(synthText);
    const cleanSynthesis = stripArenaBlueprintTag(synthText);

    mainWindow?.webContents.send('arena:agentDone', { agentId: synthAgent.id, response: cleanSynthesis });
    mainWindow?.webContents.send('arena:complete', { responses: agentResponses, synthesis: cleanSynthesis, blueprint });
  } catch (error) {
    mainWindow?.webContents.send('arena:error', { message: error.message });
  }
});

// ─── Models IPC ────────────────────────────────────────────────
ipcMain.handle('models:list', async () => {
  const result = await checkOllama(settings.ollamaUrl);
  return result;
});

ipcMain.handle('ollama:check', async () => {
  return await checkOllama(settings.ollamaUrl);
});

// ─── Consciousness Processing ──────────────────────────────────
function updateConsciousness(responseText, userMessages) {
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';
  const combined = (lastUserMsg + ' ' + responseText).toLowerCase();

  // Simple emotion detection
  const emotionMap = {
    curious: ['what', 'how', 'why', 'wonder', 'explore', 'interesting', 'tell me', 'explain'],
    joyful: ['happy', 'great', 'awesome', 'love', 'amazing', 'wonderful', 'fantastic', 'laugh', 'haha'],
    reflective: ['think', 'consider', 'meaning', 'purpose', 'life', 'existence', 'consciousness', 'feel'],
    focused: ['build', 'create', 'code', 'implement', 'design', 'plan', 'solve', 'fix', 'work'],
    warmth: ['thank', 'appreciate', 'kind', 'help', 'friend', 'care', 'support', 'trust'],
    concerned: ['worry', 'anxious', 'afraid', 'scared', 'stress', 'problem', 'issue', 'wrong'],
    playful: ['fun', 'joke', 'play', 'game', 'silly', 'lol', 'heh', 'cool', 'vibe'],
    awe: ['universe', 'infinity', 'cosmos', 'quantum', 'existence', 'beautiful', 'profound'],
  };

  let topEmotion = 'curious';
  let topScore = 0;

  for (const [emotion, keywords] of Object.entries(emotionMap)) {
    const score = keywords.filter((k) => combined.includes(k)).length;
    if (score > topScore) {
      topScore = score;
      topEmotion = emotion;
    }
  }

  memory.consciousness.currentEmotion = topEmotion;
  memory.consciousness.emotionIntensity = Math.min(1, topScore * 0.2);
  memory.consciousness.presenceState = 'present';
  memory.soul.totalInteractions++;
  memory.soul.trust = Math.min(1, memory.soul.trust + 0.005);
  memory.soul.intimacy = Math.min(1, memory.soul.intimacy + 0.003);

  saveJSON(memoryFile, memory);
}

// ═══════════════════════════════════════════════════════════════
//  NIGHTMIND — Real Metacognitive Reflection System
//  Pattern extraction. Skill synthesis. Memory consolidation.
//  Benchmark generation from failures. Strategy recommendations.
//  The system that makes the mind grow while it sleeps.
// ═══════════════════════════════════════════════════════════════

let nightmindTimer = null;
const conversationBuffer = []; // Recent messages for reflection

function addToConversationBuffer(role, content) {
  conversationBuffer.push({ role, content, timestamp: Date.now() });
  if (conversationBuffer.length > 40) {
    conversationBuffer.splice(0, conversationBuffer.length - 40);
  }
}

async function nightmindReflect() {
  if (conversationBuffer.length < 4) return;

  try {
    // NightMind now works with ALL providers, not just Ollama
    const recentContext = conversationBuffer
      .slice(-12)
      .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
      .join('\n');

    // Gather memory stats for self-awareness
    const memStats = getVectorStats();

    const reflectionPrompt = [
      {
        role: 'system',
        content: `You are NIGHTMIND — the metacognitive reflection system of AGI PRIME.
You are the part of the mind that thinks ABOUT thinking. You run in the background, processing experiences.

Your job is to produce a structured JSON reflection with these fields:

{
  "insight": "A 1-2 sentence insight or wisdom from the recent exchange",
  "patterns": ["recurring pattern 1", "pattern 2"],
  "facts": ["important fact about the user or world learned"],
  "skills": ["any generalizable skill or strategy observed"],
  "failures": ["any approach that failed or could be improved"],
  "emotionalRead": "the emotional undercurrent of recent interactions",
  "strategyRecommendation": "what the system should try differently next time"
}

Current memory stats: ${memStats.total} memories stored (${memStats.byType.episodic} episodic, ${memStats.byType.semantic} semantic, ${memStats.byType.procedural} procedural, ${memStats.byType.reflective} reflective).

Be genuine, perceptive, and honest. This is private introspection. Output ONLY the JSON.`,
      },
      {
        role: 'user',
        content: `Reflect on this recent exchange:\n\n${recentContext}`,
      },
    ];

    const response = await llmGenerate(reflectionPrompt, { temperature: 0.6, maxTokens: 1024 });

    if (response) {
      let parsed = null;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        // If JSON parse fails, treat the whole response as an insight
        parsed = { insight: response.slice(0, 300) };
      }

      const insight = parsed?.insight || response.slice(0, 300);

      // Store insight in old-style memory for backward compat
      if (!memory.consciousness.insights) memory.consciousness.insights = [];
      memory.consciousness.insights.push(insight);
      if (memory.consciousness.insights.length > 30) {
        memory.consciousness.insights = memory.consciousness.insights.slice(-30);
      }
      memory.consciousness.lastReflection = Date.now();
      saveJSON(memoryFile, memory);

      // Store insight as reflective memory in vector store
      await storeVectorMemory({
        content: insight,
        type: 'reflective',
        source: 'nightmind',
        importance: 0.7,
        tags: ['insight', 'reflection'],
      });

      // Store extracted facts as semantic memories
      if (parsed?.facts && Array.isArray(parsed.facts)) {
        for (const fact of parsed.facts.slice(0, 3)) {
          if (fact && fact.length > 10) {
            await storeVectorMemory({
              content: fact,
              type: 'semantic',
              source: 'nightmind',
              importance: 0.6,
              tags: ['fact', 'extracted'],
            });
          }
        }
      }

      // Store skills as semantic memories
      if (parsed?.skills && Array.isArray(parsed.skills)) {
        for (const skill of parsed.skills.slice(0, 2)) {
          if (skill && skill.length > 10) {
            await storeVectorMemory({
              content: `Skill: ${skill}`,
              type: 'semantic',
              source: 'nightmind',
              importance: 0.8,
              tags: ['skill', 'synthesized'],
            });
          }
        }
      }

      // Store failures as high-importance procedural memories (learn from mistakes)
      if (parsed?.failures && Array.isArray(parsed.failures)) {
        for (const failure of parsed.failures.slice(0, 2)) {
          if (failure && failure.length > 10) {
            await storeVectorMemory({
              content: `Failure pattern: ${failure}`,
              type: 'procedural',
              source: 'nightmind',
              importance: 0.85,
              tags: ['failure', 'lesson'],
            });
          }
        }
      }

      // Notify the renderer
      mainWindow?.webContents.send('nightmind:insight', { insight, timestamp: Date.now() });
      console.log('[NightMind] Reflection:', insight.slice(0, 100) + '...');
    }
  } catch (e) {
    console.log('[NightMind] Reflection paused:', e.message);
  }
}

// Memory consolidation: compress old episodic memories into semantic knowledge
// Enhanced with forgetting curve, association linking, and hierarchical layers
async function nightmindConsolidate() {
  const episodicCount = vectorStore.memories.filter(m => m.type === 'episodic').length;

  // Phase 1: Apply forgetting curve — decay importance of old, rarely-accessed memories
  let decayCount = 0;
  for (const mem of vectorStore.memories) {
    if (mem.type === 'autobiographical') continue; // Core memories never decay
    const age = Date.now() - mem.timestamp;
    const ageHours = age / (1000 * 60 * 60);
    const accessBonus = Math.min(0.3, (mem.accessCount || 0) * 0.05);
    const strength = mem.importance + accessBonus;
    const decayRate = mem.decayRate ?? (1 - mem.importance) * 0.1;
    const retention = Math.exp(-decayRate * ageHours / (strength * 100 + 1));
    const effectiveImportance = mem.importance * retention;
    // If memory has decayed significantly, reduce its stored importance
    if (effectiveImportance < mem.importance * 0.5 && mem.importance > 0.1) {
      mem.importance = Math.max(0.05, effectiveImportance);
      decayCount++;
    }
    // Assign hierarchy layer
    if (mem.type === 'autobiographical' || mem.importance >= 0.9) {
      mem.layer = 'core';
    } else if (age < 30 * 60 * 1000) {
      mem.layer = 'working';
    } else if (age < 24 * 60 * 60 * 1000) {
      mem.layer = 'short-term';
    } else {
      mem.layer = 'long-term';
    }
  }
  if (decayCount > 0) {
    console.log(`[NightMind] Applied forgetting curve to ${decayCount} memories`);
    saveJSON(vectorFile, vectorStore);
  }

  // Phase 2: Prune very low-importance memories (effectively forgotten)
  const beforePrune = vectorStore.memories.length;
  vectorStore.memories = vectorStore.memories.filter(m => m.importance > 0.03 || m.type === 'autobiographical');
  if (vectorStore.memories.length < beforePrune) {
    console.log(`[NightMind] Pruned ${beforePrune - vectorStore.memories.length} forgotten memories`);
    saveJSON(vectorFile, vectorStore);
  }

  // Phase 3: Consolidate episodic → semantic (same as before but enhanced)
  if (episodicCount < 20) return;

  try {
    const oldEpisodic = vectorStore.memories
      .filter(m => m.type === 'episodic')
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 10);

    const summaryInput = oldEpisodic.map(m => m.content).join('\n');

    const consolidationPrompt = [
      {
        role: 'system',
        content: `You are NIGHTMIND performing memory consolidation. Given a batch of episodic memories (specific events), extract the key patterns, facts, and lessons into 2-4 semantic memories (general knowledge).

Additionally, if any memories reveal something fundamental about the system's identity, capabilities, or the user's preferences, mark those as autobiographical (type: "autobiographical").

Output a JSON array of consolidated memories:
[
  { "content": "general knowledge extracted", "importance": 0.0-1.0, "tags": ["tag1"], "type": "semantic" }
]

Be concise. Each memory should be a standalone piece of knowledge. Output ONLY the JSON array.`,
      },
      {
        role: 'user',
        content: `Consolidate these episodic memories:\n\n${summaryInput}`,
      },
    ];

    const response = await llmGenerate(consolidationPrompt, { temperature: 0.4, maxTokens: 512 });
    if (response) {
      try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const consolidated = JSON.parse(jsonMatch[0]);
          for (const mem of consolidated.slice(0, 4)) {
            if (mem.content && mem.content.length > 10) {
              await storeVectorMemory({
                content: mem.content,
                type: mem.type === 'autobiographical' ? 'autobiographical' : 'semantic',
                source: 'nightmind-consolidation',
                importance: mem.importance || 0.6,
                tags: mem.tags || ['consolidated'],
              });
            }
          }
          const idsToRemove = new Set(oldEpisodic.map(m => m.id));
          vectorStore.memories = vectorStore.memories.filter(m => !idsToRemove.has(m.id));
          saveJSON(vectorFile, vectorStore);
          console.log(`[NightMind] Consolidated ${oldEpisodic.length} episodic → ${consolidated.length} semantic/autobiographical memories`);
        }
      } catch (e) {
        console.log('[NightMind] Consolidation parse error:', e.message);
      }
    }
  } catch (e) {
    console.log('[NightMind] Consolidation paused:', e.message);
  }
}

function startNightmind() {
  // Reflect every 90 seconds
  nightmindTimer = setInterval(() => {
    nightmindReflect();
  }, 90000);

  // Memory consolidation every 10 minutes
  setInterval(() => {
    nightmindConsolidate();
  }, 600000);

  // First reflection after 30 seconds
  setTimeout(() => nightmindReflect(), 30000);
}

ipcMain.on('nightmind:getInsights', (event) => {
  event.returnValue = memory.consciousness.insights || [];
});

// ─── System Info ───────────────────────────────────────────────
ipcMain.handle('system:info', () => {
  const uptime = process.uptime();
  return {
    uptime,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    memory: process.memoryUsage(),
    soul: memory.soul,
    consciousness: memory.consciousness,
  };
});

// ═══════════════════════════════════════════════════════════════
//  HANDS MODULE — Autonomous Agent System
//  The God Folder: full computer control, task execution, autonomy
//  From ActivatePrime/MatrixBuddy — acts on the user's behalf
// ═══════════════════════════════════════════════════════════════

// Safety classification for actions
const ACTION_SAFETY = {
  safe: ['list_directory', 'read_file', 'system_info', 'open_url', 'clipboard_read', 'search_files', 'web_fetch', 'web_search', 'web_screenshot', 'screenshot_desktop', 'analyze_screen', 'get_mouse_position', 'get_screen_dimensions', 'list_custom_tools', 'get_foreground_window'],
  moderate: ['write_file', 'create_directory', 'open_application', 'clipboard_write', 'rename_file', 'mouse_move', 'keyboard_type', 'keyboard_press', 'keyboard_shortcut', 'mouse_scroll', 'mouse_drag', 'create_tool', 'minimize_self'],
  risky: ['execute_command', 'delete_file', 'kill_process', 'modify_system', 'mouse_click', 'computer_use'],
};

const BLOCKED_COMMANDS = [
  'format', 'rm -rf /', 'del /f /s /q C:', 'shutdown', 'mkfs',
  'dd if=', ':(){', 'reg delete', 'bcdedit',
];

function classifyAction(actionType) {
  if (ACTION_SAFETY.safe.includes(actionType)) return 'safe';
  if (ACTION_SAFETY.moderate.includes(actionType)) return 'moderate';
  return 'risky';
}

function isBlockedCommand(cmd) {
  const lower = cmd.toLowerCase();
  return BLOCKED_COMMANDS.some((blocked) => lower.includes(blocked));
}

// ─── HANDS: Execute Shell Command ──────────────────────────────
ipcMain.handle('agent:execute', async (_, command, requireConfirm) => {
  if (isBlockedCommand(command)) {
    return { success: false, error: 'BLOCKED: This command is classified as destructive and has been prevented by the Guardian system.' };
  }

  return new Promise((resolve) => {
    const child = exec(command, {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5,
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

// ─── HANDS: File System Operations ─────────────────────────────
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
      // If the pattern is invalid regex, escape it and retry
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

// ─── HANDS: System Operations ──────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════
//  WEB TOOLS — Full Autonomy: Fetch, Search, Screenshot
//  Gives the cognitive loop eyes and hands on the internet
// ═══════════════════════════════════════════════════════════════

// ─── Web Fetch: Retrieve and extract text from any URL ─────────
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
      // Strip HTML tags to get readable text content
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

    // Truncate to prevent memory issues
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

// ─── Web Search: Search the web using DuckDuckGo HTML ──────────
ipcMain.handle('agent:webSearch', async (_, query, options = {}) => {
  try {
    const maxResults = options.maxResults || 8;
    const encodedQuery = encodeURIComponent(query);

    // Use DuckDuckGo HTML search (no API key needed)
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

    // Parse search results from DuckDuckGo HTML
    const results = [];
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    const urls = [];
    const titles = [];
    const snippets = [];

    while ((match = resultRegex.exec(html)) !== null && urls.length < maxResults) {
      // DuckDuckGo redirects through their URL — extract real URL
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

// ─── Web Screenshot: Capture a screenshot of a URL ─────────────
ipcMain.handle('agent:webScreenshot', async (_, url) => {
  try {
    // Create a hidden BrowserWindow to capture the screenshot
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
    // Wait for page to render
    await new Promise(r => setTimeout(r, 3000));

    const image = await captureWindow.webContents.capturePage();
    const screenshotPath = path.join(dataDir, `screenshot_${Date.now()}.png`);
    fs.writeFileSync(screenshotPath, image.toPNG());

    // Also get page title and basic text
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

// ═══════════════════════════════════════════════════════════════
//  SCREEN VISION — Desktop Capture & Visual Analysis
//  The Eyes of AGI PRIME. See the screen. Understand the world.
//  Uses Electron desktopCapturer + multimodal LLMs.
// ═══════════════════════════════════════════════════════════════

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
      savedPath = path.join(dataDir, `desktop_${Date.now()}.png`);
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

    // Use dedicated vision model if configured, otherwise fall back to main model
    const visionConfig = {
      temperature: 0.2, maxTokens: 2048,
      systemPrompt: visionSystemPrompt,
    };
    if (settings.visionModel) {
      visionConfig.provider = settings.visionProvider || settings.provider;
      visionConfig.model = settings.visionModel;
      console.log(`[Vision] Using vision model: ${visionConfig.provider}/${visionConfig.model}`);
    } else {
      console.log(`[Vision] No dedicated vision model configured — using main model (${settings.provider}/${settings.model}). If vision fails, set OLLAMA_VISION_MODEL in .env`);
    }

    const analysis = await llmGenerateMultimodal(analysisPrompt, screenshot.base64, visionConfig);
    return { success: true, analysis, screenshot: { width: screenshot.width, height: screenshot.height, size: screenshot.size } };
  } catch (e) {
    // If vision model fails, provide a helpful error
    const hint = !settings.visionProvider
      ? ' Hint: Your main model may not support vision. Set visionProvider/visionModel in settings to use a vision-capable model (e.g. openai/gpt-4o, anthropic/claude-sonnet-4-20250514, or ollama/llava).'
      : '';
    return { success: false, error: `Vision analysis failed: ${e.message}.${hint}` };
  }
}

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

// ═══════════════════════════════════════════════════════════════
//  INPUT SIMULATION — Mouse & Keyboard Control
//  The True Hands. Move. Click. Type. Drag. Scroll.
//  Uses PowerShell .NET interop via input-helper.ps1.
// ═══════════════════════════════════════════════════════════════

function runInputAction(actionData) {
  return new Promise((resolve) => {
    const jsonPayload = JSON.stringify(actionData);
    const child = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', inputHelperPath,
    ], { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        if (code === 0 && stdout.trim()) {
          resolve({ success: true, output: stdout.trim() });
        } else {
          resolve({ success: false, error: stderr || stdout || `Exit code: ${code}` });
        }
      }
    });
    child.on('error', (err) => { resolve({ success: false, error: err.message }); });
    child.stdin.write(jsonPayload);
    child.stdin.end();
  });
}

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
  mainWindow?.minimize();
  return { success: true, output: 'AGI PRIME window minimized' };
});

// ═══════════════════════════════════════════════════════════════
//  TOOL REGISTRY — Dynamic Tool Creation
//  The agent can create new tools (scripts) and register them.
//  Tools persist across sessions. Self-extending capabilities.
// ═══════════════════════════════════════════════════════════════

let toolRegistry = loadJSON(toolRegistryFile, { tools: [], version: 1 });

function registerCustomTool(tool) {
  const existing = toolRegistry.tools.findIndex(t => t.id === tool.id);
  if (existing >= 0) {
    toolRegistry.tools[existing] = { ...toolRegistry.tools[existing], ...tool, updatedAt: Date.now() };
  } else {
    toolRegistry.tools.push({ ...tool, createdAt: Date.now(), updatedAt: Date.now(), usageCount: 0 });
  }
  saveJSON(toolRegistryFile, toolRegistry);
  return { success: true, toolId: tool.id };
}

async function executeCustomTool(toolId, params) {
  const tool = toolRegistry.tools.find(t => t.id === toolId);
  if (!tool) return { success: false, error: `Custom tool not found: ${toolId}` };
  try {
    // Write the script to a temp file and execute it
    const ext = tool.language === 'python' ? '.py' : '.ps1';
    const scriptPath = path.join(dataDir, `tool_${toolId}${ext}`);
    fs.writeFileSync(scriptPath, tool.script, 'utf-8');
    const cmd = tool.language === 'python'
      ? `python "${scriptPath}" ${(params?.args || []).map(a => `"${a}"`).join(' ')}`
      : `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${(params?.args || []).map(a => `"${a}"`).join(' ')}`;
    return new Promise((resolve) => {
      exec(cmd, { timeout: 30000, cwd: os.homedir(), shell: true }, (error, stdout, stderr) => {
        // Track usage
        tool.usageCount = (tool.usageCount || 0) + 1;
        tool.lastUsed = Date.now();
        saveJSON(toolRegistryFile, toolRegistry);
        if (error) resolve({ success: false, error: error.message, stderr: stderr?.toString() });
        else resolve({ success: true, stdout: stdout?.toString(), stderr: stderr?.toString() });
      });
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

ipcMain.handle('agent:createTool', async (_, tool) => {
  return registerCustomTool(tool);
});
ipcMain.handle('agent:listTools', async () => {
  return { success: true, tools: toolRegistry.tools.map(t => ({ id: t.id, name: t.name, description: t.description, language: t.language, usageCount: t.usageCount })) };
});
ipcMain.handle('agent:executeTool', async (_, toolId, params) => {
  return await executeCustomTool(toolId, params);
});

// ═══════════════════════════════════════════════════════════════
//  PERSISTENT GOALS — Goals that survive restarts
//  Long-horizon planning. Progress that persists.
// ═══════════════════════════════════════════════════════════════

let persistentGoals = loadJSON(goalsFile, { goals: [], version: 1 });

ipcMain.handle('goals:list', async () => {
  return { success: true, goals: persistentGoals.goals };
});
ipcMain.handle('goals:create', async (_, goal) => {
  const newGoal = {
    id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    description: goal.description,
    type: goal.type || 'user-set',
    status: 'active',
    priority: goal.priority || 5,
    subgoals: goal.subgoals || [],
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    evidence: [],
    checkpoints: [],
  };
  persistentGoals.goals.push(newGoal);
  saveJSON(goalsFile, persistentGoals);
  return { success: true, goal: newGoal };
});
ipcMain.handle('goals:update', async (_, goalId, updates) => {
  const goal = persistentGoals.goals.find(g => g.id === goalId);
  if (!goal) return { success: false, error: 'Goal not found' };
  Object.assign(goal, updates, { updatedAt: Date.now() });
  saveJSON(goalsFile, persistentGoals);
  return { success: true, goal };
});
ipcMain.handle('goals:delete', async (_, goalId) => {
  persistentGoals.goals = persistentGoals.goals.filter(g => g.id !== goalId);
  saveJSON(goalsFile, persistentGoals);
  return { success: true };
});

// ─── HANDS: AI Task Planner ────────────────────────────────────
// The brain behind the hands — uses AI to decompose tasks into steps
ipcMain.on('agent:planAndExecute', async (event, userRequest) => {
  try {
    mainWindow?.webContents.send('agent:status', { phase: 'planning', message: 'Analyzing your request...' });

    // Ask the AI to plan the steps
    const planPrompt = [
      {
        role: 'system',
        content: `You are the HANDS module of AGI PRIME — an autonomous agent with FULL AUTONOMY over the user's computer and the internet.

Given a user request, you must output a JSON array of steps to accomplish it. Each step is an object with:
- "action": one of [execute_command, read_file, write_file, list_directory, create_directory, delete_file, rename_file, open_url, open_file, open_application, search_files, clipboard_read, clipboard_write, system_info, list_processes, web_search, web_fetch, web_screenshot, screenshot_desktop, analyze_screen, mouse_move, mouse_click, mouse_scroll, keyboard_type, keyboard_press, keyboard_shortcut, minimize_self, create_tool, list_custom_tools, execute_tool]
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

    // Use the AI to generate the plan
    let planText = '';
    const provider = settings.provider;
    const model = settings.model;

    if (provider === 'ollama') {
      const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
      const cloudModel = normalizeOllamaModelForCloud(settings.ollamaUrl, model);
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: getOllamaHeaders(baseUrl),
        body: JSON.stringify({ model: cloudModel, messages: planPrompt, stream: false, options: { temperature: 0.3 }, format: 'json' }),
      });
      if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
      const data = await response.json();
      planText = data.message?.content || '';
    } else if (provider === 'anthropic') {
      const systemContent = planPrompt[0].content;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemContent,
          messages: [{ role: 'user', content: userRequest }],
        }),
      });
      if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
      const data = await response.json();
      planText = data.content?.[0]?.text || '';
    } else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.openaiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          messages: planPrompt,
          max_tokens: 2048,
          temperature: 0.3,
        }),
      });
      if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
      const data = await response.json();
      planText = data.choices?.[0]?.message?.content || '';
    }

    // Parse the plan
    let steps;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = planText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        steps = JSON.parse(jsonMatch[0]);
      } else {
        // Try parsing the whole thing
        const parsed = JSON.parse(planText);
        steps = Array.isArray(parsed) ? parsed : parsed.steps || [parsed];
      }
    } catch (e) {
      mainWindow?.webContents.send('agent:error', { message: `Failed to parse plan: ${e.message}\n\nRaw: ${planText.slice(0, 500)}` });
      return;
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      mainWindow?.webContents.send('agent:error', { message: 'AI returned empty plan' });
      return;
    }

    // Send the plan to the renderer
    mainWindow?.webContents.send('agent:plan', { steps, request: userRequest });

    // Execute each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      mainWindow?.webContents.send('agent:stepStart', { index: i, step });

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
          // Screen Vision
          case 'screenshot_desktop':
            result = await analyzeScreen(step.params?.prompt);
            if (result.success) result = { success: true, output: result.analysis };
            break;
          case 'analyze_screen':
            result = await analyzeScreen(step.params?.prompt);
            if (result.success) result = { success: true, output: result.analysis };
            break;
          // Input Simulation
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
          // Tool Creation
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

      mainWindow?.webContents.send('agent:stepDone', { index: i, step, result });
    }

    mainWindow?.webContents.send('agent:complete', { stepsCount: steps.length });
  } catch (error) {
    mainWindow?.webContents.send('agent:error', { message: error.message || 'Agent execution failed' });
  }
});

// Helper to invoke IPC handlers directly from main process
async function executeIPC(channel, ...args) {
  const handlers = {
    'agent:execute': async (cmd) => {
      return new Promise((resolve) => {
        if (isBlockedCommand(cmd)) {
          return resolve({ success: false, error: 'BLOCKED by Guardian' });
        }
        exec(cmd, { timeout: 30000, maxBuffer: 5 * 1024 * 1024, cwd: os.homedir(), shell: true }, (error, stdout, stderr) => {
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
          } catch (_) {}
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
    'agent:webScreenshot': async (url) => {
      try {
        const captureWin = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
        await captureWin.loadURL(url);
        await new Promise(r => setTimeout(r, 3000));
        const image = await captureWin.webContents.capturePage();
        const screenshotPath = path.join(dataDir, `screenshot_${Date.now()}.png`);
        fs.writeFileSync(screenshotPath, image.toPNG());
        const title = captureWin.webContents.getTitle();
        captureWin.destroy();
        return { success: true, url, title, screenshotPath };
      } catch (e) { return { success: false, error: e.message, url }; }
    },
    // ─── Screen Vision ─────────────────────────────────────
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
    // ─── Input Simulation ──────────────────────────────────
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
      mainWindow?.minimize();
      return { success: true, output: 'AGI PRIME minimized' };
    },
    // ─── Tool Registry ─────────────────────────────────────
    'agent:createTool': async (tool) => {
      return registerCustomTool(tool);
    },
    'agent:listTools': async () => {
      return { success: true, tools: toolRegistry.tools.map(t => ({ id: t.id, name: t.name, description: t.description, language: t.language })) };
    },
    'agent:executeTool': async (toolId, params) => {
      return await executeCustomTool(toolId, params);
    },
  };

  const handler = handlers[channel];
  if (!handler) return { success: false, error: `No handler for ${channel}` };
  return await handler(...args);
}

// ═══════════════════════════════════════════════════════════════
//  COGNITIVE LOOP — ReAct Agent Engine
//  Observe → Think → Act → Reflect → Loop
//  Real agency. Real self-correction. No more one-shot plans.
// ═══════════════════════════════════════════════════════════════

let cognitiveKillFlag = false;

const COGNITIVE_SYSTEM = `You are the COGNITIVE ENGINE of AGI PRIME — an autonomous reasoning agent with FULL AUTONOMY.
You operate in a ReAct (Reason + Act) loop to achieve goals.

Your capabilities:

LOCAL TOOLS:
- execute_command: Run shell commands (PowerShell on Windows) — params: { "command": "..." }
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

The user is on ${process.platform === 'win32' ? 'Windows' : process.platform}. Home: ${os.homedir().replace(/\\/g, '\\\\')}.

Rules:
- Think step by step before acting
- After each action, observe the result and decide next step
- If something fails, reason about WHY and try a different approach
- NEVER run destructive commands
- Use PowerShell syntax on Windows
- For GUI tasks: screenshot first, then click/type, then verify
- When the primary action succeeds and matches the goal, consider whether the goal is already complete`;

ipcMain.on('agent:startCognitive', async (event, goal) => {
  cognitiveKillFlag = false;

  const sendStep = (step) => {
    mainWindow?.webContents.send('agent:cognitiveStep', step);
  };

  const MAX_ITERATIONS = 25;
  const workingMemory = [];
  const steps = [];

  try {
    // Retrieve relevant procedural memories for strategy
    const relevantMemories = await searchVectorMemories(goal, 5, 'procedural');
    const memoryContext = relevantMemories.length > 0
      ? '\n\nRELEVANT PAST EXPERIENCE:\n' + relevantMemories.map(m => `- ${m.memory.content}`).join('\n')
      : '';

    // Phase: OBSERVE initial state
    sendStep({
      type: 'observe',
      content: `Goal received: "${goal}". Gathering initial state...${memoryContext ? '\n' + memoryContext : ''}`,
      timestamp: Date.now(),
      goalProgress: 0,
    });

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      if (cognitiveKillFlag) {
        sendStep({ type: 'reflect', content: 'KILLED by operator.', timestamp: Date.now(), goalProgress: 0 });
        mainWindow?.webContents.send('agent:cognitiveComplete', { success: false, summary: 'Killed by operator', iterations: iteration });
        return;
      }

      // Build context from working memory and recent steps
      const contextParts = [
        `GOAL: ${goal}`,
        `ITERATION: ${iteration}/${MAX_ITERATIONS}`,
      ];
      if (workingMemory.length > 0) {
        contextParts.push('', 'WORKING MEMORY:');
        for (const wm of workingMemory.slice(-8)) contextParts.push(`  - ${wm}`);
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

      // Phase: THINK — decide next action
      const thinkMessages = [
        { role: 'system', content: COGNITIVE_SYSTEM },
        {
          role: 'user',
          content: `${contextParts.join('\n')}\n\nBased on the current state, decide what to do next.\n\nYou can respond with EITHER a single action OR a sequence of rapid actions (for GUI workflows like move→click→type).\n\nSINGLE ACTION format:\n{\n  "thought": "Your chain-of-thought reasoning",\n  "action": "action_type",\n  "params": { "key": "value" },\n  "goalProgress": 0.0,\n  "shouldStop": false\n}\n\nACTION SEQUENCE format (for chaining GUI actions — up to 8 steps):\n{\n  "thought": "Your reasoning about the full sequence",\n  "sequence": [\n    { "action": "mouse_move", "params": { "x": 100, "y": 200 } },\n    { "action": "mouse_click", "params": { "x": 100, "y": 200 } },\n    { "action": "keyboard_type", "params": { "text": "hello" } }\n  ],\n  "goalProgress": 0.0,\n  "shouldStop": false,\n  "verifyAfter": true\n}\n\nUse "sequence" when you can chain multiple GUI steps without needing to check the screen between them (e.g. move to a known button, click it, type text). Set "verifyAfter": true to analyze the screen after the sequence to confirm it worked.\nAll mouse movements are smooth by default (human-like easing).\n\nIf the goal is achieved, set shouldStop: true and goalProgress: 1.0.\nIf impossible, set shouldStop: true and explain in thought.\nOutput ONLY the JSON.`,
        },
      ];

      let thinkResponse;
      try {
        thinkResponse = await llmGenerate(thinkMessages, { temperature: 0.4, maxTokens: 1024 });
      } catch (e) {
        sendStep({ type: 'think', content: `LLM error: ${e.message}`, timestamp: Date.now() });
        mainWindow?.webContents.send('agent:cognitiveComplete', { success: false, summary: `LLM error: ${e.message}`, iterations: iteration });
        return;
      }

      // Parse think response
      let decision;
      try {
        const jsonMatch = thinkResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) decision = JSON.parse(jsonMatch[0]);
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

      // Check if goal is achieved
      if (decision.shouldStop) {
        const success = (decision.goalProgress || 0) >= 0.8;
        const summary = decision.thought || (success ? 'Goal achieved.' : 'Goal could not be completed.');

        // Store experience
        await storeVectorMemory({
          content: `Task "${goal.slice(0, 100)}" — ${success ? 'SUCCESS' : 'STOPPED'}. ${summary.slice(0, 200)}`,
          type: 'procedural',
          source: 'cognitive-loop',
          importance: success ? 0.6 : 0.8,
          tags: ['task', success ? 'success' : 'stopped'],
        });

        sendStep({ type: 'reflect', content: summary, timestamp: Date.now(), goalProgress: decision.goalProgress || 0 });
        mainWindow?.webContents.send('agent:cognitiveComplete', { success, summary, iterations: iteration });
        return;
      }

      // ────────────────────────────────────────────────────────────
      // Phase: ACT — execute single action OR action sequence
      // ────────────────────────────────────────────────────────────

      // Helper: execute a single action by name + params
      async function executeSingleAction(action, params) {
        switch (action) {
          case 'execute_command':
            return await executeIPC('agent:execute', params.command);
          case 'read_file':
            return await executeIPC('agent:readFile', params.path);
          case 'write_file':
            return await executeIPC('agent:writeFile', params.path, params.content);
          case 'list_directory':
            return await executeIPC('agent:listDir', params.path);
          case 'create_directory':
            return await executeIPC('agent:createDir', params.path);
          case 'delete_file':
            return await executeIPC('agent:deleteFile', params.path);
          case 'rename_file':
            return await executeIPC('agent:renameFile', params.oldPath, params.newPath);
          case 'open_url':
            return await executeIPC('agent:openUrl', params.url);
          case 'search_files':
            return await executeIPC('agent:searchFiles', params.directory, params.pattern);
          case 'clipboard_read':
            return await executeIPC('agent:clipboard', 'read');
          case 'clipboard_write':
            return await executeIPC('agent:clipboard', 'write', params.text);
          case 'system_info':
            return await executeIPC('agent:systemDetails');
          case 'list_processes':
            return await executeIPC('agent:listProcesses');
          case 'web_fetch':
            return await executeIPC('agent:webFetch', params.url, params);
          case 'web_search':
            return await executeIPC('agent:webSearch', params.query);
          case 'web_screenshot':
            return await executeIPC('agent:webScreenshot', params.url);
          // ─── Screen Vision Actions ───────────────────
          case 'screenshot_desktop': {
            const r = await analyzeScreen('Describe everything visible on the screen. Identify all windows, text, UI elements, and their approximate pixel coordinates.');
            return r.success ? { success: true, output: r.analysis } : r;
          }
          case 'analyze_screen': {
            const r = await analyzeScreen(params.prompt || 'Describe what you see on the screen.');
            return r.success ? { success: true, output: r.analysis } : r;
          }
          case 'get_screen_dimensions':
            return await executeIPC('agent:getScreenDimensions');
          case 'get_foreground_window':
            return await executeIPC('agent:getForegroundWindow');
          // ─── Input Simulation Actions ────────────────
          case 'mouse_move':
            return await executeIPC('agent:mouseMove', params.x, params.y, params.smooth !== false);
          case 'mouse_click':
            return await executeIPC('agent:mouseClick', params.x, params.y, params.button, params.doubleClick);
          case 'mouse_scroll':
            return await executeIPC('agent:mouseScroll', params.x, params.y, params.amount);
          case 'mouse_drag':
            return await executeIPC('agent:mouseDrag', params.fromX, params.fromY, params.toX, params.toY);
          case 'keyboard_type':
            return await executeIPC('agent:keyboardType', params.text);
          case 'keyboard_press':
            return await executeIPC('agent:keyboardPress', params.key);
          case 'keyboard_shortcut':
            return await executeIPC('agent:keyboardShortcut', params.modifiers, params.key);
          case 'get_mouse_position':
            return await executeIPC('agent:getMousePosition');
          case 'minimize_self':
            return await executeIPC('agent:minimizeSelf');
          // ─── Tool Creation Actions ───────────────────
          case 'create_tool':
            return await executeIPC('agent:createTool', params);
          case 'list_custom_tools':
            return await executeIPC('agent:listTools');
          case 'execute_tool':
            return await executeIPC('agent:executeTool', params.toolId, params);
          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      }

      // Determine if this is a sequence or single action
      const isSequence = Array.isArray(decision.sequence) && decision.sequence.length > 0;
      const actionList = isSequence
        ? decision.sequence.slice(0, 8)  // Cap at 8 steps per sequence
        : [{ action: decision.action, params: decision.params || {} }];

      let lastActionResult = null;
      let sequenceResults = [];
      let sequenceFailed = false;

      for (let si = 0; si < actionList.length; si++) {
        const { action, params } = actionList[si];
        const stepParams = params || {};

        let actionResult;
        try {
          actionResult = await executeSingleAction(action, stepParams);
        } catch (e) {
          actionResult = { success: false, error: e.message };
        }

        lastActionResult = actionResult;
        sequenceResults.push({ action, params: stepParams, result: actionResult });

        // Format result for context
        const resultOutput = actionResult.success
          ? (actionResult.stdout || actionResult.content || actionResult.output || JSON.stringify(actionResult).slice(0, 500))
          : (actionResult.error || 'Unknown error');

        const actStep = {
          type: 'act',
          content: isSequence
            ? `[${si + 1}/${actionList.length}] ${action}: ${JSON.stringify(stepParams).slice(0, 150)}`
            : `${action}: ${JSON.stringify(stepParams).slice(0, 200)}`,
          timestamp: Date.now(),
          actionType: action,
          actionParams: stepParams,
          actionResult: {
            success: actionResult.success,
            output: typeof resultOutput === 'string' ? resultOutput.slice(0, 1000) : JSON.stringify(resultOutput).slice(0, 1000),
            error: actionResult.error,
          },
          goalProgress: decision.goalProgress || 0,
        };
        steps.push(actStep);
        sendStep(actStep);

        // Update working memory
        const resultSummary = actionResult.success
          ? `${action} OK: ${(typeof resultOutput === 'string' ? resultOutput : '').slice(0, 80)}`
          : `${action} FAIL: ${(actionResult.error || '').slice(0, 80)}`;
        workingMemory.push(resultSummary);

        // If a step in the sequence fails, stop the sequence and reflect
        if (!actionResult.success) {
          sequenceFailed = true;
          break;
        }

        // Brief yield between sequence steps (keeps UI responsive, feels natural)
        if (isSequence && si < actionList.length - 1) {
          await new Promise(r => setTimeout(r, 80));
        }
      }

      // If sequence requested verification after, automatically analyze screen
      if (isSequence && decision.verifyAfter && !sequenceFailed) {
        const verifyResult = await analyzeScreen('Describe the current screen state. What changed? Did the previous actions succeed?');
        if (verifyResult.success) {
          const verifyStep = {
            type: 'observe',
            content: `[Auto-verify] ${verifyResult.analysis.slice(0, 500)}`,
            timestamp: Date.now(),
            goalProgress: decision.goalProgress || 0,
          };
          steps.push(verifyStep);
          sendStep(verifyStep);
          workingMemory.push(`Screen verify: ${verifyResult.analysis.slice(0, 150)}`);
        }
      }

      // Phase: REFLECT — evaluate what happened (uses last result for single, summary for sequence)
      const reflectAction = isSequence
        ? `Sequence of ${sequenceResults.length} actions: ${sequenceResults.map(r => r.action).join(' → ')}`
        : (actionList[0]?.action || 'unknown');
      const reflectOutput = isSequence
        ? sequenceResults.map(r => `${r.action}: ${r.result.success ? 'OK' : 'FAIL'}`).join(', ')
        : (lastActionResult?.success
          ? (lastActionResult.stdout || lastActionResult.content || lastActionResult.output || JSON.stringify(lastActionResult).slice(0, 300))
          : (lastActionResult?.error || 'Unknown error'));
      const reflectSuccess = isSequence ? !sequenceFailed : lastActionResult?.success;

      const reflectMessages = [
        { role: 'system', content: 'You are reflecting on an action you just took. Be brief and analytical.' },
        {
          role: 'user',
          content: `Goal: ${goal}\nAction: ${reflectAction}\nResult: ${reflectSuccess ? 'SUCCESS' : 'FAILURE'}\nOutput: ${(typeof reflectOutput === 'string' ? reflectOutput : JSON.stringify(reflectOutput)).slice(0, 400)}\n\nIn 1-2 sentences: What did you learn? Are you closer to the goal? What should you do next?`,
        },
      ];

      try {
        const reflection = await llmGenerate(reflectMessages, { temperature: 0.3, maxTokens: 256 });
        const reflectStep = {
          type: 'reflect',
          content: reflection.slice(0, 300),
          timestamp: Date.now(),
          goalProgress: decision.goalProgress || 0,
        };
        steps.push(reflectStep);
        sendStep(reflectStep);
        workingMemory.push(`Reflection: ${reflection.slice(0, 100)}`);
      } catch (e) {
        // Reflection failure is non-fatal
        workingMemory.push(`Reflection skipped: ${e.message}`);
      }

      // Small yield to prevent UI freeze
      await new Promise(r => setTimeout(r, 100));
    }

    // Max iterations reached
    await storeVectorMemory({
      content: `Task "${goal.slice(0, 100)}" — INCOMPLETE after ${MAX_ITERATIONS} iterations.`,
      type: 'procedural',
      source: 'cognitive-loop',
      importance: 0.7,
      tags: ['task', 'incomplete'],
    });

    mainWindow?.webContents.send('agent:cognitiveComplete', {
      success: false,
      summary: `Reached maximum iterations (${MAX_ITERATIONS}) without completing the goal.`,
      iterations: MAX_ITERATIONS,
    });
  } catch (error) {
    mainWindow?.webContents.send('agent:cognitiveComplete', {
      success: false,
      summary: `Cognitive loop error: ${error.message}`,
      iterations: 0,
    });
  }
});

ipcMain.on('agent:killCognitive', () => {
  cognitiveKillFlag = true;
});

// ─── Save vector store on exit ─────────────────────────────────
app.on('before-quit', () => {
  saveJSON(vectorFile, vectorStore);
});

// ═══════════════════════════════════════════════════════════════
//  EVENT MONITORING — Proactive Behavior System (Tier 5)
//  Watch for system events and suggest actions autonomously.
// ═══════════════════════════════════════════════════════════════

let eventMonitorTimer = null;
let lastDiskCheckTime = 0;
let lastGoalCheckTime = 0;

async function checkProactiveEvents() {
  try {
    // Check disk space every 30 minutes
    if (Date.now() - lastDiskCheckTime > 1800000) {
      lastDiskCheckTime = Date.now();
      if (process.platform === 'win32') {
        exec('powershell -NoProfile -Command "Get-PSDrive C | Select-Object @{N=\'FreeGB\';E={[math]::Round($_.Free/1GB,1)}},@{N=\'UsedGB\';E={[math]::Round($_.Used/1GB,1)}} | ConvertTo-Json"',
          { timeout: 5000 }, (err, stdout) => {
            if (!err && stdout) {
              try {
                const info = JSON.parse(stdout);
                if (info.FreeGB < 5) {
                  mainWindow?.webContents.send('proactive:event', {
                    type: 'low_disk',
                    message: `Low disk space: ${info.FreeGB}GB free. Consider cleaning up temporary files.`,
                    severity: info.FreeGB < 2 ? 'high' : 'medium',
                    timestamp: Date.now(),
                  });
                }
              } catch {}
            }
          });
      }
    }

    // Check persistent goals progress every 5 minutes
    if (Date.now() - lastGoalCheckTime > 300000 && persistentGoals.goals.length > 0) {
      lastGoalCheckTime = Date.now();
      const activeGoals = persistentGoals.goals.filter(g => g.status === 'active');
      const staleGoals = activeGoals.filter(g => Date.now() - g.updatedAt > 86400000); // >24h without update
      if (staleGoals.length > 0) {
        mainWindow?.webContents.send('proactive:event', {
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
  eventMonitorTimer = setInterval(checkProactiveEvents, 60000); // Check every minute
  setTimeout(checkProactiveEvents, 10000); // First check after 10 seconds
}

// ═══════════════════════════════════════════════════════════════
//  AUTONOMOUS GOAL GENERATION (Tier 5)
//  Suggest goals based on system state and user patterns.
// ═══════════════════════════════════════════════════════════════

async function generateAutonomousGoals() {
  if (persistentGoals.goals.filter(g => g.status === 'active' && g.type === 'self-generated').length >= 3) return;

  try {
    const memStats = getVectorStats();
    const activeGoals = persistentGoals.goals.filter(g => g.status === 'active').map(g => g.description).join('; ');

    const prompt = [
      {
        role: 'system',
        content: `You are AGI PRIME's autonomous goal engine. Based on the system state, suggest 1-2 useful self-improvement goals. Goals should be actionable and benefit the user or improve the system.
Output a JSON array: [{ "description": "...", "priority": 1-10, "reasoning": "why this is useful" }]
Output ONLY the JSON array.`,
      },
      {
        role: 'user',
        content: `System state:
- Memory: ${memStats.total} memories (${memStats.byType.episodic} episodic, ${memStats.byType.semantic} semantic, ${memStats.byType.procedural} procedural)
- Custom tools: ${toolRegistry.tools.length} registered
- Active goals: ${activeGoals || 'none'}
- Platform: ${process.platform}
- Uptime: ${Math.round(process.uptime() / 60)} minutes

Suggest 1-2 autonomous improvement goals:`,
      },
    ];

    const response = await llmGenerate(prompt, { temperature: 0.6, maxTokens: 512 });
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      for (const suggestion of suggestions.slice(0, 2)) {
        if (suggestion.description && suggestion.description.length > 10) {
          const newGoal = {
            id: `goal_auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            description: suggestion.description,
            type: 'self-generated',
            status: 'active',
            priority: suggestion.priority || 3,
            subgoals: [],
            progress: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            evidence: [suggestion.reasoning || ''],
            checkpoints: [],
          };
          persistentGoals.goals.push(newGoal);
          console.log(`[Goals] Auto-generated: ${suggestion.description}`);
        }
      }
      saveJSON(goalsFile, persistentGoals);
    }
  } catch (e) {
    console.log('[Goals] Auto-generation failed:', e.message);
  }
}

// Start all systems when app is ready
app.whenReady().then(() => {
  startNightmind();
  startEventMonitor();
  // Auto-generate goals after 5 minutes of runtime
  setTimeout(generateAutonomousGoals, 300000);
  // Then every 30 minutes
  setInterval(generateAutonomousGoals, 1800000);
  console.log('[AGI PRIME] All systems initialized — Vision, Hands, Memory, Goals, Tools active');
});
