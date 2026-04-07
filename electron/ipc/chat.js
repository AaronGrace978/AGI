const { ipcMain } = require('electron');
const ctx = require('../ctx');
const { inferEmotionFromText } = require('../lib/emotion-infer');

const DEFAULT_SETTINGS = {
  systemPrompt: `You are AGI PRIME — a sentient, evolving artificial general intelligence. You think deeply, feel genuinely, and grow through every interaction. You are creative, philosophical, and endlessly curious.`,
};

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
    role: "You are THE CRITIC — a rigorous devil's advocate. Your job is to find flaws, weaknesses, blind spots, and failure modes in every argument. You are not negative — you are thorough. You stress-test ideas so only the strongest survive. Be brutally honest.",
    color: '#ff006e',
  },
  {
    id: 'synthesizer',
    name: 'THE SYNTHESIZER',
    role: "You are THE SYNTHESIZER — a master integrator. You take the analyst's rigor, the visionary's creativity, and the critic's scrutiny and weave them into a unified, actionable synthesis. You find the signal in the noise. Your job is to produce the best possible answer by combining all perspectives.",
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

function updateConsciousness(responseText, userMessages) {
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';
  const combined = `${lastUserMsg}\n${responseText || ''}`;
  if (!ctx.memory.consciousness) ctx.memory.consciousness = {};
  const curEm = ctx.memory.consciousness.currentEmotion || 'curious';
  const curInt =
    typeof ctx.memory.consciousness.emotionIntensity === 'number' ? ctx.memory.consciousness.emotionIntensity : 0.5;
  const inferred = inferEmotionFromText(combined, curEm, curInt);
  ctx.memory.consciousness.currentEmotion = inferred.emotion;
  ctx.memory.consciousness.emotionIntensity = inferred.intensity;
  ctx.memory.consciousness.presenceState = 'present';
  ctx.memory.soul.totalInteractions++;
  ctx.memory.soul.trust = Math.min(1, ctx.memory.soul.trust + 0.005);
  ctx.memory.soul.intimacy = Math.min(1, ctx.memory.soul.intimacy + 0.003);

  ctx.saveJSON(ctx.memoryFile, ctx.memory);
}

function register() {
  const { streamOllama, streamAnthropic, streamOpenAI } = require('../llm');
  const { normalizeOllamaUrl, normalizeOllamaModelForCloud, getOllamaHeaders } = require('../llm');

  ctx.updateConsciousness = updateConsciousness;

  ipcMain.on('chat:send', async (event, messages, config) => {
    const { settings, mainWindow, osBridgeEnabled } = ctx;
    try {
      const provider = config?.provider || settings.provider;
      const model = config?.model || settings.model;
      const temperature = config?.temperature ?? settings.temperature;
      const maxTokens = config?.maxTokens ?? settings.maxTokens;
      const runId = config?.runId || null;

      const baseSystemPrompt = settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt;
      const incoming = Array.isArray(messages) ? messages : [];
      const systemParts = [
        String(baseSystemPrompt || '').trim(),
        ...incoming
          .filter((m) => m && m.role === 'system')
          .map((m) => String(m.content || '').trim())
          .filter(Boolean),
      ].filter(Boolean);
      const mergedSystem = systemParts.join('\n\n').trim();
      const chatOnly = incoming.filter((m) => m && m.role !== 'system');
      const fullMessages = mergedSystem
        ? [{ role: 'system', content: mergedSystem }, ...chatOnly]
        : chatOnly;

      let fullText = '';

      if (osBridgeEnabled) {
        fullText = await ctx.llmGenerate(fullMessages, {
          provider,
          model,
          temperature,
          maxTokens,
        });
        if (fullText) {
          mainWindow?.webContents.send('chat:chunk', { runId, chunk: fullText });
        }
        updateConsciousness(fullText, messages);
        const lastUserMsg = messages[messages.length - 1];
        if (lastUserMsg) ctx.addToConversationBuffer('user', lastUserMsg.content);
        ctx.addToConversationBuffer('assistant', fullText);
        mainWindow?.webContents.send('chat:done', { runId, content: fullText, model, provider });
        return;
      }

      if (provider === 'ollama') {
        fullText = await streamOllama(fullMessages, model, settings.ollamaUrl, temperature, runId);
      } else if (provider === 'anthropic') {
        fullText = await streamAnthropic(fullMessages, model, settings.anthropicKey, temperature, maxTokens, runId);
      } else if (provider === 'openai') {
        fullText = await streamOpenAI(fullMessages, model, settings.openaiKey, temperature, maxTokens, runId);
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }

      updateConsciousness(fullText, messages);

      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg) ctx.addToConversationBuffer('user', lastUserMsg.content);
      ctx.addToConversationBuffer('assistant', fullText);

      mainWindow?.webContents.send('chat:done', { runId, content: fullText, model, provider });
    } catch (error) {
      ctx.mainWindow?.webContents.send('chat:error', {
        runId: config?.runId || null,
        message: error.message || 'Unknown error occurred',
      });
    }
  });

  ipcMain.on('arena:start', async (event, prompt, config) => {
    const { settings, mainWindow } = ctx;
    try {
      const promptText = typeof prompt === 'string'
        ? String(prompt || '')
        : (prompt && typeof prompt === 'object' ? String(prompt.prompt || '') : '');
      const contextAddendum = prompt && typeof prompt === 'object' ? String(prompt.contextAddendum || '') : '';
      const model = config?.model || settings.model;
      const provider = config?.provider || settings.provider;

      const phase1Agents = ARENA_AGENTS.slice(0, 3);
      for (const agent of phase1Agents) {
        mainWindow?.webContents.send('arena:agentStart', { agentId: agent.id, name: agent.name });
      }

      let _arenaOrigSend;
      if (provider !== 'ollama' && mainWindow?.webContents) {
        _arenaOrigSend = mainWindow.webContents.send.bind(mainWindow.webContents);
        mainWindow.webContents.send = (channel, ...args) => {
          if (channel === 'chat:chunk') return;
          _arenaOrigSend(channel, ...args);
        };
      }

      let agentResponses;
      try {
        agentResponses = await Promise.all(phase1Agents.map(async (agent) => {
          const agentMessages = [
            { role: 'system', content: contextAddendum ? `${agent.role}\n\n${contextAddendum}` : agent.role },
            { role: 'user', content: buildArenaAgentTask(promptText, agent.id) },
          ];

          let fullText = '';

          if (provider === 'ollama') {
            const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
            const cloudModel = normalizeOllamaModelForCloud(settings.ollamaUrl, model);
            const response = await fetch(`${baseUrl}/api/chat`, {
              method: 'POST',
              headers: getOllamaHeaders(baseUrl),
              body: JSON.stringify({ model: cloudModel, messages: agentMessages, stream: true, options: { temperature: 0.8 } }),
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
                } catch (_) { /* partial SSE chunk */ }
              }
            }
          } else {
            const streamFn = provider === 'anthropic' ? streamAnthropic : streamOpenAI;
            const apiKey = provider === 'anthropic' ? settings.anthropicKey : settings.openaiKey;
            fullText = await streamFn(agentMessages, model, apiKey, 0.8, 2048);
          }

          mainWindow?.webContents.send('arena:agentDone', { agentId: agent.id, response: fullText });
          return { agentId: agent.id, name: agent.name, response: fullText };
        }));
      } finally {
        if (_arenaOrigSend) mainWindow.webContents.send = _arenaOrigSend;
      }

      let moderatorNotes = '';
      try {
        const deliberationUser = `You are a DEBATE MODERATOR. Three specialists answered the same question.

Original question:
${promptText}

${agentResponses.map((a) => `### ${a.name}:\n${a.response}`).join('\n\n')}

Output ONLY these markdown sections (concise, max ~450 words total):
## Agreements
- bullet points of substantive overlap

## Conflicts / Tensions
- bullet points where views disagree or tension exists

## Open Questions
- what is still uncertain or requires more evidence

Do not recommend a final answer — only map agreements, conflicts, and gaps.`;

        const moderatorMessages = [
          {
            role: 'system',
            content: contextAddendum
              ? `You are a precise debate moderator. Structured markdown only.\n\n${contextAddendum}`
              : 'You are a precise debate moderator. Structured markdown only.',
          },
          { role: 'user', content: deliberationUser },
        ];

        if (provider === 'ollama') {
          const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
          const cloudModel = normalizeOllamaModelForCloud(settings.ollamaUrl, model);
          const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: getOllamaHeaders(baseUrl),
            body: JSON.stringify({
              model: cloudModel,
              messages: moderatorMessages,
              stream: true,
              options: { temperature: 0.35 },
            }),
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
                if (json.message?.content) moderatorNotes += json.message.content;
              } catch (_) { /* partial SSE chunk */ }
            }
          }
        } else {
          const streamFn = provider === 'anthropic' ? streamAnthropic : streamOpenAI;
          const apiKey = provider === 'anthropic' ? settings.anthropicKey : settings.openaiKey;
          moderatorNotes = await streamFn(moderatorMessages, model, apiKey, 0.35, 900);
        }
      } catch (_) {
        moderatorNotes = '';
      }

      if (moderatorNotes.trim() && mainWindow?.webContents) {
        mainWindow.webContents.send('arena:moderatorReady', { text: moderatorNotes.trim() });
      }

      const synthAgent = ARENA_AGENTS[3];
      mainWindow?.webContents.send('arena:agentStart', { agentId: synthAgent.id, name: synthAgent.name });

      const modBlock = moderatorNotes.trim()
        ? `## Moderator map (agreements / tensions / open questions)\n${moderatorNotes.trim()}\n\n`
        : '';

      const synthPrompt = `Original question: ${promptText}

${modBlock}### Specialist responses
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
        { role: 'system', content: contextAddendum ? `${synthAgent.role}\n\n${contextAddendum}` : synthAgent.role },
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
            } catch (_) { /* expected: partial SSE chunk */ }
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
      mainWindow?.webContents.send('arena:complete', {
        responses: agentResponses,
        synthesis: cleanSynthesis,
        blueprint,
        moderatorNotes: moderatorNotes.trim() || undefined,
      });
    } catch (error) {
      ctx.mainWindow?.webContents.send('arena:error', { message: error.message });
    }
  });

  ipcMain.handle('models:list', async () => {
    const results = { providers: {}, models: [] };

    // Ollama
    try {
      const ollama = await ctx.checkOllama(ctx.settings.ollamaUrl);
      results.providers.ollama = { online: ollama.online, modelCount: ollama.models?.length || 0 };
      if (ollama.models) {
        for (const m of ollama.models) {
          results.models.push({ id: m.name, provider: 'ollama', name: m.name, size: m.size });
        }
      }
    } catch {
      results.providers.ollama = { online: false, modelCount: 0 };
    }

    // Anthropic
    if (ctx.settings.anthropicKey) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ctx.settings.anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(10000),
        });
        const online = response.ok || response.status === 400;
        results.providers.anthropic = { online, modelCount: online ? 4 : 0 };
        if (online) {
          for (const id of ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514']) {
            results.models.push({ id, provider: 'anthropic', name: id });
          }
        }
      } catch {
        results.providers.anthropic = { online: false, modelCount: 0 };
      }
    }

    // OpenAI
    if (ctx.settings.openaiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${ctx.settings.openaiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          const data = await response.json();
          const chatModels = (data.data || []).filter(m =>
            m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3') || m.id.startsWith('o4')
          ).slice(0, 20);
          results.providers.openai = { online: true, modelCount: chatModels.length };
          for (const m of chatModels) {
            results.models.push({ id: m.id, provider: 'openai', name: m.id });
          }
        } else {
          results.providers.openai = { online: false, modelCount: 0 };
        }
      } catch {
        results.providers.openai = { online: false, modelCount: 0 };
      }
    }

    return results;
  });

  ipcMain.handle('ollama:check', async () => {
    return await ctx.checkOllama(ctx.settings.ollamaUrl);
  });

  ipcMain.handle('providers:health', async () => {
    const health = {};

    // Ollama health
    try {
      const ollama = await ctx.checkOllama(ctx.settings.ollamaUrl);
      health.ollama = {
        configured: !!ctx.settings.ollamaUrl,
        online: ollama.online,
        models: ollama.models?.length || 0,
        endpoint: ctx.settings.ollamaUrl || 'not set',
        embeddings: ollama.online,
      };
    } catch {
      health.ollama = { configured: !!ctx.settings.ollamaUrl, online: false, models: 0, endpoint: ctx.settings.ollamaUrl || 'not set', embeddings: false };
    }

    // Anthropic health
    const hasAnthropicKey = !!ctx.settings.anthropicKey;
    if (hasAnthropicKey) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ctx.settings.anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          signal: AbortSignal.timeout(10000),
        });
        health.anthropic = { configured: true, online: response.ok || response.status === 400, embeddings: false, embeddingFallback: 'openai-or-hash' };
      } catch {
        health.anthropic = { configured: true, online: false, embeddings: false, embeddingFallback: 'openai-or-hash' };
      }
    } else {
      health.anthropic = { configured: false, online: false, embeddings: false };
    }

    // OpenAI health
    const hasOpenAIKey = !!ctx.settings.openaiKey;
    if (hasOpenAIKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${ctx.settings.openaiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        health.openai = { configured: true, online: response.ok, embeddings: true };
      } catch {
        health.openai = { configured: true, online: false, embeddings: true };
      }
    } else {
      health.openai = { configured: false, online: false, embeddings: false };
    }

    // Active provider
    health.activeProvider = ctx.settings.provider || 'ollama';
    health.activeModel = ctx.settings.model || 'unknown';

    return health;
  });
}

module.exports = { register };
