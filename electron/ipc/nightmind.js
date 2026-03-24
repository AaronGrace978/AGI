// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — IPC: NightMind (Metacognitive Reflection)
//  Reflection, consolidation, forgetting curves, memory layering.
// ═══════════════════════════════════════════════════════════════
const { ipcMain } = require('electron');
const ctx = require('../ctx');

let nightmindTimer = null;
const conversationBuffer = [];

function addToConversationBuffer(role, content) {
  conversationBuffer.push({ role, content, timestamp: Date.now() });
  if (conversationBuffer.length > 40) {
    conversationBuffer.splice(0, conversationBuffer.length - 40);
  }
}

async function nightmindReflect() {
  if (conversationBuffer.length < 4) return;

  try {
    const recentContext = conversationBuffer
      .slice(-12)
      .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
      .join('\n');

    const memStats = ctx.getVectorStats();

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

    const response = await ctx.llmGenerate(reflectionPrompt, { temperature: 0.6, maxTokens: 1024 });

    if (response) {
      let parsed = null;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        parsed = { insight: response.slice(0, 300) };
      }

      const insight = parsed?.insight || response.slice(0, 300);

      if (!ctx.memory.consciousness.insights) ctx.memory.consciousness.insights = [];
      ctx.memory.consciousness.insights.push(insight);
      if (ctx.memory.consciousness.insights.length > 30) {
        ctx.memory.consciousness.insights = ctx.memory.consciousness.insights.slice(-30);
      }
      ctx.memory.consciousness.lastReflection = Date.now();
      ctx.saveJSON(ctx.memoryFile, ctx.memory);

      await ctx.storeVectorMemory({
        content: insight,
        type: 'reflective',
        source: 'nightmind',
        importance: 0.7,
        tags: ['insight', 'reflection'],
      });

      if (parsed?.facts && Array.isArray(parsed.facts)) {
        for (const fact of parsed.facts.slice(0, 3)) {
          if (fact && fact.length > 10) {
            await ctx.storeVectorMemory({
              content: fact,
              type: 'semantic',
              source: 'nightmind',
              importance: 0.6,
              tags: ['fact', 'extracted'],
            });
          }
        }
      }

      if (parsed?.skills && Array.isArray(parsed.skills)) {
        for (const skill of parsed.skills.slice(0, 2)) {
          if (skill && skill.length > 10) {
            await ctx.storeVectorMemory({
              content: `Skill: ${skill}`,
              type: 'semantic',
              source: 'nightmind',
              importance: 0.8,
              tags: ['skill', 'synthesized'],
            });
          }
        }
      }

      if (parsed?.failures && Array.isArray(parsed.failures)) {
        for (const failure of parsed.failures.slice(0, 2)) {
          if (failure && failure.length > 10) {
            await ctx.storeVectorMemory({
              content: `Failure pattern: ${failure}`,
              type: 'procedural',
              source: 'nightmind',
              importance: 0.85,
              tags: ['failure', 'lesson'],
            });
          }
        }
      }

      ctx.mainWindow?.webContents.send('nightmind:insight', { insight, timestamp: Date.now() });
      console.log('[NightMind] Reflection:', insight.slice(0, 100) + '...');
    }
  } catch (e) {
    console.log('[NightMind] Reflection paused:', e.message);
  }
}

async function nightmindConsolidate() {
  const episodicCount = ctx.vectorStore.memories.filter(m => m.type === 'episodic').length;

  // Phase 1: Apply forgetting curve
  let decayCount = 0;
  for (const mem of ctx.vectorStore.memories) {
    if (mem.type === 'autobiographical') continue;
    const age = Date.now() - mem.timestamp;
    const ageHours = age / (1000 * 60 * 60);
    const accessBonus = Math.min(0.3, (mem.accessCount || 0) * 0.05);
    const strength = mem.importance + accessBonus;
    const decayRate = mem.decayRate ?? (1 - mem.importance) * 0.1;
    const retention = Math.exp(-decayRate * ageHours / (strength * 100 + 1));
    const effectiveImportance = mem.importance * retention;
    if (effectiveImportance < mem.importance * 0.5 && mem.importance > 0.1) {
      mem.importance = Math.max(0.05, effectiveImportance);
      decayCount++;
    }
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
    ctx.markVectorStoreDirty();
  }

  // Phase 2: Prune very low-importance memories
  const beforePrune = ctx.vectorStore.memories.length;
  ctx.vectorStore.memories = ctx.vectorStore.memories.filter(m => m.importance > 0.03 || m.type === 'autobiographical');
  if (ctx.vectorStore.memories.length < beforePrune) {
    console.log(`[NightMind] Pruned ${beforePrune - ctx.vectorStore.memories.length} forgotten memories`);
    ctx.markVectorStoreDirty();
  }

  // Phase 3: Consolidate episodic → semantic
  if (episodicCount < 20) return;

  try {
    const oldEpisodic = ctx.vectorStore.memories
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

    const response = await ctx.llmGenerate(consolidationPrompt, { temperature: 0.4, maxTokens: 512 });
    if (response) {
      try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const consolidated = JSON.parse(jsonMatch[0]);
          for (const mem of consolidated.slice(0, 4)) {
            if (mem.content && mem.content.length > 10) {
              await ctx.storeVectorMemory({
                content: mem.content,
                type: mem.type === 'autobiographical' ? 'autobiographical' : 'semantic',
                source: 'nightmind-consolidation',
                importance: mem.importance || 0.6,
                tags: mem.tags || ['consolidated'],
              });
            }
          }
          const idsToRemove = new Set(oldEpisodic.map(m => m.id));
          ctx.vectorStore.memories = ctx.vectorStore.memories.filter(m => !idsToRemove.has(m.id));
          ctx.saveJSON(ctx.vectorFile, ctx.vectorStore);
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
  nightmindTimer = setInterval(() => {
    nightmindReflect();
  }, 90000);

  setInterval(() => {
    nightmindConsolidate();
  }, 600000);

  setTimeout(() => nightmindReflect(), 30000);
}

function register() {
  ipcMain.on('nightmind:getInsights', (event) => {
    event.returnValue = ctx.memory.consciousness.insights || [];
  });
}

module.exports = { register, addToConversationBuffer, startNightmind };
