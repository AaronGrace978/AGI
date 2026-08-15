import type { StoreSet, StoreGet } from '../types';
import type { ChatMessage, NeuralTrainingProgress, Settings } from '../../types';
import {
  createDefaultNeuralState,
  updateNeuralFromStatus,
  updateNeuralFromTrainingProgress,
  updateNeuralTrainingComplete,
} from '../../prime/neuralcore';
import { createDefaultSparkState } from '../../prime/spark';

function logNonFatal(scope: string, error: unknown): void {
  console.warn(`[${scope}] non-fatal:`, error);
}

let messageCounter = 0;
function genId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

let initializeInFlight: Promise<void> | null = null;

const DEFAULT_SETTINGS: Settings = {
  provider: 'ollama',
  voiceProvider: 'browser',
  soundprimeBaseUrl: 'http://127.0.0.1:8080',
  orchestraMode: 'elevenlabs_instrumental',
  orchestraVolume: 0.22,
  orchestraRefreshSeconds: 150,
  beatStyle: 'balanced',
  genreStyle: 'auto',
  songDurationSeconds: 30,
  singingEnabled: true,
  singingMinGapSeconds: 300,
  model: 'llama3.2',
  ollamaUrl: 'http://localhost:11434',
  ollamaApiKey: '',
  anthropicKey: '',
  openaiKey: '',
  arcApiKey: '',
  elevenLabsApiKey: '',
  elevenLabsVoiceId: 'FOfJ2PMgU6HOGbNYnzto',
  elevenLabsModelId: 'eleven_multilingual_v2',
  elevenLabsMusicModelId: 'music_v1',
  useElevenLabsTts: false,
  visionProvider: '',
  visionModel: '',
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: '',
  theme: 'prime',
  streamingEnabled: true,
  operatorName: '',
  skipReflection: false,
  disableConscience: false,
  disableActionField: false,
  disableNeuralCore: false,
};

