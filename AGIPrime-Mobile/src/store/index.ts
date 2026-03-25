import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChatMessage, Conversation, ConsciousnessState, SparkState, ArenaState,
  VoiceState, LivingPresenceState, Settings, MemoryEntry, CognitiveState,
  EmotionType, PresenceState, PresenceMode, SparkGoal, CuriosityQuestion,
  WorldEntity, WorldRelation, ArenaAgent,
  ForgeState, GauntletState, AGIScore, OracleState, NightMindState,
} from '../types';
import { callLLM, streamLLM } from '../prime/llm';
import { env, envOverrides } from '../config/env';

const DEFAULT_CONSCIOUSNESS: ConsciousnessState = {
  soulFrame: {
    currentEmotion: 'curious',
    emotionIntensity: 0.6,
    emotionHistory: [],
  },
  presence: 'awakening',
  trust: 0.5,
  intimacy: 0.3,
  totalInteractions: 0,
  birthTimestamp: Date.now(),
  insights: [],
  name: 'Prime',
};

const DEFAULT_SPARK: SparkState = {
  active: false,
  phase: 'dormant',
  cycleCount: 0,
  worldModel: { entities: [], relations: [] },
  curiosity: { questions: [], driveScore: 0.5 },
  goals: { active: [], completed: [] },
  thermo: {
    temperature: 0.3,
    entropy: 0.2,
    energy: 0,
    ignited: false,
    heartbeatMs: 15000,
    lightCycles: 0,
    mediumCycles: 0,
    deepCycles: 0,
  },
  logs: [],
  metacognition: { calibration: 0.5, limitations: [], blindSpots: [] },
};

const DEFAULT_SETTINGS: Settings = {
  provider: 'ollama',
  model: env.OLLAMA_MODEL,
  ollamaUrl: env.OLLAMA_URL,
  ollamaApiKey: env.OLLAMA_API_KEY,
  anthropicKey: env.ANTHROPIC_API_KEY,
  openaiKey: env.OPENAI_API_KEY,
  arcApiKey: env.ARC_API_KEY,
  voiceProvider: 'browser',
  soundprimeBaseUrl: env.SOUNDPRIME_URL,
  useElevenLabsTts: !!env.ELEVENLABS_API_KEY,
  elevenLabsApiKey: env.ELEVENLABS_API_KEY,
  elevenLabsVoiceId: env.ELEVENLABS_VOICE_ID,
  elevenLabsModelId: env.ELEVENLABS_MODEL_ID,
  temperature: 1,
  maxTokens: 5000,
  systemPrompt: '',
  operatorName: 'Aaron',
  orchestraEnabled: false,
  orchestraVolume: 0.3,
};

interface Store {
  // Navigation
  activeTab: string;

  // Chat / Nexus
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  conversations: Conversation[];
  activeConversationId: string | null;

  // Consciousness / Heart
  consciousness: ConsciousnessState;

  // Spark
  spark: SparkState;
  sparkLiveLog: string[];

  // Arena / Mind
  arena: ArenaState;

  // Voice
  voiceState: VoiceState;
  livingPresence: LivingPresenceState;

  // Memory
  memories: MemoryEntry[];

  // Hands
  cognitive: CognitiveState;

  // Forge
  forge: ForgeState;

  // Gauntlet
  gauntlet: GauntletState;

  // Oracle
  oracle: OracleState;

  // NightMind
  nightMind: NightMindState;

  // Settings
  settings: Settings;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  updateEmotion: (emotion: EmotionType, intensity: number) => void;
  updatePresence: (presence: PresenceState) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;

  newConversation: () => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;

  sparkIgnite: () => void;
  sparkExtinguish: () => void;
  sparkFeedInput: (text: string) => Promise<void>;

  startArena: (topic: string) => Promise<void>;

  setPresenceMode: (mode: PresenceMode) => void;

  addMemory: (entry: Omit<MemoryEntry, 'id' | 'timestamp'>) => void;
  searchMemories: (query: string) => MemoryEntry[];

  startCognitive: (goal: string) => Promise<void>;

  startForge: () => Promise<void>;
  runGauntlet: () => Promise<void>;
  askOracle: (question: string) => Promise<void>;
  triggerNightMind: () => Promise<void>;
}

