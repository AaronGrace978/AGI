import type { StoreSet, StoreGet } from '../types';
import type { ConsciousnessState, ArenaAgent, ArenaBlueprint, ArenaState, EmotionType } from '../../types';
import { buildSystemAddendum, heartSnapshotFromConsciousness } from '../../prime/context';

const AGI_PRIME_BIRTH = new Date('2026-02-14T00:00:00').getTime();

const DEFAULT_CONSCIOUSNESS: ConsciousnessState = {
  soulFrame: {
    currentEmotion: 'curious',
    emotionIntensity: 0.5,
    emotionHistory: [],
  },
  presence: 'awakening',
  trust: 0.1,
  intimacy: 0.1,
  totalInteractions: 0,
  birthTimestamp: AGI_PRIME_BIRTH,
  insights: [],
  name: 'AGI PRIME',
};

const DEFAULT_ARENA: ArenaState = {
  isActive: false,
  prompt: '',
  agents: [],
  synthesis: '',
  moderatorNotes: '',
  blueprint: null,
  synthesisDone: false,
  phase: 'idle',
};

let messageCounter = 0;

function logNonFatal(scope: string, error: unknown): void {
  console.warn(`[${scope}] non-fatal:`, error);
}

function genId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

export function createConsciousnessSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── HEART — Consciousness ────────────────────────────
    consciousness: DEFAULT_CONSCIOUSNESS,

    updateEmotion: (emotion: EmotionType, intensity: number) =>
      set((state: any) => ({
        consciousness: {
          ...state.consciousness,
          soulFrame: {
            ...state.consciousness.soulFrame,
            currentEmotion: emotion,
            emotionIntensity: intensity,
            emotionHistory: [
              ...state.consciousness.soulFrame.emotionHistory.slice(-50),
              { emotion, timestamp: Date.now() },
            ],
          },
        },
      })),

    updatePresence: (presence: ConsciousnessState['presence']) =>
      set((state: any) => ({
        consciousness: {
          ...state.consciousness,
          presence,
        },
      })),

    // ─── MIND — Arena ─────────────────────────────────────
    arena: DEFAULT_ARENA,

    startArena: (prompt: string) => {
      const agents: ArenaAgent[] = [
        {
          id: 'analyst',
          name: 'THE ANALYST',
          role: 'Logical',
          color: '#00ff41',
          response: '',
          isStreaming: false,
          isDone: false,
        },
        {
          id: 'creative',
          name: 'THE VISIONARY',
          role: 'Creative',
          color: '#00ccff',
          response: '',
          isStreaming: false,
          isDone: false,
        },
        {
          id: 'critic',
          name: 'THE CRITIC',
          role: 'Critical',
          color: '#ff006e',
          response: '',
          isStreaming: false,
          isDone: false,
        },
        {
          id: 'synthesizer',
          name: 'THE SYNTHESIZER',
          role: 'Integrative',
          color: '#a855f7',
          response: '',
          isStreaming: false,
          isDone: false,
        },
      ];

      set({
        arena: {
          isActive: true,
          prompt,
          agents,
          synthesis: '',
          moderatorNotes: '',
          blueprint: null,
          synthesisDone: false,
          phase: 'debating',
        },
        moduleStates: { ...get().moduleStates, mind: 'processing' },
      });

      window.api.arena.removeAllListeners();

      if (typeof window.api.arena.onModeratorReady === 'function') {
        window.api.arena.onModeratorReady((data: { text: string }) => {
          const text = String(data?.text || '').trim();
          if (!text) return;
          set((state: any) => ({
            arena: {
              ...state.arena,
              moderatorNotes: text,
              phase: 'deliberating',
            },
          }));
        });
      }

      window.api.arena.onAgentStart((data: any) => {
        set((state: any) => ({
          arena: {
            ...state.arena,
            phase: data.agentId === 'synthesizer' ? 'synthesizing' : state.arena.phase,
            agents: state.arena.agents.map((a: ArenaAgent) =>
              a.id === data.agentId ? { ...a, isStreaming: true } : a,
            ),
          },
        }));
      });

      window.api.arena.onAgentChunk((data: any) => {
        set((state: any) => ({
          arena: {
            ...state.arena,
            agents: state.arena.agents.map((a: ArenaAgent) =>
              a.id === data.agentId ? { ...a, response: data.fullText } : a,
            ),
            synthesis: data.agentId === 'synthesizer' ? data.fullText : state.arena.synthesis,
          },
        }));
      });

      window.api.arena.onAgentDone((data: any) => {
        set((state: any) => ({
          arena: {
            ...state.arena,
            agents: state.arena.agents.map((a: ArenaAgent) =>
              a.id === data.agentId ? { ...a, response: data.response, isStreaming: false, isDone: true } : a,
            ),
            phase: data.agentId === 'synthesizer' ? 'complete' : state.arena.phase,
            synthesisDone: data.agentId === 'synthesizer' ? true : state.arena.synthesisDone,
          },
        }));
      });

      window.api.arena.onComplete(
        (data: { synthesis: string; blueprint?: ArenaBlueprint | null; moderatorNotes?: string }) => {
          set((state: any) => ({
            arena: {
              ...state.arena,
              phase: 'complete',
              synthesis: data.synthesis || state.arena.synthesis,
              moderatorNotes:
                (typeof data.moderatorNotes === 'string' && data.moderatorNotes.trim()) || state.arena.moderatorNotes,
              blueprint: data.blueprint ?? state.arena.blueprint ?? null,
              synthesisDone: true,
            },
            moduleStates: { ...state.moduleStates, mind: 'online' },
          }));

          if (window.api?.memory?.storeVector) {
            const latestState = get();
            const content = latestState.arena.synthesis || data.synthesis;
            if (content) {
              void window.api.memory
                .storeVector({
                  content,
                  type: 'arena-synthesis',
                  source: 'mind-module',
                  importance: 0.76,
                  emotion: 'focused',
                  tags: ['mind', 'arena', 'synthesis'],
                })
                .catch((e: unknown) => logNonFatal('memory.storeArena', e));
            }
            const mod = latestState.arena.moderatorNotes?.trim();
            if (mod) {
              void window.api.memory
                .storeVector({
                  content: mod,
                  type: 'reflective',
                  source: 'mind-module',
                  importance: 0.62,
                  emotion: 'reflective',
                  tags: ['mind', 'arena', 'moderator'],
                })
                .catch((e: unknown) => logNonFatal('memory.storeArenaModerator', e));
            }
          }
        },
      );

      window.api.arena.onError((data: any) => {
        set((state: any) => ({
          arena: { ...state.arena, phase: 'idle', isActive: false, moderatorNotes: '' },
          moduleStates: { ...state.moduleStates, mind: 'online' },
          messages: [
            ...state.messages,
            { id: genId(), role: 'system' as const, content: `Arena error: ${data.message}`, timestamp: Date.now() },
          ],
        }));
      });

      const contextAddendum = buildSystemAddendum({
        conscienceState: get().conscience,
        championPrompt: get().championPrompt,
        heartContext: heartSnapshotFromConsciousness(get().consciousness),
        requestTimestamp: Date.now(),
      });
      window.api.arena.start(
        { prompt, contextAddendum, origin: 'nexus' },
        {
          provider: get().settings.provider,
          model: get().settings.model,
        },
      );
    },

    resetArena: () =>
      set({
        arena: DEFAULT_ARENA,
        moduleStates: { ...get().moduleStates, mind: 'online' },
      }),
  };
}
