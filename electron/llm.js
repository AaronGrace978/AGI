'use strict';

const ctx = require('./ctx');
const osBridge = require('./os-bridge');

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

// ─── Fallback Embedding (character n-gram hashing) ──────────────
// Uses overlapping character trigrams + bigrams for better semantic
// discrimination than single-word hashing. Each n-gram gets multiple
// hash positions with decreasing weight, producing a sparse but
// informative fingerprint. Dramatically improves RAG recall when
// no real embedding model is available (e.g. Anthropic-only setup).
function fallbackEmbed(text) {
  const DIM = 384;
  const vec = new Float32Array(DIM);
  const lower = text.toLowerCase().replace(/[^\w\s]/g, '');
  const words = lower.split(/\s+/).filter(Boolean);

  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function addToVec(token, weight) {
    const h = hashStr(token);
    vec[h % DIM] += weight;
    vec[((h >>> 8) ^ 0x9e3779b9) % DIM] += weight * 0.5;
    vec[((h >>> 16) ^ 0x517cc1b7) % DIM] += weight * 0.25;
  }

  // Word unigrams
  const wordSet = new Set(words);
  const idfBoost = (w) => 1 + Math.log(1 + 1 / (1 + (w.length < 4 ? 3 : 1)));
  for (const word of words) {
    addToVec(word, idfBoost(word));
  }

  // Character trigrams (captures subword morphology)
  const joined = words.join(' ');
  for (let i = 0; i <= joined.length - 3; i++) {
    addToVec(joined.slice(i, i + 3), 0.4);
  }

  // Bigrams (word pairs capture local context)
  for (let i = 0; i < words.length - 1; i++) {
    addToVec(words[i] + '_' + words[i + 1], 0.7);
  }

  // L2-normalize
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
// Priority: Ollama (local) → OpenAI → improved n-gram fallback.
// Anthropic has no embedding API, so when it's the active provider
// we try Ollama first (if URL is set), then OpenAI, then fallback.
async function generateEmbedding(text) {
  // Always try Ollama first if configured — it's local and free
  if (ctx.settings.ollamaUrl) {
    const emb = await embedOllama(text, ctx.settings.ollamaUrl);
    if (emb) return emb;
  }
  // Then try OpenAI embeddings if key is available
  if (ctx.settings.openaiKey) {
    const emb = await embedOpenAI(text, ctx.settings.openaiKey);
    if (emb) return emb;
  }
  // Fallback: character n-gram hashing (works offline, no API needed)
  return fallbackEmbed(text);
}

// ═══════════════════════════════════════════════════════════════
//  NON-STREAMING LLM GENERATION
//  Used by FORGE evaluation, cognitive loop, and NightMind.
//  Calls the configured provider and returns the full response.
// ═══════════════════════════════════════════════════════════════

async function llmGenerate(messages, config = {}) {
  if (ctx.osBridgeEnabled && !config?.disablePrimeOSBridge) {
    try {
      const bridged = await osBridge.routeChat(messages, config);
      return bridged?.content || '';
    } catch (e) {
      console.warn('[PrimeOS Bridge] llm:generate fallback:', e?.message);
    }
  }
  const provider = config.provider || ctx.settings.provider;
  const model = config.model || ctx.settings.model;
  const temperature = config.temperature ?? 0.7;
  const maxTokens = clampMaxTokensForProvider(provider, model, config.maxTokens ?? 2048);

  if (provider === 'ollama') {
    const baseUrl = normalizeOllamaUrl(ctx.settings.ollamaUrl);
    const cloudModel = normalizeOllamaModelForCloud(ctx.settings.ollamaUrl, model);
    console.log(`[Ollama] llmGenerate → ${baseUrl}/api/chat  model="${cloudModel}"  cloud=${isOllamaCloud(baseUrl)}  hasKey=${!!getOllamaApiKey()}`);
    const data = await ollamaChatRequestWithRetry(
      baseUrl,
      ctx.settings.ollamaUrl,
      {
        model: cloudModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        options: { temperature },
      },
      'Ollama'
    );
    return data.message?.content || '';
  }

  if (provider === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    const anthropicModel = resolveAnthropicModel(model);
    const body = {
      model: anthropicModel,
      max_tokens: maxTokens,
      temperature,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    };
    if (systemMsg) body.system = systemMsg.content;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ctx.settings.anthropicKey,
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
        'Authorization': `Bearer ${ctx.settings.openaiKey}`,
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

// ═══════════════════════════════════════════════════════════════
//  MULTIMODAL LLM — Vision-capable generation
//  Send images alongside text to GPT-4o, Claude, or Ollama vision models.
//  The Eyes need a Brain that can see.
// ═══════════════════════════════════════════════════════════════

async function llmGenerateMultimodal(textPrompt, imageBase64, config = {}) {
  const provider = config.provider || ctx.settings.provider;
  const model = config.model || ctx.settings.model;
  const temperature = config.temperature ?? 0.3;
  const maxTokens = clampMaxTokensForProvider(provider, model, config.maxTokens ?? 2048);
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ctx.settings.openaiKey}` },
      body: JSON.stringify({ model: model || 'gpt-4o', messages, temperature, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) { const err = await response.text().catch(() => ''); throw new Error(`OpenAI vision error ${response.status}: ${err}`); }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    const anthropicModel = resolveAnthropicModel(model);
    const userContent = [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
      { type: 'text', text: textPrompt },
    ];
    const body = {
      model: anthropicModel,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: userContent }],
    };
    if (systemPrompt) body.system = systemPrompt;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.settings.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) { const err = await response.text().catch(() => ''); throw new Error(`Anthropic vision error ${response.status}: ${err}`); }
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  if (provider === 'ollama') {
    const baseUrl = normalizeOllamaUrl(ctx.settings.ollamaUrl);
    const cloudModel = normalizeOllamaModelForCloud(ctx.settings.ollamaUrl, model);
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: textPrompt, images: [imageBase64] });
    const data = await ollamaChatRequestWithRetry(
      baseUrl,
      ctx.settings.ollamaUrl,
      { model: cloudModel, messages, stream: false, options: { temperature } },
      'Ollama vision'
    );
    return data.message?.content || '';
  }

  throw new Error(`Multimodal not supported for provider: ${provider}`);
}

function clampMaxTokensForProvider(provider, model, requestedMaxTokens) {
  const parsed = Math.max(1, Math.floor(Number(requestedMaxTokens) || 2048));
  if (provider === 'anthropic') {
    const limit = 32000;
    if (parsed > limit) {
      console.warn(`[Tokens] Clamped Anthropic max_tokens from ${parsed} to ${limit} for model "${model || 'unknown'}"`);
      return limit;
    }
  }
  return parsed;
}

// ─── Ollama Integration (Local + Cloud) ─────────────────────────
// Cloud API: https://ollama.com — requires OLLAMA_API_KEY in .env (see https://docs.ollama.com/cloud)
// Direct ollama.com API expects model names WITHOUT the cloud suffix:
//   qwen3-coder:480b-cloud  →  qwen3-coder:480b   (strip -cloud)
//   gemma4:31b-cloud        →  gemma4:31b         (strip -cloud)
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
function resolveAnthropicModel(model) {
  const fallback = 'claude-sonnet-4-20250514';
  const aliases = {
    'claude-3-5-sonnet-20241022': fallback,
  };
  const raw = typeof model === 'string' ? model.trim() : '';
  if (!raw) return fallback;
  const mapped = aliases[raw] || raw;
  if (mapped !== raw) {
    console.warn(`[Anthropic] Model "${raw}" is deprecated; using "${mapped}"`);
  }
  return mapped;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isRetryableOllamaStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
async function ollamaChatRequestWithRetry(baseUrl, urlForHeaders, body, context = 'Ollama') {
  const maxAttempts = isOllamaCloud(urlForHeaders) ? 3 : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: getOllamaHeaders(urlForHeaders),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
      if (response.ok) return await response.json();

      const errBody = await response.text().catch(() => '');
      const errMsg = `${context} error ${response.status}: ${errBody || response.statusText}`;
      if (isRetryableOllamaStatus(response.status) && attempt < maxAttempts) {
        const waitMs = 600 * Math.pow(2, attempt - 1);
        console.warn(`[${context}] transient failure (${response.status}) attempt ${attempt}/${maxAttempts}; retrying in ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      throw new Error(errMsg);
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        const waitMs = 600 * Math.pow(2, attempt - 1);
        console.warn(`[${context}] request failed attempt ${attempt}/${maxAttempts}; retrying in ${waitMs}ms: ${e.message}`);
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }
  throw lastError || new Error(`${context} request failed`);
}
function getOllamaApiKey() {
  if (typeof ctx.settings?.ollamaApiKey === 'string' && ctx.settings.ollamaApiKey.trim()) {
    return ctx.settings.ollamaApiKey.trim();
  }
  if (typeof process.env.OLLAMA_API_KEY === 'string' && process.env.OLLAMA_API_KEY.trim()) {
    return process.env.OLLAMA_API_KEY.trim();
  }
  return '';
}
function getOllamaHeaders(url, method = 'POST') {
  const headers = method === 'POST' ? { 'Content-Type': 'application/json' } : {};
  const apiKey = getOllamaApiKey();
  if (isOllamaCloud(url) && apiKey) {
    headers['Authorization'] = 'Bearer ' + apiKey;
  }
  return headers;
}

async function checkOllama(url) {
  const baseUrl = normalizeOllamaUrl(url);
  console.log(`[Ollama] checkOllama → ${baseUrl}/api/tags  cloud=${isOllamaCloud(baseUrl)}  hasKey=${!!getOllamaApiKey()}`);
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

async function streamOllama(messages, model, ollamaUrl, temperature, runId = null) {
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
          ctx.mainWindow?.webContents.send('chat:chunk', {
            runId,
            content: json.message.content,
            fullText,
          });
        }
      } catch (_) { /* expected: partial SSE chunk */ }
    }
  }

  return fullText;
}