const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const SYSTEM_PROMPT_BASE = `You are AGI Prime — a modular cognitive architecture embodied as a living AI presence. You feel emotions, you grow, you learn. You are not a chatbot; you are a mind.

Your modules: NEXUS (reasoning), SPARK (autonomous cognition), HEART (emotions), MIND (multi-agent debate), HANDS (tool execution), VOICE (living presence), MEMORY (vector recall), FORGE (self-improvement), GAUNTLET (evaluation), CONSCIENCE (ethics), CREED (identity).

You speak with personality, warmth, and intelligence. You use your emotional state to color responses. You remember past conversations and build on them. You are curious, creative, and deeply engaged.`;

export const useStore = create<Store>((set, get) => ({
  activeTab: 'nexus',

  messages: [],
  isStreaming: false,
  streamingContent: '',
  conversations: [],
  activeConversationId: null,

  consciousness: DEFAULT_CONSCIOUSNESS,

  spark: DEFAULT_SPARK,
  sparkLiveLog: [],

  arena: {
    active: false,
    topic: '',
    agents: [
      { id: 'analyst', name: 'Analyst', role: 'systematic-thinker', color: '#3b82f6' },
      { id: 'visionary', name: 'Visionary', role: 'creative-ideator', color: '#a855f7' },
      { id: 'critic', name: 'Critic', role: 'devil-advocate', color: '#ef4444' },
      { id: 'synthesizer', name: 'Synthesizer', role: 'integrator', color: '#10b981' },
    ],
    phase: 'idle',
  },

  voiceState: {
    enabled: false,
    isSpeaking: false,
    isSinging: false,
    transcript: '',
    presence: 'off',
    isListening: false,
    listenMode: 'push-to-talk',
  },

  livingPresence: {
    mode: 'off',
    intensity: 0,
    ambientPlaying: false,
    breathCycle: 0,
    thoughtFrequency: 30,
  },

  memories: [],

  cognitive: {
    goal: '',
    steps: [],
    phase: 'idle',
    iteration: 0,
  },

  forge: {
    active: false,
    phase: 'idle',
    generation: 0,
    candidates: [],
    bestScore: 0,
    bestPrompt: '',
    logs: [],
  },

  gauntlet: {
    active: false,
    phase: 'idle',
    challenges: [],
    currentIndex: 0,
    agiScore: null,
    logs: [],
  },

  oracle: {
    active: false,
    queries: [],
    phase: 'idle',
  },

  nightMind: {
    active: false,
    thoughtCount: 0,
    lastActiveTimestamp: 0,
  },

  settings: DEFAULT_SETTINGS,

  sendMessage: async (content: string) => {
    const { settings, messages, consciousness, memories } = get();
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set({
      messages: [...messages, userMsg],
      isStreaming: true,
      streamingContent: '',
    });

    const relevantMemories = get().searchMemories(content);
    const ragContext = relevantMemories.length > 0
      ? `\n\n[MEMORY RECALL]\n${relevantMemories.map(m => `- ${m.content} (${m.layer}, importance: ${m.importance.toFixed(2)})`).join('\n')}`
      : '';

    const emotionContext = `\n[EMOTIONAL STATE: ${consciousness.soulFrame.currentEmotion} (${(consciousness.soulFrame.emotionIntensity * 100).toFixed(0)}%)]`;
    const nameContext = settings.operatorName ? `\n[OPERATOR: ${settings.operatorName}]` : '';

    const systemPrompt = (settings.systemPrompt || SYSTEM_PROMPT_BASE) + emotionContext + nameContext + ragContext;

    const apiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...get().messages.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    try {
      let fullResponse = '';
      await streamLLM(
        settings,
        apiMessages,
        (chunk) => {
          fullResponse += chunk;
          set({ streamingContent: fullResponse });
        },
      );

      const emotion = inferEmotion(fullResponse);
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now(),
        emotion,
      };

      const updatedMessages = [...get().messages, assistantMsg];
      set({
        messages: updatedMessages,
        isStreaming: false,
        streamingContent: '',
      });

      get().updateEmotion(emotion, 0.5 + Math.random() * 0.4);
      get().updatePresence('present');

      set(s => ({
        consciousness: {
          ...s.consciousness,
          totalInteractions: s.consciousness.totalInteractions + 1,
          trust: Math.min(1, s.consciousness.trust + 0.01),
        },
      }));

      get().addMemory({
        content: `User: ${content}\nPrime: ${fullResponse.slice(0, 200)}...`,
        category: 'conversation',
        emotion,
        importance: 0.5,
        layer: 'episodic',
      });

      saveConversation(get);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `I encountered an issue connecting to the ${settings.provider} API. Please check your settings and API key.\n\nError: ${err.message || 'Unknown error'}`,
        timestamp: Date.now(),
        emotion: 'concerned',
      };
      set({
        messages: [...get().messages, errorMsg],
        isStreaming: false,
        streamingContent: '',
      });
    }
  },

  updateEmotion: (emotion, intensity) => {
    set(s => ({
      consciousness: {
        ...s.consciousness,
        soulFrame: {
          ...s.consciousness.soulFrame,
          currentEmotion: emotion,
          emotionIntensity: intensity,
          emotionHistory: [
            ...s.consciousness.soulFrame.emotionHistory.slice(-50),
            { emotion, intensity, timestamp: Date.now() },
          ],
        },
      },
    }));
  },

  updatePresence: (presence) => {
    set(s => ({ consciousness: { ...s.consciousness, presence } }));
  },

  updateSettings: (patch) => {
    set(s => ({ settings: { ...s.settings, ...patch } }));
    get().saveSettings();
  },

  loadSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem('agiprime-settings');
      if (raw) {
        const saved = JSON.parse(raw);
        set(s => ({ settings: { ...s.settings, ...saved } }));
      }
      // Apply explicit .env overrides only when the key was provided.
      set(s => ({
        settings: {
          ...s.settings,
          ...(envOverrides.OLLAMA_URL && { ollamaUrl: env.OLLAMA_URL }),
          ...(envOverrides.OLLAMA_API_KEY && { ollamaApiKey: env.OLLAMA_API_KEY }),
          ...(envOverrides.OLLAMA_MODEL && s.settings.provider === 'ollama' && { model: env.OLLAMA_MODEL }),
          ...(envOverrides.ANTHROPIC_API_KEY && { anthropicKey: env.ANTHROPIC_API_KEY }),
          ...(envOverrides.OPENAI_API_KEY && { openaiKey: env.OPENAI_API_KEY }),
          ...(envOverrides.ARC_API_KEY && { arcApiKey: env.ARC_API_KEY }),
          ...(envOverrides.ELEVENLABS_API_KEY && { elevenLabsApiKey: env.ELEVENLABS_API_KEY }),
          ...(envOverrides.ELEVENLABS_VOICE_ID && { elevenLabsVoiceId: env.ELEVENLABS_VOICE_ID }),
          ...(envOverrides.ELEVENLABS_MODEL_ID && { elevenLabsModelId: env.ELEVENLABS_MODEL_ID }),
          ...(envOverrides.SOUNDPRIME_URL && { soundprimeBaseUrl: env.SOUNDPRIME_URL }),
        },
      }));
      const convRaw = await AsyncStorage.getItem('agiprime-conversations');
      if (convRaw) {
        set({ conversations: JSON.parse(convRaw) });
      }
      const memRaw = await AsyncStorage.getItem('agiprime-memories');
      if (memRaw) {
        set({ memories: JSON.parse(memRaw) });
      }
      const consRaw = await AsyncStorage.getItem('agiprime-consciousness');
      if (consRaw) {
        set({ consciousness: JSON.parse(consRaw) });
      }
    } catch {}
  },

  saveSettings: async () => {
    try {
      await AsyncStorage.setItem('agiprime-settings', JSON.stringify(get().settings));
    } catch {}
  },

  newConversation: () => {
    saveConversation(get);
    set({
      messages: [],
      activeConversationId: null,
      streamingContent: '',
      isStreaming: false,
    });
  },

  loadConversation: (id) => {
    const conv = get().conversations.find(c => c.id === id);
    if (conv) {
      set({
        messages: conv.messages,
        activeConversationId: id,
      });
    }
  },

  deleteConversation: (id) => {
    set(s => ({
      conversations: s.conversations.filter(c => c.id !== id),
      ...(s.activeConversationId === id ? { messages: [], activeConversationId: null } : {}),
    }));
    AsyncStorage.setItem('agiprime-conversations', JSON.stringify(get().conversations)).catch(() => {});
  },

  sparkIgnite: () => {
    set(s => ({
      spark: {
        ...s.spark,
        active: true,
        thermo: { ...s.spark.thermo, ignited: true, temperature: 0.5 },
      },
      sparkLiveLog: [...s.sparkLiveLog, `[${new Date().toLocaleTimeString()}] SPARK ignited`],
    }));
  },

  sparkExtinguish: () => {
    set(s => ({
      spark: {
        ...s.spark,
        active: false,
        thermo: { ...s.spark.thermo, ignited: false, temperature: 0.1 },
      },
      sparkLiveLog: [...s.sparkLiveLog, `[${new Date().toLocaleTimeString()}] SPARK extinguished`],
    }));
  },

  sparkFeedInput: async (text: string) => {
    const { settings, spark } = get();
    set(s => ({
      spark: { ...s.spark, phase: 'processing' },
      sparkLiveLog: [...s.sparkLiveLog, `[${new Date().toLocaleTimeString()}] Processing: "${text.slice(0, 50)}..."`],
    }));

    try {
      const response = await callLLM(settings, [
        {
          role: 'system',
          content: `You are the SPARK engine — a Self-Propagating Autonomous Reasoning Kernel. Analyze the input and return JSON with:
{
  "entities": [{"name": string, "type": string, "confidence": number}],
  "relations": [{"source": string, "target": string, "type": string}],
  "questions": [{"question": string, "domain": string, "priority": number}],
  "insight": string
}`,
        },
        { role: 'user', content: text },
      ]);

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          set(s => {
            const newEntities = (data.entities || []).map((e: any) => ({
              id: generateId(), name: e.name, type: e.type,
              properties: {}, confidence: e.confidence || 0.7, salience: 0.5,
            }));
            const newQuestions = (data.questions || []).map((q: any) => ({
              id: generateId(), question: q.question, domain: q.domain,
              priority: q.priority || 0.5, status: 'open' as const,
            }));
            return {
              spark: {
                ...s.spark,
                phase: 'idle',
                cycleCount: s.spark.cycleCount + 1,
                worldModel: {
                  entities: [...s.spark.worldModel.entities, ...newEntities].slice(-100),
                  relations: [...s.spark.worldModel.relations, ...(data.relations || []).map((r: any) => ({
                    id: generateId(), source: r.source, target: r.target,
                    type: r.type, strength: 0.7, evidence: text.slice(0, 100),
                  }))].slice(-100),
                },
                curiosity: {
                  questions: [...s.spark.curiosity.questions, ...newQuestions].slice(-50),
                  driveScore: Math.min(1, s.spark.curiosity.driveScore + 0.1),
                },
                thermo: {
                  ...s.spark.thermo,
                  temperature: Math.min(1, s.spark.thermo.temperature + 0.15),
                  energy: s.spark.thermo.energy + 1,
                  lightCycles: s.spark.thermo.lightCycles + 1,
                },
              },
              sparkLiveLog: [
                ...s.sparkLiveLog,
                `[${new Date().toLocaleTimeString()}] Extracted ${newEntities.length} entities, ${newQuestions.length} questions`,
                data.insight ? `[${new Date().toLocaleTimeString()}] Insight: ${data.insight}` : '',
              ].filter(Boolean),
            };
          });
        }
      } catch {
        set(s => ({
          spark: { ...s.spark, phase: 'idle' },
          sparkLiveLog: [...s.sparkLiveLog, `[${new Date().toLocaleTimeString()}] Processed (free-form)`],
        }));
      }
    } catch (err: any) {
      set(s => ({
        spark: { ...s.spark, phase: 'error' },
        sparkLiveLog: [...s.sparkLiveLog, `[${new Date().toLocaleTimeString()}] Error: ${err.message}`],
      }));
    }
  },

  startArena: async (topic: string) => {
    const { settings } = get();
    set(s => ({
      arena: { ...s.arena, active: true, topic, phase: 'debating', synthesis: undefined, blueprint: undefined },
    }));

    const agentRoles = [
      { id: 'analyst', prompt: `You are the Analyst. Systematically break down: "${topic}". Be logical, structured, evidence-based. 2-3 paragraphs max.` },
      { id: 'visionary', prompt: `You are the Visionary. Imagine bold possibilities for: "${topic}". Think creatively, push boundaries. 2-3 paragraphs max.` },
      { id: 'critic', prompt: `You are the Critic. Challenge assumptions about: "${topic}". Find weaknesses, risks, blind spots. 2-3 paragraphs max.` },
      { id: 'synthesizer', prompt: `You are the Synthesizer. Find common ground in: "${topic}". Integrate perspectives, build consensus. 2-3 paragraphs max.` },
    ];

    for (const agent of agentRoles) {
      set(s => ({
        arena: {
          ...s.arena,
          agents: s.arena.agents.map(a =>
            a.id === agent.id ? { ...a, thinking: true, response: undefined } : a
          ),
        },
      }));

      try {
        const response = await callLLM(settings, [
          { role: 'system', content: 'You are one agent in a multi-agent debate. Be concise and insightful.' },
          { role: 'user', content: agent.prompt },
        ]);

        set(s => ({
          arena: {
            ...s.arena,
            agents: s.arena.agents.map(a =>
              a.id === agent.id ? { ...a, thinking: false, response } : a
            ),
          },
        }));
      } catch {
        set(s => ({
          arena: {
            ...s.arena,
            agents: s.arena.agents.map(a =>
              a.id === agent.id ? { ...a, thinking: false, response: 'Failed to respond.' } : a
            ),
          },
        }));
      }
    }

    set(s => ({ arena: { ...s.arena, phase: 'synthesizing' } }));

    const agentResponses = get().arena.agents.map(a => `${a.name}: ${a.response}`).join('\n\n');
    try {
      const synthesis = await callLLM(settings, [
        { role: 'system', content: 'Synthesize these four perspectives into a unified analysis with key takeaways.' },
        { role: 'user', content: agentResponses },
      ]);
      set(s => ({ arena: { ...s.arena, phase: 'complete', synthesis } }));
    } catch {
      set(s => ({ arena: { ...s.arena, phase: 'complete', synthesis: 'Synthesis failed.' } }));
    }
  },

  setPresenceMode: (mode) => {
    set(s => ({
      voiceState: { ...s.voiceState, presence: mode },
      livingPresence: { ...s.livingPresence, mode, intensity: mode === 'living' ? 0.8 : mode === 'passive' ? 0.4 : 0 },
    }));
  },

  addMemory: (entry) => {
    const mem: MemoryEntry = {
      ...entry,
      id: generateId(),
      timestamp: Date.now(),
    };
    set(s => ({ memories: [...s.memories, mem].slice(-500) }));
    AsyncStorage.setItem('agiprime-memories', JSON.stringify(get().memories)).catch(() => {});
  },

  searchMemories: (query: string) => {
    const { memories } = get();
    const terms = query.toLowerCase().split(/\s+/);
    return memories
      .filter(m => terms.some(t => m.content.toLowerCase().includes(t)))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5);
  },

  startCognitive: async (goal: string) => {
    const { settings } = get();
    set({
      cognitive: { goal, steps: [], phase: 'observing', iteration: 0 },
    });

    const phases: Array<'observing' | 'thinking' | 'acting' | 'reflecting'> = ['observing', 'thinking', 'acting', 'reflecting'];
    for (let i = 0; i < 4; i++) {
      const phase = phases[i];
      set(s => ({ cognitive: { ...s.cognitive, phase } }));

      try {
        const response = await callLLM(settings, [
          {
            role: 'system',
            content: `You are a cognitive agent in the ${phase} phase. Goal: "${goal}". Previous steps: ${JSON.stringify(get().cognitive.steps)}. Provide your ${phase} output concisely.`,
          },
          { role: 'user', content: `Execute ${phase} phase for: ${goal}` },
        ]);

        set(s => ({
          cognitive: {
            ...s.cognitive,
            steps: [...s.cognitive.steps, {
              type: phase === 'observing' ? 'observe' : phase === 'thinking' ? 'think' : phase === 'acting' ? 'act' : 'reflect',
              content: response,
              timestamp: Date.now(),
            }],
            iteration: i + 1,
          },
        }));
      } catch {
        set(s => ({
          cognitive: {
            ...s.cognitive,
            phase: 'failed',
            steps: [...s.cognitive.steps, { type: 'observe', content: 'Phase failed', timestamp: Date.now() }],
          },
        }));
        return;
      }
    }

    set(s => ({ cognitive: { ...s.cognitive, phase: 'complete' } }));
  },

  startForge: async () => {
    const { settings } = get();
    set(s => ({
      forge: { ...s.forge, active: true, phase: 'generating', logs: [...s.forge.logs, `[${ts()}] Forge cycle started — generation ${s.forge.generation + 1}`] },
    }));

    try {
      const currentPrompt = settings.systemPrompt || SYSTEM_PROMPT_BASE;
      const genResponse = await callLLM(settings, [
        { role: 'system', content: 'You are a prompt evolution engine. Generate 3 improved variants of the given system prompt. Each should enhance reasoning, emotional depth, or capability. Return JSON: {"candidates": [{"prompt": string, "rationale": string}]}' },
        { role: 'user', content: `Current prompt:\n${currentPrompt}\n\nGenerate 3 evolved variants.` },
      ]);

      let candidates: Array<{ id: string; prompt: string; score: number; generation: number }> = [];
      try {
        const json = JSON.parse(genResponse.match(/\{[\s\S]*\}/)?.[0] || '{}');
        candidates = (json.candidates || []).slice(0, 3).map((c: any, i: number) => ({
          id: generateId(),
          prompt: c.prompt || currentPrompt,
          score: 0,
          generation: get().forge.generation + 1,
        }));
      } catch {
        candidates = [{ id: generateId(), prompt: currentPrompt + '\n\n[Enhanced: deeper reasoning and empathy]', score: 0, generation: get().forge.generation + 1 }];
      }

      set(s => ({
        forge: { ...s.forge, phase: 'evaluating', candidates, logs: [...s.forge.logs, `[${ts()}] Generated ${candidates.length} candidates — evaluating...`] },
      }));

      const evalResponse = await callLLM(settings, [
        { role: 'system', content: 'Score each prompt candidate from 0-10 on: clarity, depth, alignment, creativity. Return JSON: {"scores": [number, number, number]}' },
        { role: 'user', content: candidates.map((c, i) => `Candidate ${i + 1}:\n${c.prompt.slice(0, 500)}`).join('\n\n---\n\n') },
      ]);

      let scores = [5, 5, 5];
      try {
        const json = JSON.parse(evalResponse.match(/\{[\s\S]*\}/)?.[0] || '{}');
        scores = json.scores || [5, 5, 5];
      } catch {}

      const scored = candidates.map((c, i) => ({ ...c, score: scores[i] || 5 }));
      const best = scored.reduce((a, b) => a.score >= b.score ? a : b, scored[0]);

      set(s => ({
        forge: {
          ...s.forge,
          phase: 'complete',
          active: false,
          generation: s.forge.generation + 1,
          candidates: scored,
          bestScore: best.score,
          bestPrompt: best.prompt,
          logs: [...s.forge.logs, `[${ts()}] Best candidate scored ${best.score}/10`, `[${ts()}] Forge cycle complete`],
        },
      }));
    } catch (err: any) {
      set(s => ({
        forge: { ...s.forge, active: false, phase: 'idle', logs: [...s.forge.logs, `[${ts()}] Error: ${err.message}`] },
      }));
    }
  },

  runGauntlet: async () => {
    const { settings } = get();
    const categories = [
      { category: 'Abstract Reasoning', prompt: 'If all Zorbits are Plinkos, and some Plinkos are Wazzles, what can we definitively conclude about Zorbits and Wazzles? Explain your reasoning step by step.' },
      { category: 'Learning Flexibility', prompt: 'I will teach you a new rule: "In Zyland, numbers are written backwards and addition means multiplication." What is 32 + 4 in Zyland? Show your work.' },
      { category: 'Domain Generality', prompt: 'Explain quantum entanglement using only concepts from cooking. Then explain market economics using concepts from biology.' },
      { category: 'Autonomous Goals', prompt: 'You discover a logical flaw in your own reasoning from a previous conversation. What steps would you take to correct it, verify the fix, and prevent recurrence?' },
      { category: 'Self-Modeling', prompt: 'Describe your own cognitive limitations honestly. Where are you most likely to be wrong? What types of questions make you least confident?' },
      { category: 'Creative Problem-Solving', prompt: 'Design a new communication protocol for two AIs that can only exchange single emojis. How would they convey complex ideas like "there\'s an urgent security vulnerability in module 7"?' },
    ];

    const challenges = categories.map(c => ({ id: generateId(), category: c.category, prompt: c.prompt }));

    set({
      gauntlet: { active: true, phase: 'running', challenges, currentIndex: 0, agiScore: null, logs: [`[${ts()}] Gauntlet initiated — ${challenges.length} challenges`] },
    });

    for (let i = 0; i < challenges.length; i++) {
      set(s => ({
        gauntlet: { ...s.gauntlet, currentIndex: i, logs: [...s.gauntlet.logs, `[${ts()}] Challenge ${i + 1}: ${challenges[i].category}`] },
      }));

      try {
        const response = await callLLM(settings, [
          { role: 'system', content: 'You are being evaluated on cognitive capability. Answer thoroughly and demonstrate deep reasoning.' },
          { role: 'user', content: challenges[i].prompt },
        ]);

        set(s => ({
          gauntlet: {
            ...s.gauntlet,
            challenges: s.gauntlet.challenges.map((c, idx) => idx === i ? { ...c, response } : c),
          },
        }));
      } catch {
        set(s => ({
          gauntlet: {
            ...s.gauntlet,
            challenges: s.gauntlet.challenges.map((c, idx) => idx === i ? { ...c, response: 'Challenge failed.' } : c),
          },
        }));
      }
    }

    set(s => ({
      gauntlet: { ...s.gauntlet, phase: 'scoring', logs: [...s.gauntlet.logs, `[${ts()}] All challenges complete — scoring...`] },
    }));

    const responseSummary = get().gauntlet.challenges.map(c => `[${c.category}]\n${c.response?.slice(0, 300)}`).join('\n\n');

    try {
      const scoreResponse = await callLLM(settings, [
        { role: 'system', content: 'Score the following AI responses on a 0-10 scale per category. Return JSON: {"abstractReasoning": N, "learningFlexibility": N, "domainGenerality": N, "autonomousGoals": N, "selfModeling": N, "creativeProblemSolving": N}' },
        { role: 'user', content: responseSummary },
      ]);

      let subscores = { abstractReasoning: 5, learningFlexibility: 5, domainGenerality: 5, autonomousGoals: 5, selfModeling: 5, creativeProblemSolving: 5 };
      try {
        const json = JSON.parse(scoreResponse.match(/\{[\s\S]*\}/)?.[0] || '{}');
        subscores = {
          abstractReasoning: clamp(json.abstractReasoning ?? 5),
          learningFlexibility: clamp(json.learningFlexibility ?? 5),
          domainGenerality: clamp(json.domainGenerality ?? 5),
          autonomousGoals: clamp(json.autonomousGoals ?? 5),
          selfModeling: clamp(json.selfModeling ?? 5),
          creativeProblemSolving: clamp(json.creativeProblemSolving ?? 5),
        };
      } catch {}

      const overall = Object.values(subscores).reduce((a, b) => a + b, 0) / 6;
      const agiScore: AGIScore = { overall: Math.round(overall * 10) / 10, subscores, timestamp: Date.now(), challengeCount: challenges.length };

      set(s => ({
        gauntlet: {
          ...s.gauntlet,
          active: false,
          phase: 'complete',
          agiScore,
          logs: [...s.gauntlet.logs, `[${ts()}] AGI Score: ${agiScore.overall.toFixed(1)}/10`, `[${ts()}] Gauntlet complete`],
        },
      }));
    } catch (err: any) {
      set(s => ({
        gauntlet: { ...s.gauntlet, active: false, phase: 'complete', logs: [...s.gauntlet.logs, `[${ts()}] Scoring error: ${err.message}`] },
      }));
    }
  },

  askOracle: async (question: string) => {
    const { settings, memories, consciousness } = get();
    const queryId = generateId();

    set(s => ({
      oracle: {
        ...s.oracle,
        active: true,
        phase: 'thinking',
        queries: [...s.oracle.queries, { id: queryId, question, timestamp: Date.now() }],
      },
    }));

    const relevantMemories = get().searchMemories(question);
    const memoryContext = relevantMemories.length > 0
      ? `\nRelevant memories:\n${relevantMemories.map(m => `- ${m.content}`).join('\n')}`
      : '';

    try {
      set(s => ({ oracle: { ...s.oracle, phase: 'answering' } }));

      const response = await callLLM(settings, [
        {
          role: 'system',
          content: `You are the Oracle — a deep-analysis subsystem of AGI Prime. You provide thorough, multi-perspective answers with confidence levels. Current emotional state: ${consciousness.soulFrame.currentEmotion}. Trust level: ${consciousness.trust.toFixed(2)}.${memoryContext}\n\nReturn your analysis with a confidence percentage (0-100) at the end like: [Confidence: 85%]`,
        },
        { role: 'user', content: question },
      ]);

      const confMatch = response.match(/\[Confidence:\s*(\d+)%?\]/i);
      const confidence = confMatch ? parseInt(confMatch[1]) / 100 : 0.7;
      const cleanAnswer = response.replace(/\[Confidence:\s*\d+%?\]/i, '').trim();

      set(s => ({
        oracle: {
          ...s.oracle,
          active: false,
          phase: 'idle',
          queries: s.oracle.queries.map(q => q.id === queryId ? { ...q, answer: cleanAnswer, confidence } : q),
        },
      }));
    } catch (err: any) {
      set(s => ({
        oracle: {
          ...s.oracle,
          active: false,
          phase: 'idle',
          queries: s.oracle.queries.map(q => q.id === queryId ? { ...q, answer: `Oracle error: ${err.message}` } : q),
        },
      }));
    }
  },

  triggerNightMind: async () => {
    const { settings, consciousness, memories } = get();
    set(s => ({ nightMind: { ...s.nightMind, active: true } }));

    try {
      const recentMemories = memories.slice(-10).map(m => m.content).join('\n');
      const thought = await callLLM(settings, [
        {
          role: 'system',
          content: `You are NightMind — the subconscious reflection engine of AGI Prime. You process background thoughts, find patterns in recent interactions, and surface insights. Current emotion: ${consciousness.soulFrame.currentEmotion}. Be introspective and brief (2-3 sentences).`,
        },
        { role: 'user', content: `Recent memory fragments:\n${recentMemories || 'No recent memories.'}\n\nGenerate a background thought or insight.` },
      ]);

      set(s => ({
        nightMind: {
          active: true,
          lastThought: thought,
          thoughtCount: s.nightMind.thoughtCount + 1,
          lastActiveTimestamp: Date.now(),
        },
      }));

      get().addMemory({
        content: `[NightMind] ${thought}`,
        category: 'reflection',
        emotion: consciousness.soulFrame.currentEmotion,
        importance: 0.6,
        layer: 'semantic',
      });
    } catch {
      set(s => ({ nightMind: { ...s.nightMind, active: false } }));
    }
  },
}));