export function createSettingsSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── NEURALCORE — Physics-Informed Neural Engine ─────
    neuralCore: createDefaultNeuralState(),

    neuralRefreshStatus: async () => {
      try {
        const status = await window.api?.neural?.getStatus?.();
        if (status) {
          set((s: any) => ({ neuralCore: updateNeuralFromStatus(s.neuralCore, status) }));
        }
      } catch (error) {
        logNonFatal('neural.status.refresh', error);
      }
    },

    neuralTrain: async (params?: any) => {
      if (!window.api?.neural?.train) return;
      set((s: any) => ({ neuralCore: { ...s.neuralCore, trainingStatus: 'training', lastError: null } }));

      const unsubscribe = window.api.neural.onTrainingProgress?.((progress: NeuralTrainingProgress) => {
        set((s: any) => ({ neuralCore: updateNeuralFromTrainingProgress(s.neuralCore, progress) }));
      });

      try {
        const result = await window.api.neural.train(params as Record<string, unknown> | undefined);
        set((s: any) => ({ neuralCore: updateNeuralTrainingComplete(s.neuralCore, result || {}) }));
      } catch (e) {
        set((s: any) => ({
          neuralCore: { ...s.neuralCore, trainingStatus: 'failed', lastError: (e as Error).message },
        }));
      } finally {
        unsubscribe?.();
      }
    },

    neuralLoadModels: async (checkpoint?: string) => {
      if (!window.api?.neural?.loadModels) return;
      try {
        const result = await window.api.neural.loadModels(checkpoint);
        if (result?.loaded) {
          set((s: any) => ({ neuralCore: { ...s.neuralCore, modelsLoaded: true, lastError: null } }));
        }
      } catch (error) {
        logNonFatal('neural.models.load', error);
      }
    },

    // ─── Settings ─────────────────────────────────────────
    settings: DEFAULT_SETTINGS,
    ollamaStatus: { online: false, models: [] as string[] },

    loadSettings: async () => {
      try {
        const s = await window.api.settings.get();
        const merged = { ...DEFAULT_SETTINGS, ...s };
        set((state: any) => {
          const next: Record<string, unknown> = { settings: merged };
          if (merged.operatorName && state.spark.social.actors.some((a: any) => a.id === 'operator')) {
            next.spark = {
              ...state.spark,
              social: {
                ...state.spark.social,
                actors: state.spark.social.actors.map((a: any) =>
                  a.id === 'operator' ? { ...a, label: merged.operatorName! } : a,
                ),
              },
            };
          }
          return next;
        });
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    },

    updateSettings: async (partial: Partial<Settings>) => {
      try {
        const updated = await window.api.settings.set(partial);
        const merged = { ...DEFAULT_SETTINGS, ...updated };
        set((state: any) => {
          const next: Record<string, unknown> = { settings: merged };
          if (merged.operatorName && state.spark.social.actors.some((a: any) => a.id === 'operator')) {
            next.spark = {
              ...state.spark,
              social: {
                ...state.spark.social,
                actors: state.spark.social.actors.map((a: any) =>
                  a.id === 'operator' ? { ...a, label: merged.operatorName! } : a,
                ),
              },
            };
          }
          return next;
        });
      } catch (e) {
        console.error('Failed to update settings:', e);
      }
    },

    checkOllama: async () => {
      try {
        const status = await window.api.models.checkOllama();
        set({ ollamaStatus: status });
      } catch {
        set({ ollamaStatus: { online: false, models: [] } });
      }
    },

    // ─── System ───────────────────────────────────────────
    systemInfo: null as any,

    loadSystemInfo: async () => {
      try {
        const info = (await window.api.system.info()) as Record<string, unknown>;
        const safe = { ...info };
        delete safe.soul;
        delete safe.consciousness;
        set({ systemInfo: safe });
      } catch (e) {
        console.error('Failed to load system info:', e);
      }
    },

    // ─── Initialization ───────────────────────────────────
    initialized: false,

    initialize: async () => {
      if (get().initialized) return;
      if (initializeInFlight) {
        await initializeInFlight;
        return;
      }

      initializeInFlight = (async () => {
        await get().loadSettings();
        await get().loadConversations();
        await get().checkOllama();
        await get().loadSystemInfo();
        await get().agiScoreLoad();
        await get().loadRuntimeHealth();

        await get().loadOperatorProfile();
        if (get().settings?.resumeSynthesisOnStartup) {
          setTimeout(() => get().synthesisStart(15000), 1500);
        }

        try {
          const savedSpark = await window.api?.spark?.getState?.();
          if (savedSpark) {
            const defaults = createDefaultSparkState();
            const merged = {
              ...defaults,
              ...savedSpark,
              worldModel: {
                ...defaults.worldModel,
                ...((savedSpark as any).worldModel || {}),
              },
              goals: {
                ...defaults.goals,
                ...(savedSpark as any).goals,
              },
              active: false,
              phase: 'running' as const,
            };
            set({ spark: merged });
          }
        } catch (error) {
          logNonFatal('spark.persistence.load', error);
        }

        get()
          .neuralRefreshStatus()
          .catch((error: unknown) => {
            logNonFatal('neural.status.startup', error);
          });

        set({ initialized: true });

        setInterval(() => {
          get().loadSystemInfo();
          get().checkOllama();
          get()
            .neuralRefreshStatus()
            .catch((error: unknown) => {
              logNonFatal('neural.status.interval', error);
            });
          get()
            .loadRuntimeHealth()
            .catch((error: unknown) => {
              logNonFatal('runtime.health.interval', error);
            });
        }, 30000);

        if (window.api?.nightmind) {
          window.api.nightmind.onInsight((data: { insight: string; timestamp: number }) => {
            set((state: any) => ({
              consciousness: {
                ...state.consciousness,
                insights: [...state.consciousness.insights.slice(-19), data.insight],
              },
            }));

            if (data.insight && data.insight.length > 60 && Math.random() < 0.4) {
              const nightmindMsg: ChatMessage = {
                id: genId(),
                role: 'assistant',
                content: data.insight,
                timestamp: Date.now(),
                sourceModule: 'nexus',
                thinking: true,
              };
              set((state: any) => ({
                messages: [...state.messages, nightmindMsg],
              }));
            }
          });
        }
      })();

      try {
        await initializeInFlight;
      } finally {
        initializeInFlight = null;
      }
    },
  };
}