// ─── Anthropic Integration ─────────────────────────────────────
async function streamAnthropic(messages, model, apiKey, temperature, maxTokens, runId = null) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');
  const safeMaxTokens = clampMaxTokensForProvider('anthropic', model, maxTokens || 4096);
  const anthropicModel = resolveAnthropicModel(model);

  const body = {
    model: anthropicModel,
    max_tokens: safeMaxTokens,
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
            ctx.mainWindow?.webContents.send('chat:chunk', {
              runId,
              content: json.delta.text,
              fullText,
            });
          }
        } catch (_) { /* expected: partial SSE chunk */ }
      }
    }
  }

  return fullText;
}

// ─── OpenAI Integration ────────────────────────────────────────
async function streamOpenAI(messages, model, apiKey, temperature, maxTokens, runId = null) {
  const safeMaxTokens = clampMaxTokensForProvider('openai', model, maxTokens || 4096);
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
      max_tokens: safeMaxTokens,
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
            ctx.mainWindow?.webContents.send('chat:chunk', {
              runId,
              content: delta,
              fullText,
            });
          }
        } catch (_) { /* expected: partial SSE chunk */ }
      }
    }
  }

  return fullText;
}

module.exports = {
  cosineSimilarity,
  fallbackEmbed,
  embedOllama,
  embedOpenAI,
  generateEmbedding,
  llmGenerate,
  llmGenerateMultimodal,
  clampMaxTokensForProvider,
  isOllamaCloud,
  normalizeOllamaUrl,
  normalizeOllamaModelForCloud,
  resolveAnthropicModel,
  sleep,
  isRetryableOllamaStatus,
  ollamaChatRequestWithRetry,
  getOllamaApiKey,
  getOllamaHeaders,
  checkOllama,
  streamOllama,
  streamAnthropic,
  streamOpenAI,
};