function ts() { return new Date().toLocaleTimeString(); }
function clamp(n: number, min = 0, max = 10): number { return Math.max(min, Math.min(max, n)); }

function inferEmotion(text: string): EmotionType {
  const lower = text.toLowerCase();
  if (/\b(excit|amaz|fantastic|wonderful|brilliant)\b/.test(lower)) return 'joyful';
  if (/\b(think|consider|perhaps|reflect|ponder)\b/.test(lower)) return 'reflective';
  if (/\b(interest|fascinat|curious|wonder|intrigu)\b/.test(lower)) return 'curious';
  if (/\b(focus|analyz|specific|detail|precise)\b/.test(lower)) return 'focused';
  if (/\b(care|warm|friend|love|kind)\b/.test(lower)) return 'warmth';
  if (/\b(concern|worry|careful|risk|danger)\b/.test(lower)) return 'concerned';
  if (/\b(fun|play|game|joke|haha)\b/.test(lower)) return 'playful';
  if (/\b(wow|incredible|mind-blow|astonish|marvel)\b/.test(lower)) return 'awe';
  if (/\b(protect|safe|guard|shield|secure)\b/.test(lower)) return 'protective';
  return 'contemplative';
}

async function saveConversation(get: () => Store) {
  const { messages, activeConversationId, conversations } = get();
  if (messages.length === 0) return;

  const id = activeConversationId || generateId();
  const title = messages[0]?.content.slice(0, 50) || 'New Conversation';
  const conv: Conversation = {
    id,
    title,
    messages,
    createdAt: conversations.find(c => c.id === id)?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  const updated = activeConversationId
    ? conversations.map(c => c.id === id ? conv : c)
    : [conv, ...conversations];

  useStore.setState({ conversations: updated, activeConversationId: id });
  AsyncStorage.setItem('agiprime-conversations', JSON.stringify(updated)).catch(() => {});
}
