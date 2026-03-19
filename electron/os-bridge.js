'use strict';

const ORCH_BASE = process.env.AGIPRIME_ORCH_URL || 'http://127.0.0.1:11445';
const MEMORY_BASE = process.env.AGIPRIME_MEMORY_URL || 'http://127.0.0.1:11440';
const SPARK_BASE = process.env.AGIPRIME_SPARK_URL || 'http://127.0.0.1:11444';
const GATE_BASE = process.env.AGIPRIME_GATE_URL || 'http://127.0.0.1:11441';

function shouldUsePrimeOSBridge({ isAGIPrimeOS, env }) {
  if (env?.AGIPRIME_OS_MODE === '1') return true;
  if (env?.AGIPRIME_USE_DAEMONS === '1') return true;
  return !!isAGIPrimeOS;
}

async function requestJson(url, method = 'GET', body = null, timeoutMs = 120000) {
  const init = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body !== null) init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Bridge request failed ${res.status}: ${errText || res.statusText}`);
  }
  return await res.json();
}

async function routeChat(messages, config = {}) {
  return await requestJson(`${ORCH_BASE}/v1/chat`, 'POST', {
    messages: Array.isArray(messages) ? messages : [],
    provider: config.provider,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });
}

async function routeMemoryStore(entry) {
  const stored = await requestJson(`${MEMORY_BASE}/store`, 'POST', {
    content: entry?.content || '',
    metadata: {
      source: entry?.source || 'electron',
      type: entry?.type || 'episodic',
      importance: entry?.importance ?? 0.5,
      emotion: entry?.emotion || null,
      tags: Array.isArray(entry?.tags) ? entry.tags : [],
      layer: entry?.layer || 'working',
    },
  });
  return {
    id: stored.id,
    content: stored.content,
    type: stored.metadata?.type || 'episodic',
    timestamp: stored.timestamp,
    importance: stored.metadata?.importance ?? 0.5,
    source: stored.metadata?.source || 'electron',
    emotion: stored.metadata?.emotion || null,
    tags: Array.isArray(stored.metadata?.tags) ? stored.metadata.tags : [],
    layer: stored.metadata?.layer || 'working',
  };
}

async function routeMemorySearch(query, topK = 5) {
  const result = await requestJson(`${MEMORY_BASE}/search`, 'POST', { query, limit: topK });
  return (Array.isArray(result) ? result : []).map((item) => ({
    memory: {
      id: item.id,
      content: item.content,
      type: item.metadata?.type || 'episodic',
      timestamp: item.timestamp,
      importance: item.metadata?.importance ?? 0.5,
      source: item.metadata?.source || 'memory-daemon',
      emotion: item.metadata?.emotion || null,
      tags: Array.isArray(item.metadata?.tags) ? item.metadata.tags : [],
      layer: item.metadata?.layer || 'working',
      accessCount: item.accessCount || 0,
    },
    similarity: typeof item.score === 'number' ? item.score : 0.5,
  }));
}

async function routeMemoryStats() {
  const stats = await requestJson(`${MEMORY_BASE}/stats`, 'GET');
  return {
    total: stats.total || 0,
    byType: {
      episodic: 0,
      semantic: 0,
      procedural: 0,
      reflective: 0,
      autobiographical: 0,
    },
    byLayer: stats.layers || {},
  };
}

async function routeMemoryList(options = {}) {
  const all = await requestJson(`${MEMORY_BASE}/all`, 'GET');
  const items = Array.isArray(all?.memories) ? all.memories : [];
  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Math.max(1, Math.min(1000, Number(options.limit) || 200));
  const paged = items.slice(offset, offset + limit).map((item) => ({
    id: item.id,
    content: item.content,
    type: item.metadata?.type || 'episodic',
    timestamp: item.timestamp,
    importance: item.metadata?.importance ?? 0.5,
    source: item.metadata?.source || 'memory-daemon',
    emotion: item.metadata?.emotion || null,
    tags: Array.isArray(item.metadata?.tags) ? item.metadata.tags : [],
    layer: item.metadata?.layer || 'working',
    accessCount: item.accessCount || 0,
  }));
  return { total: items.length, memories: paged };
}

async function routeMemorySnapshot(maxItems = 5) {
  const all = await requestJson(`${MEMORY_BASE}/all`, 'GET');
  const items = Array.isArray(all?.memories) ? all.memories : [];
  const capped = Math.max(1, Math.min(12, Number(maxItems) || 5));
  return {
    facts: items.slice(-capped),
    conversations: [],
    soul: {},
    consciousness: { insights: [] },
    counts: {
      facts: items.length,
      conversations: 0,
      insights: 0,
    },
  };
}

async function routeSparkReason(input) {
  return await requestJson(`${SPARK_BASE}/reason`, 'POST', { input });
}

async function routeGateEvaluate(action, gate = 'exec') {
  return await requestJson(`${GATE_BASE}/evaluate`, 'POST', { action, gate });
}

module.exports = {
  shouldUsePrimeOSBridge,
  routeChat,
  routeMemoryStore,
  routeMemorySearch,
  routeMemoryStats,
  routeMemoryList,
  routeMemorySnapshot,
  routeSparkReason,
  routeGateEvaluate,
};
