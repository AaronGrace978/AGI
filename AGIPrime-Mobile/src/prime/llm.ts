import { Settings } from '../types';
import { env } from '../config/env';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function resolveProviderModel(provider: Settings['provider'], rawModel: string): string {
  const model = (rawModel || '').trim();
  if (!model) {
    if (provider === 'ollama') return env.OLLAMA_MODEL || 'qwen3-coder:480b-cloud';
    if (provider === 'anthropic') return 'claude-sonnet-4-20250514';
    return 'gpt-4o-mini';
  }

  if (provider === 'openai') {
    const openaiLike = /^(gpt|o1|o3|o4|chatgpt)/i.test(model);
    return openaiLike ? model : 'gpt-4o-mini';
  }

  if (provider === 'anthropic') {
    return /^claude/i.test(model) ? model : 'claude-sonnet-4-20250514';
  }

  // ollama
  const definitelyNonOllama = /^(gpt|o1|o3|o4|chatgpt|claude)/i.test(model);
  return definitelyNonOllama ? (env.OLLAMA_MODEL || 'qwen3-coder:480b-cloud') : model;
}

function isOllamaCloud(url: string): boolean {
  return url?.toLowerCase().includes('ollama.com') ?? false;
}

function looksLikeLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h === '::1') return true;
  if (h.endsWith('.local')) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  // Bare hostnames are usually local network machines.
  if (!h.includes('.')) return true;
  return false;
}

function getOllamaBaseUrl(url: string): string {
  const trimmed = (url || '').replace(/\/+$/, '').trim();
  if (!trimmed) return 'https://ollama.com';

  if (/^https?:\/\//i.test(trimmed)) {
    return isOllamaCloud(trimmed) ? 'https://ollama.com' : trimmed;
  }

  const hostPart = trimmed.split('/')[0] || '';
  const host = hostPart.split(':')[0] || hostPart;
  const scheme = looksLikeLocalHost(host) ? 'http' : 'https';
  const normalized = `${scheme}://${trimmed}`;
  if (isOllamaCloud(normalized)) return 'https://ollama.com';
  return normalized;
}

function normalizeModelForCloud(url: string, model: string): string {
  if (!model) return model;
  if (isOllamaCloud(url)) return model.replace(/[-:]cloud$/i, '');
  return model;
}

function getOllamaHeaders(url: string, ollamaApiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = ollamaApiKey?.trim() || env.OLLAMA_API_KEY;
  if (isOllamaCloud(url) && key) {
    headers['Authorization'] = 'Bearer ' + key;
  }
  return headers;
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

export async function callLLM(
  settings: Settings,
  messages: LLMMessage[],
): Promise<string> {
  const { provider } = settings;

  if (provider === 'anthropic') return callAnthropic(settings, messages);
  if (provider === 'openai') return callOpenAI(settings, messages);
  return callOllama(settings, messages);
}

export async function streamLLM(
  settings: Settings,
  messages: LLMMessage[],
  onChunk: (chunk: string) => void,
): Promise<void> {
  const { provider } = settings;

  if (provider === 'anthropic') return streamAnthropic(settings, messages, onChunk);
  if (provider === 'openai') return streamOpenAI(settings, messages, onChunk);
  return streamOllama(settings, messages, onChunk);
}

async function callAnthropic(settings: Settings, messages: LLMMessage[]): Promise<string> {
  const model = resolveProviderModel('anthropic', settings.model);
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs = messages.filter(m => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: settings.maxTokens || 4096,
      temperature: settings.temperature ?? 0.7,
      system: systemMsg?.content || '',
      messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function streamAnthropic(
  settings: Settings,
  messages: LLMMessage[],
  onChunk: (chunk: string) => void,
): Promise<void> {
  const model = resolveProviderModel('anthropic', settings.model);
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs = messages.filter(m => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: settings.maxTokens || 4096,
      temperature: settings.temperature ?? 0.7,
      stream: true,
      system: systemMsg?.content || '',
      messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const full = await callAnthropic(settings, messages);
    if (full) onChunk(full);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            onChunk(parsed.delta.text);
          }
        } catch {}
      }
    }
  }
}

async function callOpenAI(settings: Settings, messages: LLMMessage[]): Promise<string> {
  const model = resolveProviderModel('openai', settings.model);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.maxTokens || 4096,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function streamOpenAI(
  settings: Settings,
  messages: LLMMessage[],
  onChunk: (chunk: string) => void,
): Promise<void> {
  const model = resolveProviderModel('openai', settings.model);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.maxTokens || 4096,
      stream: true,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const full = await callOpenAI(settings, messages);
    if (full) onChunk(full);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) onChunk(chunk);
        } catch {}
      }
    }
  }
}

async function callOllama(settings: Settings, messages: LLMMessage[]): Promise<string> {
  const baseUrl = getOllamaBaseUrl(settings.ollamaUrl);
  const model = normalizeModelForCloud(baseUrl, resolveProviderModel('ollama', settings.model));

  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    throw new Error('On mobile, localhost won\'t work. Use https://ollama.com (Cloud) in Settings → Ollama URL.');
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: getOllamaHeaders(baseUrl, settings.ollamaApiKey),
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        options: { temperature: settings.temperature ?? 0.7 },
      }),
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes('abort') || msg.includes('timeout')) {
      throw new Error('Ollama request timed out. Try a smaller model or check your connection.');
    }
    if (msg.includes('Network request failed') || msg.includes('Failed to fetch')) {
      throw new Error('Network request failed. For Cloud use https://ollama.com + API key. For local use http://<PC-LAN-IP>:11434 on same Wi-Fi.');
    }
    throw e;
  }

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error('Ollama API key invalid or missing. Check Settings → Ollama API Key.');
    }
    throw new Error(`Ollama error ${res.status}: ${err || res.statusText}`);
  }
  const data = await res.json();
  return data.message?.content || '';
}

async function streamOllama(
  settings: Settings,
  messages: LLMMessage[],
  onChunk: (chunk: string) => void,
): Promise<void> {
  const baseUrl = getOllamaBaseUrl(settings.ollamaUrl);
  const model = normalizeModelForCloud(baseUrl, resolveProviderModel('ollama', settings.model));

  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    throw new Error('On mobile, localhost won\'t work. Use https://ollama.com (Cloud) in Settings → Ollama URL.');
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: getOllamaHeaders(baseUrl, settings.ollamaApiKey),
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        options: { temperature: settings.temperature ?? 0.7 },
      }),
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes('abort') || msg.includes('timeout')) {
      throw new Error('Ollama request timed out. Try a smaller model or check your connection.');
    }
    if (msg.includes('Network request failed') || msg.includes('Failed to fetch')) {
      throw new Error('Network request failed. For Cloud use https://ollama.com + API key. For local use http://<PC-LAN-IP>:11434 on same Wi-Fi.');
    }
    throw e;
  }

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error('Ollama API key invalid or missing. Check Settings → Ollama API Key.');
    }
    throw new Error(`Ollama error ${res.status}: ${err || res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const full = await callOllama(settings, messages);
    if (full) onChunk(full);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) onChunk(parsed.message.content);
        } catch {}
      }
    }
  }
}
