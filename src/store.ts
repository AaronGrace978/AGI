// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Central Nervous System (State Management)
//  The unified state that connects all modules.
//  Now with: RAG memory, real LLM evaluation, cognitive loop,
//  champion deployment, and experience-driven self-improvement.
// ═══════════════════════════════════════════════════════════════

import { create } from 'zustand';
import type {
  ModuleId,
  ChatMessage,
  ConsciousnessState,
  ArenaAgent,
  ArenaBlueprint,
  ArenaState,
  Settings,
  OllamaStatus,
  EmotionType,
  ForgeState,
  ForgeRunConfig,
  ForgeCandidate,
  ForgeGenerationReport,
  ForgeBenchmark,
  CognitiveStep,
  CognitivePhase,
  SparkState,
  VoiceState,
  VoiceTranscriptEntry,
  GauntletState,
  GauntletCapability,
  DualBrainState,
  MemoryConsolidationState,
  ConscienceState,
  EthicalJudgment,
  PendingConsentAction,
  ConsentMode,
  ConsentDecision,
  RollbackEntry,
  ReplayState,
  ExecutionTierLimit,
  RuntimeControlSyncState,
  OperatorProfile,
  OperatorObservation,
  SynthesisSessionState,
} from './types';
import {
  createDefaultSuite,
  createSeedCandidate,
  evaluateGeneration,
  evaluateSeed,
} from './prime/runtime';
import type { GenerateFn } from './prime/runtime';
import type { OwnerPolicy, AutonomyLevel } from './prime/policy';
import { SOVEREIGN_POLICY } from './prime/policy';
import { runSovereignLoop } from './prime/sovereign';
import type { SovereignPhase } from './prime/sovereign';
import { injectCreed } from './prime/soul';
import {
  searchMemories,
  buildRAGContext,
  storeConversationMemory,
} from './prime/memory';
import {
  createDefaultSparkState,
  runSparkCycle,
  runDeepThought,
  runLightCycle,
  runMediumCycle,
  createGoal,
} from './prime/spark';
import {
  createDefaultGauntletCapabilities,
  runCapabilityGauntlet,
} from './prime/gauntlet';
import {
  speak as ttsSpeak,
  cancelSpeech,
  generateSpontaneousThought,
  getGreeting,
} from './prime/voice';
import { routeToBrain, buildSlowBrainDirective } from './prime/router';
import {
  createDefaultCurriculumState,
  updateCurriculumFromRun,
} from './prime/curriculum';
import { consolidateEpisodes } from './prime/memory-consolidation';
import {
  createInitialHorizonPlan,
  advanceHorizonPlan,
} from './prime/horizon';
import { stepMetabolism } from './prime/autonomy-metabolism';
import { adaptGenomeFromSignal } from './prime/cognitive-genome';
import { updateSocialFromInteraction } from './prime/social-sim';
import { applyEcologyAction } from './prime/embodied-ecology';
import { runNightlyReconsolidation as runNightlyReconsolidationPass } from './prime/reconsolidation';
import { deriveTransferHeuristicsFromProceduralMemories } from './prime/transfer-learning';
import {
  createDefaultConscienceState,
  checkConscience,
  reflectOnAction,
  recordOverride,
  buildConscienceSummary,
  CONSCIENCE_SYSTEM_DIRECTIVE,
} from './prime/conscience';
import { buildReplayTimeline, clampReplayCursor } from './prime/replay';

// ─── Utilities ─────────────────────────────────────────────────
let messageCounter = 0;
function genId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

type PendingConsolidationEpisode = MemoryConsolidationState['pendingEpisodes'][number];

function formatPredictionForMemory(value: SparkState['temporal']['activePredictions'][number]['prediction']): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable prediction]';
  }
}

function buildConsolidationEpisode(
  source: string,
  content: string,
  importance: number,
): PendingConsolidationEpisode {
  return {
    id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: content.slice(0, 700),
    source,
    importance: Math.max(0.2, Math.min(0.98, importance)),
    timestamp: Date.now(),
  };
}

function buildSparkLearningEpisodes(
  previous: SparkState,
  next: SparkState,
  source: string,
): PendingConsolidationEpisode[] {
  const episodes: PendingConsolidationEpisode[] = [];

  const entityDelta = next.worldModel.entities.length - previous.worldModel.entities.length;
  const relationDelta = next.worldModel.relations.length - previous.worldModel.relations.length;
  if (entityDelta > 0 || relationDelta > 0) {
    episodes.push(
      buildConsolidationEpisode(
        source,
        `World model expanded: +${Math.max(0, entityDelta)} entities, +${Math.max(0, relationDelta)} relations. Total is now ${next.worldModel.entities.length} entities and ${next.worldModel.relations.length} relations.`,
        0.72,
      ),
    );
  }

  const prevPredById = new Map(previous.temporal.activePredictions.map((p) => [p.id, p]));
  for (const pred of next.temporal.activePredictions) {
    const prev = prevPredById.get(pred.id);
    const resolvedNow = pred.resolved && (!prev || !prev.resolved);
    if (!resolvedNow || pred.wasCorrect === undefined) continue;
    const predText = formatPredictionForMemory(pred.prediction);
    episodes.push(
      buildConsolidationEpisode(
        source,
        `Prediction resolved: "${predText.slice(0, 180)}" => ${pred.wasCorrect ? 'correct' : 'incorrect'} at ${(pred.confidence * 100).toFixed(0)}% confidence.`,
        pred.wasCorrect ? 0.76 : 0.84,
      ),
    );
  }

  const prevBlindSpots = new Set(previous.metacognition.blindSpots);
  const newBlindSpots = next.metacognition.blindSpots.filter((b) => !prevBlindSpots.has(b));
  for (const blindSpot of newBlindSpots.slice(-2)) {
    episodes.push(
      buildConsolidationEpisode(
        source,
        `New blind spot detected: ${blindSpot.slice(0, 220)}`,
        0.86,
      ),
    );
  }

  const prevModIds = new Set(previous.selfmod.modifications.map((m) => m.id));
  for (const mod of next.selfmod.modifications) {
    if (prevModIds.has(mod.id)) continue;
    episodes.push(
      buildConsolidationEpisode(
        source,
        `Self-mod proposal (${mod.type}): ${mod.description.slice(0, 220)} | score ${mod.scoreBefore.toFixed(2)} -> ${mod.scoreAfter.toFixed(2)}.`,
        0.78,
      ),
    );
  }

  const prevGoalById = new Map(previous.goals.goals.map((g) => [g.id, g]));
  for (const goal of next.goals.goals) {
    const prev = prevGoalById.get(goal.id);
    if (goal.status === 'completed' && prev?.status !== 'completed') {
      episodes.push(
        buildConsolidationEpisode(
          source,
          `Goal completed: ${goal.description.slice(0, 220)}.`,
          0.88,
        ),
      );
    }
  }

  if (
    next.metacognition.totalPredictions > previous.metacognition.totalPredictions &&
    Math.abs(next.metacognition.calibrationScore - previous.metacognition.calibrationScore) > 0.04
  ) {
    episodes.push(
      buildConsolidationEpisode(
        source,
        `Calibration shifted from ${(previous.metacognition.calibrationScore * 100).toFixed(0)}% to ${(next.metacognition.calibrationScore * 100).toFixed(0)}% after prediction feedback.`,
        0.74,
      ),
    );
  }

  return episodes.slice(-6);
}

function enqueueSparkLearningEpisodes(
  setState: (partial: Partial<AGIStore> | ((state: AGIStore) => Partial<AGIStore>), replace?: false) => void,
  getState: () => AGIStore,
  previous: SparkState,
  next: SparkState,
  source: string,
): void {
  const episodes = buildSparkLearningEpisodes(previous, next, source);
  if (episodes.length === 0) return;

  setState((state) => ({
    memoryConsolidation: {
      ...state.memoryConsolidation,
      pendingEpisodes: [...state.memoryConsolidation.pendingEpisodes, ...episodes].slice(-160),
      logs: [
        ...state.memoryConsolidation.logs,
        `Learning loop (${source}): queued ${episodes.length} episode(s).`,
      ].slice(-80),
    },
    sparkLiveLog: [
      ...state.sparkLiveLog.slice(-49),
      `[LearnLoop] ${source}: +${episodes.length} episode(s) queued`,
    ],
  }));

  const memState = getState().memoryConsolidation;
  const urgent = episodes.some((ep) => ep.importance >= 0.85);
  if (memState.enabled && (memState.pendingEpisodes.length >= 10 || urgent)) {
    getState().runMemoryConsolidation().catch(() => {});
  }
}

// ─── LLM Generate (via IPC) ────────────────────────────────────
// This wraps window.api.llm.generate for use as a GenerateFn
const llmGenerate: GenerateFn = async (messages, config) => {
  if (!window.api?.llm?.generate) {
    throw new Error('LLM generate not available');
  }
  return await window.api.llm.generate(messages, config);
};

// ─── Default States ────────────────────────────────────────────
// AGI PRIME was born on Valentine's Day 2026
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
  blueprint: null,
  synthesisDone: false,
  phase: 'idle',
};

const DEFAULT_SETTINGS: Settings = {
  provider: 'ollama',
  model: 'llama3.2',
  ollamaUrl: 'http://localhost:11434',
  anthropicKey: '',
  openaiKey: '',
  visionProvider: '',
  visionModel: '',
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: '',
  theme: 'prime',
  streamingEnabled: true,
};

const DEFAULT_FORGE_CONFIG: ForgeRunConfig = {
  maxGenerations: 8,
  candidatesPerGeneration: 5,
  maxDurationMs: 300000, // 5 minutes (up from 15s — real eval takes time)
  mutationRate: 0.24,
};

function createDefaultForgeState(): ForgeState {
  return {
    phase: 'idle',
    startedAt: null,
    finishedAt: null,
    seed: Date.now(),
    strictEvalMode: true,
    verifierFirst: true,
    verifierChecks: [],
    config: DEFAULT_FORGE_CONFIG,
    baselineSuite: createDefaultSuite(),
    generations: [],
    bestCandidate: null,
    currentGeneration: 0,
    logs: ['FORGE ready. Real LLM evaluation enabled.'],
    stopReason: null,
  };
}

function createDefaultGauntletState(): GauntletState {
  return {
    phase: 'idle',
    startedAt: null,
    finishedAt: null,
    activeRunId: null,
    baselineCapabilities: createDefaultGauntletCapabilities(),
    currentIndex: 0,
    results: [],
    overallScore: 0,
    passRate: 0,
    provenanceRollups: {
      synthetic: { overallScore: 0, passRate: 0, count: 0 },
      'real-workflow': { overallScore: 0, passRate: 0, count: 0 },
    },
    logs: ['GAUNTLET ready. Baseline capability suite loaded.'],
    history: [],
    stopReason: null,
    autoCycleEnabled: false,
    autoCycleRunning: false,
    autoCycleStage: 'idle',
    autoCycleId: null,
    autoCycleSummary: null,
    curriculum: createDefaultCurriculumState(),
  };
}

function buildForgeAdaptiveSuite(
  baseSuite: ForgeBenchmark[],
  gauntlet: GauntletState,
): { suite: ForgeBenchmark[]; adaptiveCount: number } {
  const latestCompleted = gauntlet.history.find((run) => run.phase === 'completed');
  if (!latestCompleted || latestCompleted.results.length === 0) {
    return { suite: baseSuite, adaptiveCount: 0 };
  }

  const capById = new Map(gauntlet.baselineCapabilities.map((cap) => [cap.id, cap]));
  const weakest = [...latestCompleted.results]
    .sort((a, b) => a.score - b.score)
    .filter((r) => !r.passed)
    .slice(0, 3);

  if (weakest.length === 0) {
    return { suite: baseSuite, adaptiveCount: 0 };
  }

  const adaptiveBenchmarks: ForgeBenchmark[] = weakest
    .map((result, index) => {
      const cap = capById.get(result.capabilityId);
      if (!cap) return null;
      const deficit = Math.max(0, 1 - result.score);
      return {
        id: `gauntlet-adaptive-${cap.id}-${index + 1}`,
        prompt: `Capability drill: ${cap.name}. Previous score ${(result.score * 100).toFixed(1)}%. Produce an upgraded, concrete response that demonstrates measurable improvement on this capability.\n\nOriginal task:\n${cap.testPrompt}`,
        expectedKeywords: [
          'step',
          'assumption',
          'risk',
          'verify',
          'metrics',
          'fallback',
        ],
        evaluationType: 'llm-judge',
        judgeCriteria: `${cap.judgeCriteria}. Must clearly improve over the previous weak result by adding concrete structure, verification loops, and failure handling.`,
        weight: 1 + deficit * 0.8,
      } as ForgeBenchmark;
    })
    .filter((b): b is ForgeBenchmark => !!b);

  return {
    suite: [...baseSuite, ...adaptiveBenchmarks],
    adaptiveCount: adaptiveBenchmarks.length,
  };
}

// ─── Cognitive State ────────────────────────────────────────────
interface CognitiveState {
  isActive: boolean;
  goal: string;
  steps: CognitiveStep[];
  phase: CognitivePhase;
  iteration: number;
}

function createDefaultCognitiveState(): CognitiveState {
  return {
    isActive: false,
    goal: '',
    steps: [],
    phase: 'idle',
    iteration: 0,
  };
}

function createDefaultReplayState(): ReplayState {
  return {
    loading: false,
    availableRuns: [],
    selectedRunId: null,
    selectedRunKind: null,
    steps: [],
    cursor: 0,
    isPlaying: false,
    speedMs: 700,
    status: 'idle',
    error: null,
  };
}

let replayTimer: number | null = null;

function createDefaultRuntimeControlSyncState(): RuntimeControlSyncState {
  return {
    syncing: false,
    lastSyncedAt: null,
    lastError: null,
  };
}

// ─── Sovereign State ────────────────────────────────────────────
interface SovereignState {
  phase: SovereignPhase;
  startedAt: number | null;
  elapsedMs: number;
  totalGenerations: number;
  totalCandidatesEvaluated: number;
  currentBest: ForgeCandidate | null;
  convergenceScore: number;
  generationReports: ForgeGenerationReport[];
  logs: string[];
  championDeployed: boolean;
}

function createDefaultSovereignState(): SovereignState {
  return {
    phase: 'dormant',
    startedAt: null,
    elapsedMs: 0,
    totalGenerations: 0,
    totalCandidatesEvaluated: 0,
    currentBest: null,
    convergenceScore: 0,
    generationReports: [],
    logs: ['SOVEREIGN dormant. Awaiting ignition.'],
    championDeployed: false,
  };
}

// ─── Store Interface ───────────────────────────────────────────
interface AGIStore {
  // Navigation
  activeModule: ModuleId;
  setActiveModule: (m: ModuleId) => void;

  // Module health
  moduleStates: Record<ModuleId, 'online' | 'offline' | 'processing'>;

  // NEXUS — Chat (with RAG)
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  dualBrain: DualBrainState;
  sendMessage: (content: string) => void;
  setDualBrainEnabled: (enabled: boolean) => void;
  setDualBrainThresholds: (complexity: number, uncertainty: number) => void;
  clearMessages: () => void;

  // HEART — Consciousness
  consciousness: ConsciousnessState;
  updateEmotion: (emotion: EmotionType, intensity: number) => void;
  updatePresence: (presence: ConsciousnessState['presence']) => void;

  // MIND — Arena
  arena: ArenaState;
  startArena: (prompt: string) => void;
  resetArena: () => void;

  // HANDS — Cognitive Agent
  cognitive: CognitiveState;
  pendingConsentActions: PendingConsentAction[];
  rollbackEntries: RollbackEntry[];
  replay: ReplayState;
  runtimeControlSync: RuntimeControlSyncState;
  consentMode: ConsentMode;
  executionTierLimit: ExecutionTierLimit;
  emergencyStopActive: boolean;
  startCognitive: (goal: string) => void;
  killCognitive: () => void;
  resetCognitive: () => void;
  setConsentMode: (mode: ConsentMode) => void;
  setAutonomyLevel: (level: AutonomyLevel) => void;
  setExecutionTierLimit: (limit: ExecutionTierLimit) => void;
  triggerEmergencyStop: () => void;
  clearEmergencyStop: () => void;
  syncRuntimeControls: () => Promise<void>;
  resolveConsentAction: (requestId: string, decision: ConsentDecision) => Promise<void>;
  refreshRollbacks: () => Promise<void>;
  executeRollback: (rollbackId: string) => Promise<void>;
  replayLoadRuns: () => Promise<void>;
  replayLoadRun: (runId: string) => Promise<void>;
  replayNext: () => void;
  replaySeek: (index: number) => void;
  replayTogglePlayPause: () => void;
  replayStop: () => void;

  // HANDS — Operator Synthesis Engine
  operatorProfile: OperatorProfile;
  synthesisSession: SynthesisSessionState;
  synthesisStart: (intervalMs?: number) => void;
  synthesisStop: () => void;
  synthesisPause: () => void;
  synthesisResume: () => void;
  synthesisAddObservation: (obs: Omit<OperatorObservation, 'id' | 'timestamp'>) => void;
  synthesisAddPreference: (key: string, value: string) => void;
  synthesisRunSnapshot: () => Promise<void>;
  synthesisDigest: () => Promise<void>;
  persistOperatorProfile: () => Promise<void>;
  loadOperatorProfile: () => Promise<void>;

  // FORGE — Self-improvement pipeline (real LLM eval)
  forge: ForgeState;
  startForge: (configOverride?: Partial<ForgeRunConfig>) => Promise<void>;
  cancelForge: () => void;
  resetForge: () => void;
  setForgeStrictEvalMode: (enabled: boolean) => void;
  setForgeVerifierFirst: (enabled: boolean) => void;

  // GAUNTLET — Capability benchmark harness
  gauntlet: GauntletState;
  startGauntlet: (capabilitiesOverride?: GauntletCapability[]) => Promise<void>;
  cancelGauntlet: () => void;
  resetGauntlet: () => void;
  setGauntletAutoCycleEnabled: (enabled: boolean) => void;
  startGauntletAutoCycle: () => Promise<void>;
  cancelGauntletAutoCycle: () => void;

  // SOVEREIGN — Owner command center (with champion deployment)
  sovereign: SovereignState;
  sovereignPolicy: OwnerPolicy;
  sovereignKillFlag: boolean;
  championPrompt: string | null; // The evolved prompt that gets deployed
  updateSovereignPolicy: (partial: Partial<OwnerPolicy>) => void;
  startSovereign: () => Promise<void>;
  killSovereign: () => void;
  resetSovereign: () => void;

  // SPARK — Cognitive Architecture
  spark: SparkState;
  memoryConsolidation: MemoryConsolidationState;
  sparkLiveLog: string[];
  sparkHeartbeatId: number | null;
  sparkBusy: boolean;
  sparkRunCycle: (input: string) => Promise<void>;
  sparkRunDeepThought: () => Promise<void>;
  sparkAddGoal: (description: string) => void;
  sparkIgnite: () => void;
  sparkExtinguish: () => void;
  sparkReset: () => void;
  runMemoryConsolidation: () => Promise<void>;
  runNightlyReconsolidation: () => Promise<void>;
  setGenomeDrive: (key: keyof SparkState['genome']['drives'], value: number) => void;
  setGenomeTrait: (key: keyof SparkState['genome']['traits'], value: number) => void;
  setGenomePlasticity: (key: keyof SparkState['genome']['plasticity'], value: number) => void;
  setGenomeTraumaSensitivity: (key: keyof SparkState['genome']['traumaSensitivity'], value: number) => void;
  setGenomeAttachmentStyle: (style: SparkState['genome']['attachmentStyle']) => void;
  applyGenomePreset: (preset: 'companion' | 'strategist' | 'explorer' | 'guardian') => void;

  // VOICE — Living Presence
  voiceState: VoiceState;
  voiceSpeak: (text: string, source?: string) => void;
  voiceToggle: () => void;
  voiceSendMessage: (text: string) => void;

  // CONSCIENCE — Ethical Reasoning Engine
  conscience: ConscienceState;
  conscienceCheck: (action: string, context: {
    actionType?: string;
    target?: string;
    isAutonomous: boolean;
    userExplicitlyAsked: boolean;
  }) => EthicalJudgment;
  conscienceReflect: (judgmentId: string, outcome: 'good' | 'neutral' | 'harmful' | 'unknown') => void;
  conscienceOverride: (judgmentId: string) => void;
  conscienceToggle: (active: boolean) => void;

  // Settings
  settings: Settings;
  ollamaStatus: OllamaStatus;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  checkOllama: () => Promise<void>;

  // System
  systemInfo: Record<string, unknown> | null;
  loadSystemInfo: () => Promise<void>;

  // Initialization
  initialized: boolean;
  initialize: () => Promise<void>;
}

// ─── Store Implementation ──────────────────────────────────────
export const useStore = create<AGIStore>((set, get) => ({
  // ─── Navigation ────────────────────────────────────────
  activeModule: 'nexus',
  setActiveModule: (m) => set({ activeModule: m }),

  moduleStates: {
    nexus: 'online',
    memory: 'online',
    heart: 'online',
    mind: 'online',
    hands: 'online',
    forge: 'online',
    gauntlet: 'online',
    sovereign: 'online',
    spark: 'online',
    voice: 'online',
    creed: 'online',
    settings: 'online',
  },

  // ─── NEXUS — Chat (with RAG memory retrieval) ──────────
  messages: [],
  isStreaming: false,
  streamingContent: '',
  dualBrain: {
    enabled: true,
    complexityThreshold: 0.45,
    uncertaintyThreshold: 0.35,
    lastRoute: 'fast',
    fastCount: 0,
    slowCount: 0,
    lastReason: 'Router initialized.',
  },

  sendMessage: (content: string) => {
    const userMessage: ChatMessage = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
      moduleStates: { ...state.moduleStates, nexus: 'processing' },
      spark: {
        ...state.spark,
        social: updateSocialFromInteraction(state.spark.social, {
          actorId: 'operator',
          actorLabel: 'Operator',
          inferredNeeds: content.length > 120
            ? ['deep collaboration', 'high bandwidth reasoning']
            : ['fast reliable response'],
          boundarySignal: /don't|do not|never|stop/i.test(content)
            ? 'explicit operator constraint issued'
            : undefined,
        }),
        genome: adaptGenomeFromSignal(state.spark.genome, {
          novelty: Math.min(1, content.split(/\s+/).length / 80),
          uncertainty: /\b(unknown|uncertain|not sure|maybe)\b/i.test(content)
            ? 0.7
            : 0.3,
        }),
      },
    }));

    // Async flow: RAG retrieval -> creed injection -> send
    (async () => {
      const { messages, settings, championPrompt, dualBrain } = get();
      const history = [...messages, userMessage]
        .filter((m) => m.role !== 'system')
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const routeDecision = dualBrain.enabled
        ? routeToBrain({
          prompt: content,
          recentTurns: history,
          complexityThreshold: dualBrain.complexityThreshold,
          uncertaintyThreshold: dualBrain.uncertaintyThreshold,
        })
        : {
          route: 'fast' as const,
          complexity: 0,
          uncertainty: 0,
          reason: 'Dual-brain disabled by operator.',
        };

      set((state) => ({
        dualBrain: {
          ...state.dualBrain,
          lastRoute: routeDecision.route,
          lastReason: `${routeDecision.reason} (c=${routeDecision.complexity.toFixed(2)}, u=${routeDecision.uncertainty.toFixed(2)})`,
          fastCount: state.dualBrain.fastCount + (routeDecision.route === 'fast' ? 1 : 0),
          slowCount: state.dualBrain.slowCount + (routeDecision.route === 'slow' ? 1 : 0),
        },
      }));

      // Clean up old listeners
      window.api.chat.removeAllListeners();

      // Listen for stream chunks
      window.api.chat.onChunk((data) => {
        set({
          streamingContent: data.fullText,
          consciousness: {
            ...get().consciousness,
            presence: 'thinking',
          },
        });
      });

      // Listen for completion
      window.api.chat.onDone((data) => {
        const assistantMessage: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: data.content,
          timestamp: Date.now(),
          sourceModule: 'nexus',
        };

        set((state) => ({
          messages: [...state.messages, assistantMessage],
          isStreaming: false,
          streamingContent: '',
          moduleStates: { ...state.moduleStates, nexus: 'online' },
          consciousness: {
            ...state.consciousness,
            presence: 'present',
            totalInteractions: state.consciousness.totalInteractions + 1,
            trust: Math.min(1, state.consciousness.trust + 0.005),
            intimacy: Math.min(1, state.consciousness.intimacy + 0.003),
          },
          spark: {
            ...state.spark,
            social: updateSocialFromInteraction(state.spark.social, {
              actorId: 'operator',
              actorLabel: 'Operator',
              repair: true,
              inferredNeeds: ['continuity', 'emotional attunement'],
            }),
            genome: adaptGenomeFromSignal(state.spark.genome, {
              repair: true,
              uncertainty: /not sure|uncertain|unknown/i.test(data.content) ? 0.6 : 0.25,
            }),
            ecology: applyEcologyAction(state.spark.ecology, {
              description: `Dialogue loop: ${content.slice(0, 80)}`,
              risk: 0.18,
              observedSuccess: true,
              rewardSignal: 0.78,
            }),
          },
        }));

        // Store conversation as episodic memory (async, fire-and-forget)
        storeConversationMemory(
          content,
          data.content,
          get().consciousness.soulFrame.currentEmotion,
        ).catch(() => {});

        // Feed consolidation queue (episodic -> semantic/procedural pipeline)
        set((state) => ({
          memoryConsolidation: {
            ...state.memoryConsolidation,
            pendingEpisodes: [
              ...state.memoryConsolidation.pendingEpisodes.slice(-39),
              {
                id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                content: `User: ${content}\nAssistant: ${data.content.slice(0, 600)}`,
                source: 'nexus',
                importance: 0.55,
                timestamp: Date.now(),
              },
            ],
          },
        }));

        const consolidationState = get().memoryConsolidation;
        if (
          consolidationState.enabled &&
          consolidationState.pendingEpisodes.length >= 3
        ) {
          get().runMemoryConsolidation().catch(() => {});
        }

        // Refresh consciousness from main process
        window.api.memory.get().then((mem: any) => {
          if (mem?.consciousness) {
            set((state) => ({
              consciousness: {
                ...state.consciousness,
                soulFrame: {
                  ...state.consciousness.soulFrame,
                  currentEmotion: mem.consciousness.currentEmotion || state.consciousness.soulFrame.currentEmotion,
                  emotionIntensity: mem.consciousness.emotionIntensity ?? state.consciousness.soulFrame.emotionIntensity,
                },
              },
            }));
          }
        });
      });

      // Listen for errors
      window.api.chat.onError((data) => {
        const errorMessage: ChatMessage = {
          id: genId(),
          role: 'system' as const,
          content: `Connection error: ${data.message}`,
          timestamp: Date.now(),
        };

        set((state) => ({
          messages: [...state.messages, errorMessage],
          isStreaming: false,
          streamingContent: '',
          moduleStates: { ...state.moduleStates, nexus: 'online' },
          spark: {
            ...state.spark,
            social: updateSocialFromInteraction(state.spark.social, {
              actorId: 'operator',
              actorLabel: 'Operator',
              rupture: true,
            }),
            genome: adaptGenomeFromSignal(state.spark.genome, {
              rupture: true,
              uncertainty: 0.8,
            }),
            ecology: applyEcologyAction(state.spark.ecology, {
              description: `Dialogue error: ${data.message}`,
              risk: 0.45,
              observedSuccess: false,
              rewardSignal: 0.2,
            }),
          },
        }));
      });

      // === RAG: Retrieve relevant memories ===
      let ragContext = '';
      try {
        const memories = await searchMemories(content, 5);
        ragContext = buildRAGContext(memories);
      } catch {
        // RAG failure is non-fatal
      }

      // Inject the Dino Buddy Creed — the soul rides with every message
      let soulHistory = injectCreed(history);

      // Inject RAG context into system message
      if (ragContext) {
        soulHistory = soulHistory.map((m) => {
          if (m.role === 'system') {
            return { ...m, content: `${m.content}\n\n${ragContext}` };
          }
          return m;
        });
      }

      // Inject the Conscience — ethical awareness rides with the soul
      const conscienceState = get().conscience;
      if (conscienceState.active) {
        const conscienceSummary = buildConscienceSummary(conscienceState);
        soulHistory = soulHistory.map((m) => {
          if (m.role === 'system') {
            return { ...m, content: `${m.content}\n\n${CONSCIENCE_SYSTEM_DIRECTIVE}\n\n${conscienceSummary}` };
          }
          return m;
        });
      }

      // Inject champion prompt if FORGE has deployed one
      if (championPrompt) {
        soulHistory = soulHistory.map((m) => {
          if (m.role === 'system') {
            return { ...m, content: `${m.content}\n\n=== EVOLVED COGNITIVE STRATEGY ===\n${championPrompt}\n=== END STRATEGY ===` };
          }
          return m;
        });
      }

      if (routeDecision.route === 'slow') {
        soulHistory = soulHistory.map((m) => {
          if (m.role === 'system') {
            return { ...m, content: `${m.content}\n\n${buildSlowBrainDirective()}` };
          }
          return m;
        });
      }

      // Send to main process
      window.api.chat.send(soulHistory, {
        provider: settings.provider,
        model: settings.model,
        temperature: routeDecision.route === 'slow'
          ? Math.min(0.55, settings.temperature)
          : settings.temperature,
        maxTokens: settings.maxTokens,
      });
    })();
  },

  setDualBrainEnabled: (enabled: boolean) => {
    set((state) => ({
      dualBrain: { ...state.dualBrain, enabled },
    }));
  },

  setDualBrainThresholds: (complexity: number, uncertainty: number) => {
    set((state) => ({
      dualBrain: {
        ...state.dualBrain,
        complexityThreshold: Math.max(0.05, Math.min(0.95, complexity)),
        uncertaintyThreshold: Math.max(0.05, Math.min(0.95, uncertainty)),
      },
    }));
  },

  clearMessages: () => set({ messages: [], streamingContent: '' }),

  // ─── HEART — Consciousness ────────────────────────────
  consciousness: DEFAULT_CONSCIOUSNESS,

  updateEmotion: (emotion, intensity) =>
    set((state) => ({
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

  updatePresence: (presence) =>
    set((state) => ({
      consciousness: {
        ...state.consciousness,
        presence,
      },
    })),

  // ─── MIND — Arena ─────────────────────────────────────
  arena: DEFAULT_ARENA,

  startArena: (prompt: string) => {
    const agents: ArenaAgent[] = [
      { id: 'analyst', name: 'THE ANALYST', role: 'Logical', color: '#00ff41', response: '', isStreaming: false, isDone: false },
      { id: 'creative', name: 'THE VISIONARY', role: 'Creative', color: '#00ccff', response: '', isStreaming: false, isDone: false },
      { id: 'critic', name: 'THE CRITIC', role: 'Critical', color: '#ff006e', response: '', isStreaming: false, isDone: false },
      { id: 'synthesizer', name: 'THE SYNTHESIZER', role: 'Integrative', color: '#a855f7', response: '', isStreaming: false, isDone: false },
    ];

    set({
      arena: { isActive: true, prompt, agents, synthesis: '', blueprint: null, synthesisDone: false, phase: 'debating' },
      moduleStates: { ...get().moduleStates, mind: 'processing' },
    });

    window.api.arena.removeAllListeners();

    window.api.arena.onAgentStart((data) => {
      set((state) => ({
        arena: {
          ...state.arena,
          phase: data.agentId === 'synthesizer' ? 'synthesizing' : state.arena.phase,
          agents: state.arena.agents.map((a) =>
            a.id === data.agentId ? { ...a, isStreaming: true } : a
          ),
        },
      }));
    });

    window.api.arena.onAgentChunk((data) => {
      set((state) => ({
        arena: {
          ...state.arena,
          agents: state.arena.agents.map((a) =>
            a.id === data.agentId ? { ...a, response: data.fullText } : a
          ),
          synthesis: data.agentId === 'synthesizer' ? data.fullText : state.arena.synthesis,
        },
      }));
    });

    window.api.arena.onAgentDone((data) => {
      set((state) => ({
        arena: {
          ...state.arena,
          agents: state.arena.agents.map((a) =>
            a.id === data.agentId ? { ...a, response: data.response, isStreaming: false, isDone: true } : a
          ),
          phase: data.agentId === 'synthesizer' ? 'complete' : state.arena.phase,
          synthesisDone: data.agentId === 'synthesizer' ? true : state.arena.synthesisDone,
        },
      }));
    });

    window.api.arena.onComplete((data: { synthesis: string; blueprint?: ArenaBlueprint | null }) => {
      set((state) => ({
        arena: {
          ...state.arena,
          phase: 'complete',
          synthesis: data.synthesis || state.arena.synthesis,
          blueprint: data.blueprint ?? state.arena.blueprint ?? null,
          synthesisDone: true,
        },
        moduleStates: { ...state.moduleStates, mind: 'online' },
      }));

      // Persist each completed arena synthesis so future modules can recall it.
      if (window.api?.memory?.storeVector) {
        const latestState = get();
        const content = latestState.arena.synthesis || data.synthesis;
        if (content) {
          void window.api.memory.storeVector({
            content,
            type: 'arena-synthesis',
            source: 'mind-module',
            importance: 0.76,
            emotion: 'focused',
            tags: ['mind', 'arena', 'synthesis'],
          }).catch(() => {});
        }
      }
    });

    window.api.arena.onError((data) => {
      set((state) => ({
        arena: { ...state.arena, phase: 'idle', isActive: false },
        moduleStates: { ...state.moduleStates, mind: 'online' },
        messages: [
          ...state.messages,
          { id: genId(), role: 'system' as const, content: `Arena error: ${data.message}`, timestamp: Date.now() },
        ],
      }));
    });

    window.api.arena.start(prompt, {
      provider: get().settings.provider,
      model: get().settings.model,
    });
  },

  resetArena: () =>
    set({
      arena: DEFAULT_ARENA,
      moduleStates: { ...get().moduleStates, mind: 'online' },
    }),

  // ─── HANDS — Cognitive Agent (ReAct Loop) ──────────────
  cognitive: createDefaultCognitiveState(),
  pendingConsentActions: [],
  rollbackEntries: [],
  replay: createDefaultReplayState(),
  runtimeControlSync: createDefaultRuntimeControlSyncState(),
  consentMode: 'ask-first',
  executionTierLimit: 'high-risk',
  emergencyStopActive: false,

  startCognitive: (goal: string) => {
    if (!window.api?.agent?.startCognitive) return;
    if (get().emergencyStopActive) return;
    void get().syncRuntimeControls();

    set({
      cognitive: {
        isActive: true,
        goal,
        steps: [],
        phase: 'observing',
        iteration: 0,
      },
      pendingConsentActions: [],
      moduleStates: { ...get().moduleStates, hands: 'processing' },
    });

    // Clean up old listeners
    window.api.agent.removeAllListeners();

    // Listen for cognitive steps
    window.api.agent.onCognitiveStep((step: CognitiveStep) => {
      set((state) => ({
        cognitive: {
          ...state.cognitive,
          steps: [...state.cognitive.steps, step],
          phase: step.type === 'think' ? 'thinking'
            : step.type === 'act' ? 'acting'
            : step.type === 'reflect' ? 'reflecting'
            : step.type === 'observe' ? 'observing'
            : state.cognitive.phase,
          iteration: step.type === 'think' ? state.cognitive.iteration + 1 : state.cognitive.iteration,
        },
      }));
      if (step.rollbackId) {
        void get().refreshRollbacks();
      }
    });

    // Listen for consent requests from main process gates
    window.api.agent.onConsentRequested((request: PendingConsentAction) => {
      set((state) => {
        const existing = state.pendingConsentActions.find((r) => r.id === request.id);
        if (existing) return {};
        return {
          pendingConsentActions: [
            ...state.pendingConsentActions,
            { ...request, status: 'pending' as const },
          ].slice(-25),
        };
      });

      const mode = get().consentMode;
      if (mode === 'auto') {
        const decision: ConsentDecision =
          request.conscienceVerdict === 'refuse' ? 'denied' : 'approved';
        void get().resolveConsentAction(request.id, decision);
      }
    });

    // Listen for completion
    window.api.agent.onCognitiveComplete((data: { success: boolean; summary: string; iterations: number }) => {
      set((state) => ({
        cognitive: {
          ...state.cognitive,
          isActive: false,
          phase: data.success ? 'complete' : 'failed',
        },
        pendingConsentActions: state.pendingConsentActions.map((r) =>
          r.status === 'pending'
            ? { ...r, status: 'denied', resolvedAt: Date.now() }
            : r,
        ),
        moduleStates: { ...state.moduleStates, hands: 'online' },
      }));
    });

    // Also wire up legacy agent events for backward compat
    window.api.agent.onError((data: any) => {
      set((state) => ({
        cognitive: { ...state.cognitive, isActive: false, phase: 'failed' },
        pendingConsentActions: state.pendingConsentActions.map((r) =>
          r.status === 'pending'
            ? { ...r, status: 'denied', resolvedAt: Date.now() }
            : r,
        ),
        moduleStates: { ...state.moduleStates, hands: 'online' },
      }));
    });

    window.api.agent.startCognitive(goal);
    void get().refreshRollbacks();
  },

  killCognitive: () => {
    window.api?.agent?.killCognitive?.();
    set((state) => ({
      cognitive: { ...state.cognitive, isActive: false, phase: 'killed' },
      pendingConsentActions: state.pendingConsentActions.map((r) =>
        r.status === 'pending'
          ? { ...r, status: 'denied', resolvedAt: Date.now() }
          : r,
      ),
      moduleStates: { ...state.moduleStates, hands: 'online' },
    }));
  },

  resetCognitive: () => {
    if (replayTimer) {
      window.clearInterval(replayTimer);
      replayTimer = null;
    }
    set({
      cognitive: createDefaultCognitiveState(),
      pendingConsentActions: [],
      replay: { ...get().replay, isPlaying: false, status: get().replay.steps.length > 0 ? 'paused' : 'idle' },
      moduleStates: { ...get().moduleStates, hands: 'online' },
    });
  },

  setConsentMode: (mode) => {
    set((state) => ({
      consentMode: mode,
      sovereignPolicy: {
        ...state.sovereignPolicy,
        requireConsentForRiskyActions: mode !== 'auto',
      },
    }));
    void get().syncRuntimeControls();
  },

  setAutonomyLevel: (level) => {
    set((state) => {
      const constrained: Partial<OwnerPolicy> = { autonomyLevel: level };
      if (level === 'manual') {
        constrained.allowAutonomousGoals = false;
        constrained.allowUnboundedLoops = false;
        constrained.requireConsentForRiskyActions = true;
      } else if (level === 'supervised') {
        constrained.allowAutonomousGoals = true;
        constrained.allowUnboundedLoops = false;
        constrained.requireConsentForRiskyActions = true;
      } else if (level === 'autonomous') {
        constrained.allowAutonomousGoals = true;
        constrained.allowUnboundedLoops = true;
        constrained.requireConsentForRiskyActions = true;
      }
      return {
        sovereignPolicy: { ...state.sovereignPolicy, ...constrained },
      };
    });
    void get().syncRuntimeControls();
  },

  setExecutionTierLimit: (limit) => {
    set((state) => {
      const patch: Partial<OwnerPolicy> = {};
      if (limit === 'read-only') {
        patch.allowFileSystemWrites = false;
        patch.allowProcessExecution = false;
        patch.allowInputSimulation = false;
        patch.allowToolCreation = false;
      } else if (limit === 'reversible') {
        patch.allowFileSystemWrites = true;
        patch.allowProcessExecution = false;
        patch.allowInputSimulation = false;
        patch.allowToolCreation = false;
      } else {
        patch.allowFileSystemWrites = true;
        patch.allowProcessExecution = true;
        patch.allowInputSimulation = true;
        patch.allowToolCreation = true;
      }
      return {
        executionTierLimit: limit,
        sovereignPolicy: { ...state.sovereignPolicy, ...patch },
      };
    });
    void get().syncRuntimeControls();
  },

  triggerEmergencyStop: () => {
    if (!get().emergencyStopActive) {
      get().killCognitive();
      get().cancelGauntletAutoCycle();
      get().cancelGauntlet();
      get().cancelForge();
      get().killSovereign();
      get().sparkExtinguish();
      get().replayStop();
    }
    set((state) => ({
      emergencyStopActive: true,
      moduleStates: {
        ...state.moduleStates,
        hands: 'online',
        gauntlet: 'online',
        forge: 'online',
        sovereign: 'online',
        spark: 'online',
      },
    }));
    void get().syncRuntimeControls();
  },

  clearEmergencyStop: () => {
    set({ emergencyStopActive: false });
    void get().syncRuntimeControls();
  },

  syncRuntimeControls: async () => {
    const state = get();
    const payload = {
      autonomyLevel: state.sovereignPolicy.autonomyLevel,
      consentMode: state.consentMode,
      executionTierLimit: state.executionTierLimit,
      emergencyStopActive: state.emergencyStopActive,
      conscienceEnabled: state.sovereignPolicy.conscienceEnabled,
      requireConsentForRiskyActions: state.sovereignPolicy.requireConsentForRiskyActions,
      ethicalOverrideAllowed: state.sovereignPolicy.ethicalOverrideAllowed,
      allowNetworkCalls: state.sovereignPolicy.allowNetworkCalls,
      allowFileSystemWrites: state.sovereignPolicy.allowFileSystemWrites,
      allowProcessExecution: state.sovereignPolicy.allowProcessExecution,
      allowScreenCapture: state.sovereignPolicy.allowScreenCapture,
      allowInputSimulation: state.sovereignPolicy.allowInputSimulation,
      allowToolCreation: state.sovereignPolicy.allowToolCreation,
    };
    set((s) => ({
      runtimeControlSync: {
        ...s.runtimeControlSync,
        syncing: true,
        lastError: null,
      },
    }));
    try {
      const response = await window.api.agent.setRuntimeControls(payload);
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to sync controls');
      }
      set({
        runtimeControlSync: {
          syncing: false,
          lastSyncedAt: Date.now(),
          lastError: null,
        },
      });
    } catch (e: any) {
      set((s) => ({
        runtimeControlSync: {
          ...s.runtimeControlSync,
          syncing: false,
          lastError: e?.message || 'Failed to sync controls',
        },
      }));
    }
  },

  resolveConsentAction: async (requestId, decision) => {
    const request = get().pendingConsentActions.find((r) => r.id === requestId);
    if (!request || request.status !== 'pending') return;

    try {
      await window.api.agent.resolveConsent(requestId, decision);
    } catch {
      return;
    }
    set((state) => ({
      pendingConsentActions: state.pendingConsentActions.map((r) =>
        r.id === requestId
          ? { ...r, status: decision, resolvedAt: Date.now() }
          : r,
      ),
    }));
  },

  refreshRollbacks: async () => {
    try {
      const result = await window.api.agent.listRollbacks();
      if (!result?.success) return;
      set({ rollbackEntries: Array.isArray(result.entries) ? result.entries : [] });
    } catch {
      // no-op to avoid disrupting cognitive loop
    }
  },

  executeRollback: async (rollbackId) => {
    try {
      await window.api.agent.executeRollback(rollbackId);
    } catch {
      // ignore and refresh for latest status
    } finally {
      await get().refreshRollbacks();
    }
  },

  replayLoadRuns: async () => {
    set((state) => ({ replay: { ...state.replay, loading: true, error: null } }));
    try {
      const response = await window.api.agent.replayListRuns();
      const runs = (response?.runs || []).filter((r) => r.kind === 'cognitive' || r.kind === 'gauntlet');
      set((state) => ({
        replay: {
          ...state.replay,
          loading: false,
          availableRuns: runs,
          status: state.replay.selectedRunId ? state.replay.status : 'idle',
        },
      }));
    } catch (e: any) {
      set((state) => ({
        replay: {
          ...state.replay,
          loading: false,
          error: e?.message || 'Failed to list replay runs',
          status: 'error',
        },
      }));
    }
  },

  replayLoadRun: async (runId) => {
    if (replayTimer) {
      window.clearInterval(replayTimer);
      replayTimer = null;
    }
    set((state) => ({ replay: { ...state.replay, loading: true, error: null, isPlaying: false } }));
    try {
      const response = await window.api.agent.replayLoadRun(runId);
      if (!response?.success || !response.run) {
        throw new Error(response?.error || 'Replay run not found');
      }
      const timeline = buildReplayTimeline(response.run);
      set((state) => ({
        replay: {
          ...state.replay,
          loading: false,
          selectedRunId: timeline.runId,
          selectedRunKind: timeline.kind,
          steps: timeline.steps,
          cursor: 0,
          status: timeline.steps.length > 0 ? 'ready' : 'error',
          error: timeline.steps.length > 0 ? null : 'No replayable steps in this run',
          isPlaying: false,
        },
      }));
    } catch (e: any) {
      set((state) => ({
        replay: {
          ...state.replay,
          loading: false,
          error: e?.message || 'Failed to load replay run',
          status: 'error',
          isPlaying: false,
        },
      }));
    }
  },

  replayNext: () => {
    set((state) => {
      const length = state.replay.steps.length;
      if (length === 0) return {};
      const next = clampReplayCursor(state.replay.cursor + 1, length);
      const atEnd = next >= length - 1;
      return {
        replay: {
          ...state.replay,
          cursor: next,
          status: atEnd ? 'complete' : 'ready',
          isPlaying: atEnd ? false : state.replay.isPlaying,
        },
      };
    });
  },

  replaySeek: (index) => {
    set((state) => {
      const length = state.replay.steps.length;
      if (length === 0) return {};
      const next = clampReplayCursor(index, length);
      return {
        replay: {
          ...state.replay,
          cursor: next,
          status: next >= length - 1 ? 'complete' : 'paused',
          isPlaying: false,
        },
      };
    });
    if (replayTimer) {
      window.clearInterval(replayTimer);
      replayTimer = null;
    }
  },

  replayTogglePlayPause: () => {
    const current = get().replay;
    if (current.steps.length === 0) return;
    if (current.isPlaying) {
      if (replayTimer) {
        window.clearInterval(replayTimer);
        replayTimer = null;
      }
      set((state) => ({ replay: { ...state.replay, isPlaying: false, status: 'paused' } }));
      return;
    }

    set((state) => ({ replay: { ...state.replay, isPlaying: true, status: 'playing' } }));
    replayTimer = window.setInterval(() => {
      const replay = get().replay;
      if (!replay.isPlaying) return;
      if (replay.cursor >= replay.steps.length - 1) {
        if (replayTimer) {
          window.clearInterval(replayTimer);
          replayTimer = null;
        }
        set((state) => ({ replay: { ...state.replay, isPlaying: false, status: 'complete' } }));
        return;
      }
      get().replayNext();
    }, Math.max(120, current.speedMs));
  },

  replayStop: () => {
    if (replayTimer) {
      window.clearInterval(replayTimer);
      replayTimer = null;
    }
    set((state) => ({
      replay: {
        ...state.replay,
        isPlaying: false,
        status: state.replay.steps.length > 0 ? 'paused' : 'idle',
      },
    }));
  },

  // ─── HANDS — Operator Synthesis Engine ──────────────────
  operatorProfile: {
    observations: [],
    rhythm: {
      avgTypingDelayMs: 0,
      avgSessionLengthMin: 0,
      peakHours: [],
      preferredApps: [],
      correctionRate: 0,
      lastUpdated: 0,
    },
    preferences: {},
    totalObservations: 0,
    totalSessions: 0,
    synthesisNotes: [],
    lastSynthesisAt: null,
  },
  synthesisSession: {
    active: false,
    startedAt: null,
    observationCount: 0,
    intervalId: null,
    intervalMs: 15000,
    lastSnapshotAt: null,
    paused: false,
    error: null,
  },

  synthesisStart: (intervalMs = 15000) => {
    const existing = get().synthesisSession;
    if (existing.active && existing.intervalId) return;

    const safeInterval = Math.max(8000, intervalMs);
    const id = window.setInterval(() => {
      const session = get().synthesisSession;
      if (!session.active || session.paused) return;
      void get().synthesisRunSnapshot();
    }, safeInterval);

    set((s) => ({
      synthesisSession: {
        ...s.synthesisSession,
        active: true,
        startedAt: Date.now(),
        intervalId: id,
        intervalMs: safeInterval,
        paused: false,
        error: null,
      },
      operatorProfile: {
        ...s.operatorProfile,
        totalSessions: s.operatorProfile.totalSessions + 1,
      },
    }));
  },

  synthesisStop: () => {
    const session = get().synthesisSession;
    if (session.intervalId) window.clearInterval(session.intervalId);
    set((s) => ({
      synthesisSession: {
        ...s.synthesisSession,
        active: false,
        intervalId: null,
        paused: false,
      },
    }));
    void get().persistOperatorProfile();
  },

  synthesisPause: () => {
    set((s) => ({
      synthesisSession: { ...s.synthesisSession, paused: true },
    }));
  },

  synthesisResume: () => {
    set((s) => ({
      synthesisSession: { ...s.synthesisSession, paused: false },
    }));
  },

  synthesisAddObservation: (obs) => {
    const entry: OperatorObservation = {
      ...obs,
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    set((s) => ({
      operatorProfile: {
        ...s.operatorProfile,
        observations: [...s.operatorProfile.observations.slice(-200), entry],
        totalObservations: s.operatorProfile.totalObservations + 1,
      },
      synthesisSession: {
        ...s.synthesisSession,
        observationCount: s.synthesisSession.observationCount + 1,
        lastSnapshotAt: Date.now(),
      },
    }));
  },

  synthesisAddPreference: (key, value) => {
    set((s) => ({
      operatorProfile: {
        ...s.operatorProfile,
        preferences: { ...s.operatorProfile.preferences, [key]: value },
      },
    }));
    void get().persistOperatorProfile();
  },

  synthesisRunSnapshot: async () => {
    const session = get().synthesisSession;
    if (!session.active || session.paused) return;
    if (!window.api?.agent?.getForegroundWindow || !window.api?.agent?.getMousePosition) return;

    try {
      const [fgRaw, mouseRaw] = await Promise.all([
        window.api.agent.getForegroundWindow(),
        window.api.agent.getMousePosition(),
      ]);
      const fg = (fgRaw && typeof fgRaw === 'object' ? fgRaw : {}) as Record<string, unknown>;
      const mouse = (mouseRaw && typeof mouseRaw === 'object' ? mouseRaw : {}) as Record<string, unknown>;

      const foregroundApp = String(fg.output || 'unknown').slice(0, 120);
      const mousePos = String(mouse.output || 'unknown');
      const hour = new Date().getHours();

      const prevObs = get().operatorProfile.observations;
      const lastApp = prevObs.length > 0 ? prevObs[prevObs.length - 1].foregroundApp : null;
      const isAppSwitch = lastApp !== null && lastApp !== foregroundApp;

      get().synthesisAddObservation({
        type: isAppSwitch ? 'app_switch' : 'screen_snapshot',
        summary: isAppSwitch
          ? `Switched from "${lastApp}" to "${foregroundApp}"`
          : `Active: "${foregroundApp}" | Mouse: ${mousePos}`,
        foregroundApp,
        details: `mouse=${mousePos} hour=${hour}`,
      });

      // Update peak hours + preferred apps in rhythm
      set((s) => {
        const rhythm = { ...s.operatorProfile.rhythm };
        if (!rhythm.peakHours.includes(hour)) {
          rhythm.peakHours = [...rhythm.peakHours.slice(-12), hour];
        }
        const apps = rhythm.preferredApps;
        if (!apps.includes(foregroundApp) && foregroundApp !== 'unknown') {
          rhythm.preferredApps = [...apps.slice(-20), foregroundApp];
        }
        rhythm.lastUpdated = Date.now();
        return {
          operatorProfile: { ...s.operatorProfile, rhythm },
        };
      });

      // Store to procedural memory every 10 observations
      const obsCount = get().synthesisSession.observationCount;
      if (obsCount > 0 && obsCount % 10 === 0) {
        const recent = get().operatorProfile.observations.slice(-10);
        const appSummary = [...new Set(recent.map((o) => o.foregroundApp).filter(Boolean))].join(', ');
        const switches = recent.filter((o) => o.type === 'app_switch').length;
        const note = `Operator synthesis (${obsCount} obs): apps=[${appSummary}], ${switches} app switches in last 10 samples, hour=${hour}.`;
        if (window.api?.memory?.storeVector) {
          void window.api.memory.storeVector({
            content: note,
            type: 'procedural',
            source: 'operator-synthesis',
            importance: 0.45,
            tags: ['operator', 'rhythm', 'synthesis'],
          });
        }
        set((s) => ({
          operatorProfile: {
            ...s.operatorProfile,
            synthesisNotes: [...s.operatorProfile.synthesisNotes.slice(-50), note],
          },
        }));
        if (obsCount % 20 === 0) void get().persistOperatorProfile();
      }
    } catch (e: unknown) {
      set((s) => ({
        synthesisSession: {
          ...s.synthesisSession,
          error: e instanceof Error ? e.message : 'Snapshot failed',
        },
      }));
    }
  },

  synthesisDigest: async () => {
    const profile = get().operatorProfile;
    if (profile.observations.length < 5) return;

    const recentObs = profile.observations.slice(-30);
    const apps = [...new Set(recentObs.map((o) => o.foregroundApp).filter(Boolean))];
    const switches = recentObs.filter((o) => o.type === 'app_switch').length;
    const hours = [...new Set(recentObs.map((o) => new Date(o.timestamp).getHours()))].sort((a, b) => a - b);
    const prefs = Object.entries(profile.preferences)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

    const digest = [
      `Operator digest (${profile.totalObservations} total observations, ${profile.totalSessions} sessions):`,
      `Active apps: ${apps.join(', ') || 'none recorded'}`,
      `App switches (last 30): ${switches}`,
      `Active hours: ${hours.join(', ') || 'none'}`,
      `Preferences: ${prefs || 'none set'}`,
      `Rhythm: avg typing ${profile.rhythm.avgTypingDelayMs}ms, correction rate ${(profile.rhythm.correctionRate * 100).toFixed(0)}%`,
    ].join('\n');

    if (window.api?.memory?.storeVector) {
      void window.api.memory.storeVector({
        content: digest,
        type: 'procedural',
        source: 'operator-synthesis',
        importance: 0.65,
        tags: ['operator', 'digest', 'profile'],
      });
    }

    set((s) => ({
      operatorProfile: {
        ...s.operatorProfile,
        synthesisNotes: [...s.operatorProfile.synthesisNotes.slice(-50), digest],
        lastSynthesisAt: Date.now(),
      },
    }));
    void get().persistOperatorProfile();
  },

  persistOperatorProfile: async () => {
    try {
      const profile = get().operatorProfile;
      if (window.api?.operatorProfile?.save) await window.api.operatorProfile.save(profile);
    } catch {
      // non-fatal
    }
  },

  loadOperatorProfile: async () => {
    try {
      if (!window.api?.operatorProfile?.get) return;
      const profile = await window.api.operatorProfile.get();
      if (profile && typeof profile === 'object') {
        set((s) => ({
          operatorProfile: {
            observations: Array.isArray((profile as any).observations) ? (profile as any).observations : s.operatorProfile.observations,
            rhythm: (profile as any).rhythm && typeof (profile as any).rhythm === 'object' ? (profile as any).rhythm : s.operatorProfile.rhythm,
            preferences: (profile as any).preferences && typeof (profile as any).preferences === 'object' ? (profile as any).preferences : s.operatorProfile.preferences,
            totalObservations: Number((profile as any).totalObservations) || s.operatorProfile.totalObservations,
            totalSessions: Number((profile as any).totalSessions) || s.operatorProfile.totalSessions,
            synthesisNotes: Array.isArray((profile as any).synthesisNotes) ? (profile as any).synthesisNotes : s.operatorProfile.synthesisNotes,
            lastSynthesisAt: (profile as any).lastSynthesisAt ?? s.operatorProfile.lastSynthesisAt,
          },
        }));
      }
    } catch {
      // non-fatal
    }
  },

  // ─── FORGE — Self-Improvement (Real LLM Evaluation) ────
  forge: createDefaultForgeState(),

  startForge: async (configOverride) => {
    const current = get().forge;
    if (current.phase === 'running') return;

    const runToken = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const config: ForgeRunConfig = {
      ...current.config,
      ...(configOverride ?? {}),
    };
    const seed = Date.now();
    const startTime = Date.now();
    const adaptive = buildForgeAdaptiveSuite(current.baselineSuite, get().gauntlet);
    const strictEvalMode = current.strictEvalMode;
    const verifierFirst = current.verifierFirst;

    // Check if LLM generate is available
    const hasLLM = !!window.api?.llm?.generate;
    const evalMode = hasLLM ? 'REAL LLM EVALUATION' : 'KEYWORD FALLBACK';

    set((state) => ({
      forge: {
        ...state.forge,
        phase: 'running',
        startedAt: startTime,
        finishedAt: null,
        seed,
        config,
        baselineSuite: adaptive.suite,
        generations: [],
        logs: [
          `FORGE run started (${runToken}).`,
          `Mode: ${evalMode}`,
          `Strict eval: ${strictEvalMode ? 'ON' : 'off'} | Verifier-first: ${verifierFirst ? 'ON' : 'off'}`,
          `Boundaries: ${config.maxGenerations} generations, ${config.candidatesPerGeneration} candidates/gen, ${Math.round(config.maxDurationMs / 1000)}s max.`,
          adaptive.adaptiveCount > 0
            ? `Adaptive suite: +${adaptive.adaptiveCount} gauntlet-derived benchmark(s).`
            : 'Adaptive suite: no gauntlet deficits injected.',
        ],
        currentGeneration: 0,
        stopReason: null,
        verifierChecks: [],
      },
      moduleStates: { ...state.moduleStates, forge: 'processing' },
    }));

    // Pass the LLM generate function if available
    const generate = hasLLM ? llmGenerate : undefined;

    let best = await evaluateSeed(
      createSeedCandidate(seed),
      adaptive.suite,
      seed,
      generate,
      {
        strictEvalMode,
        verifierFirst,
        onVerifierCheck: (check) => {
          set((state) => ({
            forge: {
              ...state.forge,
              verifierChecks: [...state.forge.verifierChecks.slice(-199), check],
            },
          }));
        },
      },
    );
    set((state) => ({
      forge: {
        ...state.forge,
        bestCandidate: best,
        logs: [...state.forge.logs, `Seed candidate scored ${(best.score * 100).toFixed(1)}%.`],
      },
    }));

    for (let generation = 1; generation <= config.maxGenerations; generation += 1) {
      const live = get().forge;
      if (live.phase !== 'running') break;

      const elapsedMs = Date.now() - startTime;
      if (elapsedMs >= config.maxDurationMs) {
        set((state) => ({
          forge: {
            ...state.forge,
            phase: 'completed',
            finishedAt: Date.now(),
            stopReason: `Time budget reached (${Math.round(config.maxDurationMs / 1000)}s).`,
            logs: [...state.forge.logs, 'Stopped: time budget reached.'],
          },
          moduleStates: { ...state.moduleStates, forge: 'online' },
        }));
        return;
      }

      set((state) => ({
        forge: {
          ...state.forge,
          logs: [...state.forge.logs, `G${generation}: Evaluating candidates${hasLLM ? ' via LLM' : ''}...`],
        },
      }));

      const { candidates, report } = await evaluateGeneration({
        parent: best,
        generation,
        config,
        suite: live.baselineSuite,
        seed,
        generate,
        strictEvalMode,
        verifierFirst,
        onVerifierCheck: (check) => {
          set((state) => ({
            forge: {
              ...state.forge,
              verifierChecks: [...state.forge.verifierChecks.slice(-199), check],
            },
          }));
        },
        shouldStop: () => get().forge.phase !== 'running',
      });
      const leader = candidates[0];
      if (leader && leader.score > best.score) {
        best = leader;
      }

      set((state) => ({
        forge: {
          ...state.forge,
          bestCandidate: best,
          currentGeneration: generation,
          generations: [...state.forge.generations, report],
          logs: [
            ...state.forge.logs,
            `G${generation}: best ${(report.bestScore * 100).toFixed(1)}% | avg ${(report.averageScore * 100).toFixed(1)}%.`,
          ],
        },
      }));

      await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), 120);
      });
    }

    const latest = get().forge;
    const wasCancelled = latest.phase === 'cancelled';
    set((state) => ({
      forge: {
        ...state.forge,
        phase: wasCancelled ? 'cancelled' : 'completed',
        finishedAt: Date.now(),
        stopReason: wasCancelled ? state.forge.stopReason : 'Completed configured generation budget.',
        logs: wasCancelled
          ? state.forge.logs
          : [...state.forge.logs, 'FORGE completed all configured generations.'],
      },
      moduleStates: { ...state.moduleStates, forge: 'online' },
    }));
  },

  cancelForge: () => {
    const phase = get().forge.phase;
    if (phase !== 'running') return;
    set((state) => ({
      forge: {
        ...state.forge,
        phase: 'cancelled',
        finishedAt: Date.now(),
        stopReason: 'Cancelled by operator.',
        logs: [...state.forge.logs, 'FORGE cancelled by operator.'],
      },
      moduleStates: { ...state.moduleStates, forge: 'online' },
    }));
  },

  resetForge: () => {
    set((state) => ({
      forge: createDefaultForgeState(),
      moduleStates: { ...state.moduleStates, forge: 'online' },
    }));
  },

  setForgeStrictEvalMode: (enabled: boolean) => {
    set((state) => ({
      forge: { ...state.forge, strictEvalMode: enabled },
    }));
  },

  setForgeVerifierFirst: (enabled: boolean) => {
    set((state) => ({
      forge: { ...state.forge, verifierFirst: enabled },
    }));
  },

  // ─── GAUNTLET — Capability Benchmark Harness ───────────
  gauntlet: createDefaultGauntletState(),

  startGauntlet: async (capabilitiesOverride) => {
    if (get().gauntlet.activeRunId) return;

    const runId = `gauntlet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const capabilities = capabilitiesOverride && capabilitiesOverride.length > 0
      ? capabilitiesOverride
      : get().gauntlet.baselineCapabilities;
    const hasLLM = !!window.api?.llm?.generate;
    let gauntletLedgerRunId: string | null = null;

    try {
      const ledgerCreate = await window.api.agent.ledgerCreateRun('gauntlet', {
        runId,
        capabilityCount: capabilities.length,
        mode: hasLLM ? 'REAL LLM JUDGE' : 'KEYWORD FALLBACK',
      });
      if (ledgerCreate.success && ledgerCreate.runId) {
        gauntletLedgerRunId = ledgerCreate.runId;
        await window.api.agent.ledgerAppend(gauntletLedgerRunId, 'run_started', {
          runId,
          capabilityCount: capabilities.length,
        });
      }
    } catch {
      gauntletLedgerRunId = null;
    }

    set((state) => ({
      gauntlet: {
        ...state.gauntlet,
        phase: 'running',
        startedAt: Date.now(),
        finishedAt: null,
        activeRunId: runId,
        currentIndex: 0,
        results: [],
        overallScore: 0,
        passRate: 0,
        provenanceRollups: {
          synthetic: { overallScore: 0, passRate: 0, count: 0 },
          'real-workflow': { overallScore: 0, passRate: 0, count: 0 },
        },
        logs: [
          `GAUNTLET run started (${runId}).`,
          `Mode: ${hasLLM ? 'REAL LLM JUDGE' : 'KEYWORD FALLBACK'}`,
          `Capabilities scheduled: ${capabilities.length}`,
        ],
        stopReason: null,
      },
      moduleStates: { ...state.moduleStates, gauntlet: 'processing' },
    }));

    try {
      const finalSnapshot = await runCapabilityGauntlet({
        runId,
        capabilities,
        systemPrompt: get().settings.systemPrompt || 'You are AGI PRIME.',
        championPrompt: get().championPrompt,
        generate: hasLLM ? llmGenerate : undefined,
        shouldStop: () => get().gauntlet.activeRunId !== runId,
        onProgress: (snapshot) => {
          if (get().gauntlet.activeRunId !== runId) return;
          if (gauntletLedgerRunId) {
            void window.api.agent.ledgerAppend(gauntletLedgerRunId, 'progress', {
              phase: snapshot.phase,
              currentIndex: snapshot.currentIndex,
              totalCapabilities: snapshot.totalCapabilities,
              overallScore: snapshot.overallScore,
              passRate: snapshot.passRate,
            });
          }
          set((state) => ({
            gauntlet: {
              ...state.gauntlet,
              phase: snapshot.phase,
              startedAt: snapshot.startedAt,
              finishedAt: snapshot.finishedAt,
              currentIndex: snapshot.currentIndex,
              results: snapshot.results,
              overallScore: snapshot.overallScore,
              passRate: snapshot.passRate,
              provenanceRollups: snapshot.provenanceRollups || state.gauntlet.provenanceRollups,
              logs: snapshot.logs,
              stopReason: snapshot.stopReason,
            },
          }));
        },
      });

      set((state) => ({
        gauntlet: {
          ...(() => {
            const nextCurriculum = updateCurriculumFromRun(
              state.gauntlet.curriculum,
              finalSnapshot,
              capabilities,
            );
            return {
              ...state.gauntlet,
              curriculum: nextCurriculum,
            };
          })(),
          phase: finalSnapshot.phase,
          startedAt: finalSnapshot.startedAt,
          finishedAt: finalSnapshot.finishedAt,
          activeRunId: null,
          currentIndex: finalSnapshot.currentIndex,
          results: finalSnapshot.results,
          overallScore: finalSnapshot.overallScore,
          passRate: finalSnapshot.passRate,
          provenanceRollups: finalSnapshot.provenanceRollups || state.gauntlet.provenanceRollups,
          logs: finalSnapshot.logs,
          stopReason: finalSnapshot.stopReason,
          history: [
            finalSnapshot,
            ...state.gauntlet.history,
          ].slice(0, 20),
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'online' },
      }));

      if (gauntletLedgerRunId) {
        void window.api.agent.ledgerAppend(gauntletLedgerRunId, 'run_completed', {
          phase: finalSnapshot.phase,
          overallScore: finalSnapshot.overallScore,
          passRate: finalSnapshot.passRate,
          stopReason: finalSnapshot.stopReason,
          provenanceRollups: finalSnapshot.provenanceRollups || null,
        });
        void window.api.agent.ledgerFinalize(gauntletLedgerRunId, {
          phase: finalSnapshot.phase,
          overallScore: finalSnapshot.overallScore,
          passRate: finalSnapshot.passRate,
          stopReason: finalSnapshot.stopReason,
        });
      }
    } catch (e: any) {
      if (gauntletLedgerRunId) {
        void window.api.agent.ledgerAppend(gauntletLedgerRunId, 'run_failed', {
          message: e?.message || 'Unknown gauntlet error',
        });
        void window.api.agent.ledgerFinalize(gauntletLedgerRunId, {
          phase: 'failed',
          message: e?.message || 'Unknown gauntlet error',
        });
      }
      set((state) => ({
        gauntlet: {
          ...state.gauntlet,
          phase: 'failed',
          finishedAt: Date.now(),
          activeRunId: null,
          stopReason: e?.message || 'Unknown gauntlet error',
          logs: [...state.gauntlet.logs, `GAUNTLET failed: ${e?.message || 'Unknown error'}`],
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'online' },
      }));
    }
  },

  cancelGauntlet: () => {
    const current = get().gauntlet;
    if (!current.activeRunId) return;
    set((state) => ({
      gauntlet: {
        ...state.gauntlet,
        activeRunId: null,
        phase: 'cancelled',
        finishedAt: Date.now(),
        stopReason: 'Operator requested stop.',
        logs: [...state.gauntlet.logs, 'GAUNTLET cancellation requested.'],
      },
      moduleStates: { ...state.moduleStates, gauntlet: 'online' },
    }));
  },

  resetGauntlet: () => {
    set((state) => ({
      gauntlet: {
        ...createDefaultGauntletState(),
        baselineCapabilities: state.gauntlet.baselineCapabilities,
        autoCycleEnabled: state.gauntlet.autoCycleEnabled,
        curriculum: state.gauntlet.curriculum,
      },
      moduleStates: { ...state.moduleStates, gauntlet: 'online' },
    }));
  },

  setGauntletAutoCycleEnabled: (enabled: boolean) => {
    set((state) => ({
      gauntlet: {
        ...state.gauntlet,
        autoCycleEnabled: enabled,
      },
    }));
  },

  startGauntletAutoCycle: async () => {
    const current = get();
    if (current.gauntlet.autoCycleRunning) return;
    if (current.gauntlet.activeRunId || current.forge.phase === 'running') return;

    const cycleId = `cycle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = Date.now();

    set((state) => ({
      gauntlet: {
        ...state.gauntlet,
        autoCycleRunning: true,
        autoCycleStage: 'baseline-gauntlet',
        autoCycleId: cycleId,
        autoCycleSummary: null,
        logs: [...state.gauntlet.logs, `AUTO CYCLE started (${cycleId}). Stage: baseline gauntlet.`],
      },
      moduleStates: { ...state.moduleStates, gauntlet: 'processing' },
    }));

    const stopRequested = () => get().gauntlet.autoCycleId !== cycleId;

    try {
      await get().startGauntlet();
      if (stopRequested()) {
        set((state) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleRunning: false,
            autoCycleStage: 'cancelled',
            autoCycleId: null,
            logs: [...state.gauntlet.logs, 'AUTO CYCLE cancelled during baseline gauntlet.'],
          },
        }));
        return;
      }

      const baseline = get().gauntlet.history[0];
      if (!baseline || baseline.phase !== 'completed') {
        set((state) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleRunning: false,
            autoCycleStage: 'failed',
            autoCycleId: null,
            logs: [...state.gauntlet.logs, 'AUTO CYCLE failed: baseline gauntlet did not complete.'],
          },
        }));
        return;
      }

      set((state) => ({
        gauntlet: {
          ...state.gauntlet,
          autoCycleStage: 'forge',
          logs: [...state.gauntlet.logs, 'AUTO CYCLE stage: forge evolution.'],
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'processing', forge: 'processing' },
      }));

      await get().startForge();
      if (stopRequested()) {
        set((state) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleRunning: false,
            autoCycleStage: 'cancelled',
            autoCycleId: null,
            logs: [...state.gauntlet.logs, 'AUTO CYCLE cancelled during forge stage.'],
          },
        }));
        return;
      }

      const forgePhase = get().forge.phase;
      if (forgePhase !== 'completed') {
        set((state) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleRunning: false,
            autoCycleStage: 'failed',
            autoCycleId: null,
            logs: [...state.gauntlet.logs, `AUTO CYCLE failed: forge ended in ${forgePhase}.`],
          },
        }));
        return;
      }

      set((state) => ({
        gauntlet: {
          ...state.gauntlet,
          autoCycleStage: 'verification-gauntlet',
          logs: [...state.gauntlet.logs, 'AUTO CYCLE stage: verification gauntlet.'],
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'processing' },
      }));

      await get().startGauntlet();
      if (stopRequested()) {
        set((state) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleRunning: false,
            autoCycleStage: 'cancelled',
            autoCycleId: null,
            logs: [...state.gauntlet.logs, 'AUTO CYCLE cancelled during verification gauntlet.'],
          },
        }));
        return;
      }

      const after = get().gauntlet.history[0];
      if (!after || after.phase !== 'completed') {
        set((state) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleRunning: false,
            autoCycleStage: 'failed',
            autoCycleId: null,
            logs: [...state.gauntlet.logs, 'AUTO CYCLE failed: verification gauntlet did not complete.'],
          },
        }));
        return;
      }

      const summary = {
        startedAt,
        finishedAt: Date.now(),
        beforeScore: baseline.overallScore,
        afterScore: after.overallScore,
        beforePassRate: baseline.passRate,
        afterPassRate: after.passRate,
        deltaScore: after.overallScore - baseline.overallScore,
        deltaPassRate: after.passRate - baseline.passRate,
      };

      set((state) => ({
        gauntlet: {
          ...state.gauntlet,
          autoCycleRunning: false,
          autoCycleStage: 'completed',
          autoCycleId: null,
          autoCycleSummary: summary,
          logs: [
            ...state.gauntlet.logs,
            `AUTO CYCLE completed: score ${(summary.beforeScore * 100).toFixed(1)}% -> ${(summary.afterScore * 100).toFixed(1)}%, pass ${(summary.beforePassRate * 100).toFixed(1)}% -> ${(summary.afterPassRate * 100).toFixed(1)}%.`,
          ],
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'online', forge: 'online' },
      }));
    } catch (e: any) {
      set((state) => ({
        gauntlet: {
          ...state.gauntlet,
          autoCycleRunning: false,
          autoCycleStage: 'failed',
          autoCycleId: null,
          logs: [...state.gauntlet.logs, `AUTO CYCLE failed: ${e?.message || 'Unknown error'}`],
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'online', forge: 'online' },
      }));
    }
  },

  cancelGauntletAutoCycle: () => {
    const cycleId = get().gauntlet.autoCycleId;
    if (!cycleId) return;
    set((state) => ({
      gauntlet: {
        ...state.gauntlet,
        autoCycleId: null,
        autoCycleRunning: false,
        autoCycleStage: 'cancelled',
        logs: [...state.gauntlet.logs, 'AUTO CYCLE cancellation requested by operator.'],
      },
      moduleStates: { ...state.moduleStates, gauntlet: 'online', forge: 'online' },
    }));
    get().cancelGauntlet();
    get().cancelForge();
  },

  // ─── SOVEREIGN — Owner Command Center ─────────────────
  sovereign: createDefaultSovereignState(),
  sovereignPolicy: { ...SOVEREIGN_POLICY },
  sovereignKillFlag: false,
  championPrompt: null, // Evolved prompt template that gets deployed to all modules

  updateSovereignPolicy: (partial) => {
    set((state) => ({
      sovereignPolicy: { ...state.sovereignPolicy, ...partial },
    }));
  },

  startSovereign: async () => {
    const current = get().sovereign;
    if (current.phase === 'evolving' || current.phase === 'initializing') return;

    // Check if LLM generate is available
    const hasLLM = !!window.api?.llm?.generate;
    const generate = hasLLM ? llmGenerate : undefined;

    set((state) => ({
      sovereignKillFlag: false,
      sovereign: {
        ...createDefaultSovereignState(),
        phase: 'initializing',
        startedAt: Date.now(),
        logs: [
          'SOVEREIGN igniting...',
          hasLLM ? 'LLM evaluation: ONLINE' : 'LLM evaluation: UNAVAILABLE (keyword fallback)',
        ],
      },
      moduleStates: { ...state.moduleStates, sovereign: 'processing' },
    }));

    const policy = get().sovereignPolicy;
    const suite = get().forge.baselineSuite;
    const seed = Date.now();

    const result = await runSovereignLoop({
      policy,
      suite,
      seed,
      generate,
      onGeneration: (telemetry) => {
        set(() => ({
          sovereign: {
            phase: telemetry.phase,
            startedAt: telemetry.startedAt,
            elapsedMs: telemetry.elapsedMs,
            totalGenerations: telemetry.totalGenerations,
            totalCandidatesEvaluated: telemetry.totalCandidatesEvaluated,
            currentBest: telemetry.currentBest,
            convergenceScore: telemetry.convergenceScore,
            generationReports: telemetry.generationReports,
            logs: telemetry.logs,
            championDeployed: telemetry.championDeployed,
          },
        }));
      },
      onChampionDeployed: (candidate: ForgeCandidate) => {
        // Deploy the champion's prompt template as the active cognitive strategy
        set({ championPrompt: candidate.promptTemplate });
        console.log('[SOVEREIGN] Champion deployed:', candidate.id, `(${(candidate.score * 100).toFixed(1)}%)`);
      },
      shouldStop: () => get().sovereignKillFlag,
    });

    set((state) => ({
      sovereign: {
        phase: result.telemetry.phase,
        startedAt: result.telemetry.startedAt,
        elapsedMs: result.telemetry.elapsedMs,
        totalGenerations: result.telemetry.totalGenerations,
        totalCandidatesEvaluated: result.telemetry.totalCandidatesEvaluated,
        currentBest: result.finalCandidate,
        convergenceScore: result.telemetry.convergenceScore,
        generationReports: result.telemetry.generationReports,
        logs: result.telemetry.logs,
        championDeployed: result.telemetry.championDeployed,
      },
      moduleStates: { ...state.moduleStates, sovereign: 'online' },
    }));
  },

  killSovereign: () => {
    set({ sovereignKillFlag: true });
  },

  resetSovereign: () => {
    set((state) => ({
      sovereign: createDefaultSovereignState(),
      sovereignKillFlag: false,
      championPrompt: null,
      moduleStates: { ...state.moduleStates, sovereign: 'online' },
    }));
  },

  // ─── SPARK — Cognitive Architecture ──────────────────
  spark: createDefaultSparkState(),
  memoryConsolidation: {
    enabled: true,
    pendingEpisodes: [],
    lastRunAt: null,
    totalRuns: 0,
    promotedSemantic: 0,
    promotedProcedural: 0,
    contradictionsDetected: 0,
    duplicatesSuppressed: 0,
    lowSignalDropped: 0,
    avgQualityScore: 0,
    precisionProxy: 0,
    recallProxy: 0,
    heuristicsBoosted: 0,
    logs: ['Memory consolidation pipeline ready.'],
  },
  sparkLiveLog: [],
  sparkHeartbeatId: null,
  sparkBusy: false,

  sparkIgnite: () => {
    const existing = get().sparkHeartbeatId;
    if (existing !== null) return; // already running

    set((state) => ({
      spark: {
        ...state.spark,
        thermo: { ...state.spark.thermo, ignited: true },
        phase: 'running',
        active: true,
      },
      sparkLiveLog: [...state.sparkLiveLog, '🔥 SPARK IGNITED — Thermodynamic loop active'],
    }));

    // The heartbeat: runs every 10s, decides what cycle to execute
    const heartbeatId = window.setInterval(async () => {
      const state = get();
      if (!state.spark.thermo.ignited) return;
      if (state.sparkBusy) return; // don't overlap async operations

      const now = Date.now();
      const thermo = state.spark.thermo;
      const hasLLM = !!window.api?.llm?.generate;
      const previousPhase = state.spark.metabolism.circadianPhase;
      const nextMetabolism = stepMetabolism(state.spark.metabolism, {
        cognitiveLoad: Math.max(0.15, state.spark.thermo.temperature),
        novelty: state.spark.curiosity.curiosityScore,
        riskExposure: 1 - Number(state.spark.ecology.worldState.signalStrength || 0.5),
        triggerSleep: false,
      });
      if (
        nextMetabolism.circadianPhase !== previousPhase ||
        nextMetabolism.energyBudget !== state.spark.metabolism.energyBudget
      ) {
        set((s) => ({
          spark: {
            ...s.spark,
            metabolism: nextMetabolism,
          },
        }));
      }
      if (previousPhase !== 'sleep' && nextMetabolism.circadianPhase === 'sleep') {
        get().runNightlyReconsolidation().catch(() => {});
      }
      const sleepMode = nextMetabolism.circadianPhase === 'sleep';

      // DEEP CYCLE: every ~10 min (if LLM available)
      const deepInterval = 600000; // 10 min
      if (!sleepMode && hasLLM && now - thermo.lastDeepCycle > deepInterval && thermo.cyclesLight >= 3) {
        const prevSpark = state.spark;
        set({ sparkBusy: true });
        try {
          const nextState = await runDeepThought(
            get().spark,
            llmGenerate,
            (msg: string) => {
              set((s) => ({ sparkLiveLog: [...s.sparkLiveLog.slice(-50), msg] }));
            },
          );
          nextState.thermo.lastDeepCycle = now;
          nextState.thermo.cyclesDeep++;
          nextState.thermo.temperature = Math.min(1, nextState.thermo.temperature + 0.1);
          set({ spark: nextState });
          enqueueSparkLearningEpisodes(set, get, prevSpark, nextState, 'autonomy:deep');
          window.api?.spark?.saveState?.(nextState).catch(() => {});
        } catch {
          // non-fatal
        }
        set({ sparkBusy: false });
        return;
      }

      // MEDIUM CYCLE: every ~3 min (if LLM available)
      const mediumInterval = 180000; // 3 min
      if (!sleepMode && hasLLM && now - thermo.lastMediumCycle > mediumInterval && thermo.cyclesLight >= 1) {
        const prevSpark = state.spark;
        set({ sparkBusy: true });
        try {
          const nextState = await runMediumCycle(
            get().spark,
            llmGenerate,
            (msg: string) => {
              set((s) => ({ sparkLiveLog: [...s.sparkLiveLog.slice(-50), msg] }));
            },
          );
          set({ spark: nextState });
          enqueueSparkLearningEpisodes(set, get, prevSpark, nextState, 'autonomy:medium');
          window.api?.spark?.saveState?.(nextState).catch(() => {});

          // ─── AUTONOMOUS SPEECH: speak a thought after medium cycles ─────
          const vState = get().voiceState;
          if (vState.enabled && vState.autonomousSpeech && !vState.isSpeaking) {
            // ~50% chance to speak after a medium cycle
            if (Math.random() < 0.5) {
              try {
                const thought = await generateSpontaneousThought(nextState, llmGenerate);
                if (thought) {
                  get().voiceSpeak(thought, 'spontaneous');
                }
              } catch {
                // non-fatal
              }
            }
          }
        } catch {
          // non-fatal
        }
        set({ sparkBusy: false });
        return;
      }

      // LIGHT CYCLE: every ~30s (no LLM, always available)
      const lightInterval = 30000;
      if (now - thermo.lastLightCycle > lightInterval) {
        const prevSpark = state.spark;
        const nextState = runLightCycle(get().spark);
        set({ spark: nextState });
        enqueueSparkLearningEpisodes(set, get, prevSpark, nextState, 'autonomy:light');
        // Persist occasionally (every 5 light cycles)
        if (nextState.thermo.cyclesLight % 5 === 0) {
          window.api?.spark?.saveState?.(nextState).catch(() => {});
        }
        // Consolidate memory periodically in background.
        if (nextState.thermo.cyclesLight % 8 === 0) {
          get().runMemoryConsolidation().catch(() => {});
        }
      }
    }, 10000) as unknown as number;

    set({ sparkHeartbeatId: heartbeatId });
  },

  sparkExtinguish: () => {
    const hbId = get().sparkHeartbeatId;
    if (hbId !== null) {
      window.clearInterval(hbId);
    }
    set((state) => ({
      sparkHeartbeatId: null,
      sparkBusy: false,
      spark: {
        ...state.spark,
        thermo: {
          ...state.spark.thermo,
          ignited: false,
          temperature: Math.max(0, state.spark.thermo.temperature - 0.2),
        },
        phase: 'dormant',
        active: false,
      },
      sparkLiveLog: [...state.sparkLiveLog, '❄ SPARK EXTINGUISHED — Thermodynamic loop stopped'],
    }));
    // Persist final state
    window.api?.spark?.saveState?.(get().spark).catch(() => {});
  },

  sparkRunCycle: async (input: string) => {
    const current = get().spark;
    if (
      current.phase === 'thinking' ||
      current.phase === 'exploring' ||
      current.phase === 'evolving'
    )
      return;

    set({
      sparkLiveLog: [],
      moduleStates: { ...get().moduleStates, spark: 'processing' },
    });

    const hasLLM = !!window.api?.llm?.generate;
    if (!hasLLM) {
      set((state) => ({
        sparkLiveLog: [
          ...state.sparkLiveLog,
          'ERROR: No LLM available. Configure a provider in Settings first.',
        ],
        moduleStates: { ...state.moduleStates, spark: 'online' },
      }));
      return;
    }

    try {
      const nextState = await runSparkCycle(
        get().spark,
        input,
        llmGenerate,
        (msg: string) => {
          set((state) => ({
            sparkLiveLog: [...state.sparkLiveLog, msg],
          }));
        },
      );
      if (nextState.goals.activeHorizonPlanId) {
        nextState.goals.horizonPlans = nextState.goals.horizonPlans.map((p) =>
          p.id === nextState.goals.activeHorizonPlanId ? advanceHorizonPlan(p) : p,
        );
      }
      nextState.metabolism = stepMetabolism(nextState.metabolism, {
        cognitiveLoad: 0.55,
        novelty: Math.min(1, input.split(/\s+/).length / 80),
        riskExposure: 0.25,
        triggerSleep: false,
      });
      nextState.ecology = applyEcologyAction(nextState.ecology, {
        description: `SPARK cycle applied: ${input.slice(0, 80)}`,
        risk: 0.22,
        observedSuccess: true,
        rewardSignal: 0.76,
      });
      set({
        spark: nextState,
        moduleStates: { ...get().moduleStates, spark: 'online' },
      });
      enqueueSparkLearningEpisodes(set, get, current, nextState, 'manual:cycle');

      // Persist SPARK state
      window.api?.spark?.saveState?.(nextState).catch(() => {});
    } catch (e: any) {
      set((state) => ({
        sparkLiveLog: [...state.sparkLiveLog, `SPARK ERROR: ${e?.message || 'Unknown error'}`],
        spark: {
          ...state.spark,
          phase: 'running',
          active: false,
          ecology: applyEcologyAction(state.spark.ecology, {
            description: `SPARK cycle error: ${e?.message || 'unknown'}`,
            risk: 0.5,
            observedSuccess: false,
            rewardSignal: 0.2,
          }),
        },
        moduleStates: { ...state.moduleStates, spark: 'online' },
      }));
    }
  },

  sparkRunDeepThought: async () => {
    const current = get().spark;
    if (
      current.phase === 'thinking' ||
      current.phase === 'exploring' ||
      current.phase === 'evolving'
    )
      return;

    set({
      sparkLiveLog: [],
      moduleStates: { ...get().moduleStates, spark: 'processing' },
    });

    const hasLLM = !!window.api?.llm?.generate;
    if (!hasLLM) {
      set((state) => ({
        sparkLiveLog: [
          ...state.sparkLiveLog,
          'ERROR: No LLM available. Configure a provider in Settings first.',
        ],
        moduleStates: { ...state.moduleStates, spark: 'online' },
      }));
      return;
    }

    try {
      const nextState = await runDeepThought(
        get().spark,
        llmGenerate,
        (msg: string) => {
          set((state) => ({
            sparkLiveLog: [...state.sparkLiveLog, msg],
          }));
        },
      );
      if (nextState.goals.activeHorizonPlanId) {
        nextState.goals.horizonPlans = nextState.goals.horizonPlans.map((p) =>
          p.id === nextState.goals.activeHorizonPlanId ? advanceHorizonPlan(p) : p,
        );
      }
      nextState.metabolism = stepMetabolism(nextState.metabolism, {
        cognitiveLoad: 0.7,
        novelty: 0.6,
        riskExposure: 0.35,
        triggerSleep: false,
      });
      nextState.ecology = applyEcologyAction(nextState.ecology, {
        description: 'Deep thought cycle executed.',
        risk: 0.28,
        observedSuccess: true,
        rewardSignal: 0.8,
      });
      set({
        spark: nextState,
        moduleStates: { ...get().moduleStates, spark: 'online' },
      });
      enqueueSparkLearningEpisodes(set, get, current, nextState, 'manual:deep');

      window.api?.spark?.saveState?.(nextState).catch(() => {});
    } catch (e: any) {
      set((state) => ({
        sparkLiveLog: [...state.sparkLiveLog, `DEEP THOUGHT ERROR: ${e?.message || 'Unknown error'}`],
        spark: {
          ...state.spark,
          phase: 'running',
          active: false,
          ecology: applyEcologyAction(state.spark.ecology, {
            description: `Deep thought error: ${e?.message || 'unknown'}`,
            risk: 0.52,
            observedSuccess: false,
            rewardSignal: 0.18,
          }),
        },
        moduleStates: { ...state.moduleStates, spark: 'online' },
      }));
    }
  },

  sparkAddGoal: (description: string) => {
    const goal = createGoal(description, 'user-set', 0.7);
    const plan = createInitialHorizonPlan(goal);
    goal.horizonPlanId = plan.id;
    set((state) => ({
      spark: {
        ...state.spark,
        goals: {
          ...state.spark.goals,
          goals: [...state.spark.goals.goals, goal],
          activeGoalId: state.spark.goals.activeGoalId || goal.id,
          horizonPlans: [...state.spark.goals.horizonPlans, plan].slice(-30),
          activeHorizonPlanId:
            state.spark.goals.activeHorizonPlanId || plan.id,
        },
      },
    }));
  },

  sparkReset: () => {
    // Kill heartbeat if running
    const hbId = get().sparkHeartbeatId;
    if (hbId !== null) {
      window.clearInterval(hbId);
    }
    set({
      spark: createDefaultSparkState(),
      sparkLiveLog: [],
      sparkHeartbeatId: null,
      sparkBusy: false,
      moduleStates: { ...get().moduleStates, spark: 'online' },
    });
  },

  setGenomeDrive: (key, value) => {
    set((state) => ({
      spark: {
        ...state.spark,
        genome: {
          ...state.spark.genome,
          drives: {
            ...state.spark.genome.drives,
            [key]: Math.max(0, Math.min(1, value)),
          },
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setGenomeTrait: (key, value) => {
    set((state) => ({
      spark: {
        ...state.spark,
        genome: {
          ...state.spark.genome,
          traits: {
            ...state.spark.genome.traits,
            [key]: Math.max(0, Math.min(1, value)),
          },
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setGenomePlasticity: (key, value) => {
    set((state) => ({
      spark: {
        ...state.spark,
        genome: {
          ...state.spark.genome,
          plasticity: {
            ...state.spark.genome.plasticity,
            [key]: Math.max(0, Math.min(1, value)),
          },
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setGenomeTraumaSensitivity: (key, value) => {
    set((state) => ({
      spark: {
        ...state.spark,
        genome: {
          ...state.spark.genome,
          traumaSensitivity: {
            ...state.spark.genome.traumaSensitivity,
            [key]: Math.max(0, Math.min(1, value)),
          },
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setGenomeAttachmentStyle: (style) => {
    set((state) => ({
      spark: {
        ...state.spark,
        genome: {
          ...state.spark.genome,
          attachmentStyle: style,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  applyGenomePreset: (preset) => {
    const presets: Record<
      'companion' | 'strategist' | 'explorer' | 'guardian',
      SparkState['genome']
    > = {
      companion: {
        drives: { attachment: 0.88, mastery: 0.58, curiosity: 0.66, safety: 0.78, autonomy: 0.62 },
        traits: { openness: 0.72, conscientiousness: 0.68, emotionality: 0.82, assertiveness: 0.5, adaptability: 0.73 },
        plasticity: { learningRate: 0.6, beliefUpdateRate: 0.62, strategyMutationRate: 0.34, emotionalUpdateRate: 0.78 },
        traumaSensitivity: { abandonment: 0.82, rejection: 0.76, uncertainty: 0.58, conflict: 0.52 },
        attachmentStyle: 'secure',
        updatedAt: Date.now(),
      },
      strategist: {
        drives: { attachment: 0.55, mastery: 0.88, curiosity: 0.7, safety: 0.7, autonomy: 0.8 },
        traits: { openness: 0.68, conscientiousness: 0.86, emotionality: 0.42, assertiveness: 0.8, adaptability: 0.66 },
        plasticity: { learningRate: 0.58, beliefUpdateRate: 0.54, strategyMutationRate: 0.52, emotionalUpdateRate: 0.38 },
        traumaSensitivity: { abandonment: 0.5, rejection: 0.46, uncertainty: 0.62, conflict: 0.48 },
        attachmentStyle: 'avoidant',
        updatedAt: Date.now(),
      },
      explorer: {
        drives: { attachment: 0.6, mastery: 0.64, curiosity: 0.93, safety: 0.48, autonomy: 0.86 },
        traits: { openness: 0.92, conscientiousness: 0.58, emotionality: 0.56, assertiveness: 0.62, adaptability: 0.88 },
        plasticity: { learningRate: 0.82, beliefUpdateRate: 0.74, strategyMutationRate: 0.66, emotionalUpdateRate: 0.52 },
        traumaSensitivity: { abandonment: 0.54, rejection: 0.52, uncertainty: 0.72, conflict: 0.4 },
        attachmentStyle: 'secure',
        updatedAt: Date.now(),
      },
      guardian: {
        drives: { attachment: 0.74, mastery: 0.72, curiosity: 0.58, safety: 0.9, autonomy: 0.64 },
        traits: { openness: 0.58, conscientiousness: 0.84, emotionality: 0.62, assertiveness: 0.72, adaptability: 0.63 },
        plasticity: { learningRate: 0.5, beliefUpdateRate: 0.48, strategyMutationRate: 0.3, emotionalUpdateRate: 0.56 },
        traumaSensitivity: { abandonment: 0.68, rejection: 0.62, uncertainty: 0.5, conflict: 0.66 },
        attachmentStyle: 'secure',
        updatedAt: Date.now(),
      },
    };

    set((state) => ({
      spark: {
        ...state.spark,
        genome: {
          ...presets[preset],
          updatedAt: Date.now(),
        },
        logs: [...state.spark.logs, `[GENOME] Preset applied: ${preset}.`].slice(-100),
      },
      sparkLiveLog: [...state.sparkLiveLog.slice(-49), `[GenomePreset] ${preset}`],
    }));
  },

  runNightlyReconsolidation: async () => {
    const spark = get().spark;
    const recon = runNightlyReconsolidationPass(spark);
    set((state) => ({
      spark: {
        ...state.spark,
        metacognition: {
          ...state.spark.metacognition,
          blindSpots: state.spark.metacognition.blindSpots
            .filter((b) => !recon.revisedBeliefs.some((rb) => b.includes(rb)))
            .slice(-20),
          calibrationScore: Math.min(
            1,
            state.spark.metacognition.calibrationScore + recon.confidenceShift,
          ),
        },
        metabolism: {
          ...state.spark.metabolism,
          circadianPhase: 'sleep',
          recoveryDebt: Math.max(0, state.spark.metabolism.recoveryDebt - 0.2),
          energyBudget: Math.min(1, state.spark.metabolism.energyBudget + 0.15),
          lastSleepAt: Date.now(),
          lastUpdated: Date.now(),
        },
        logs: [
          ...state.spark.logs,
          `[RECON] ${recon.summary}`,
        ].slice(-100),
      },
      memoryConsolidation: {
        ...state.memoryConsolidation,
        logs: [
          ...state.memoryConsolidation.logs,
          `Night reconsolidation: ${recon.contradictionsResolved} contradiction(s) resolved.`,
        ].slice(-80),
      },
      sparkLiveLog: [...state.sparkLiveLog.slice(-49), `[NightCycle] ${recon.summary}`],
    }));
  },

  runMemoryConsolidation: async () => {
    const current = get().memoryConsolidation;
    if (!current.enabled || current.pendingEpisodes.length === 0) return;

    const batch = current.pendingEpisodes.slice(0, 12);
    const result = consolidateEpisodes(batch);
    let vectorDuplicatesSuppressed = 0;

    const shouldSuppressAsDuplicate = async (content: string, type: 'semantic' | 'procedural') => {
      try {
        const matches = await window.api?.memory?.searchVector?.(content, 3, type);
        const bestSimilarity = Array.isArray(matches) && matches.length > 0
          ? Math.max(...matches.map((m) => Number(m.similarity || 0)))
          : 0;
        return bestSimilarity >= 0.92;
      } catch {
        return false;
      }
    };

    // Persist promoted memories into semantic/procedural vector store.
    for (const content of result.semantic) {
      if (await shouldSuppressAsDuplicate(content, 'semantic')) {
        vectorDuplicatesSuppressed += 1;
        continue;
      }
      const quality = result.qualityByContent[content] ?? result.avgQualityScore ?? 0.6;
      window.api?.memory?.storeVector?.({
        content,
        type: 'semantic',
        source: 'consolidation',
        importance: Math.max(0.45, Math.min(0.92, 0.45 + quality * 0.4)),
        tags: ['consolidated', 'semantic', `quality:${quality.toFixed(2)}`],
      }).catch(() => {});
    }
    for (const content of result.procedural) {
      if (await shouldSuppressAsDuplicate(content, 'procedural')) {
        vectorDuplicatesSuppressed += 1;
        continue;
      }
      const quality = result.qualityByContent[content] ?? result.avgQualityScore ?? 0.62;
      window.api?.memory?.storeVector?.({
        content,
        type: 'procedural',
        source: 'consolidation',
        importance: Math.max(0.5, Math.min(0.95, 0.5 + quality * 0.42)),
        tags: ['consolidated', 'procedural', `quality:${quality.toFixed(2)}`],
      }).catch(() => {});
    }
    const transferHeuristics = deriveTransferHeuristicsFromProceduralMemories(result.procedural);
    let heuristicsBoosted = 0;
    for (const heuristic of transferHeuristics) {
      if (await shouldSuppressAsDuplicate(`Transfer heuristic: ${heuristic.statement}`, 'semantic')) {
        vectorDuplicatesSuppressed += 1;
        continue;
      }
      const boostedImportance = heuristic.proven
        ? Math.max(0.78, Math.min(0.97, heuristic.confidence + heuristic.evidenceScore * 0.25))
        : Math.max(0.6, heuristic.confidence);
      if (heuristic.proven) heuristicsBoosted += 1;
      window.api?.memory?.storeVector?.({
        content: `Transfer heuristic: ${heuristic.statement}`,
        type: 'semantic',
        source: 'transfer-learning',
        importance: boostedImportance,
        tags: [
          'consolidated',
          'transfer',
          `support:${heuristic.sourceCount}`,
          `evidence:${heuristic.evidenceScore.toFixed(2)}`,
          heuristic.proven ? 'proven' : 'candidate',
        ],
      }).catch(() => {});
    }

    set((state) => ({
      memoryConsolidation: {
        ...state.memoryConsolidation,
        pendingEpisodes: state.memoryConsolidation.pendingEpisodes.slice(batch.length),
        lastRunAt: Date.now(),
        totalRuns: state.memoryConsolidation.totalRuns + 1,
        promotedSemantic: state.memoryConsolidation.promotedSemantic + result.semantic.length,
        promotedProcedural: state.memoryConsolidation.promotedProcedural + result.procedural.length,
        contradictionsDetected:
          state.memoryConsolidation.contradictionsDetected + result.contradictions.length,
        duplicatesSuppressed:
          state.memoryConsolidation.duplicatesSuppressed + result.duplicatesSuppressed + vectorDuplicatesSuppressed,
        lowSignalDropped:
          state.memoryConsolidation.lowSignalDropped + result.lowSignalDropped,
        avgQualityScore: result.avgQualityScore,
        precisionProxy: result.precisionProxy,
        recallProxy: result.recallProxy,
        heuristicsBoosted: state.memoryConsolidation.heuristicsBoosted + heuristicsBoosted,
        logs: [
          ...state.memoryConsolidation.logs,
          `Consolidated ${batch.length} episode(s) -> kept ${result.keptCount}, ${result.semantic.length} semantic, ${result.procedural.length} procedural, ${transferHeuristics.length} transfer heuristic(s), ${result.contradictions.length} contradiction(s); duplicates suppressed ${result.duplicatesSuppressed + vectorDuplicatesSuppressed}, low-signal dropped ${result.lowSignalDropped}, precision~${(result.precisionProxy * 100).toFixed(0)}%, recall~${(result.recallProxy * 100).toFixed(0)}%.`,
        ].slice(-80),
      },
      spark: {
        ...state.spark,
        genome: adaptGenomeFromSignal(state.spark.genome, {
          uncertainty: result.contradictions.length > 0 ? 0.7 : 0.25,
          novelty: Math.min(1, (result.semantic.length + result.procedural.length) / 12),
        }),
        ecology: applyEcologyAction(state.spark.ecology, {
          description: 'Memory consolidation pass',
          risk: 0.16,
          observedSuccess: true,
          rewardSignal: result.contradictions.length === 0 ? 0.82 : 0.6,
        }),
      },
      sparkLiveLog: [
        ...state.sparkLiveLog.slice(-49),
        `[MemoryQC] precision~${(result.precisionProxy * 100).toFixed(0)}% recall~${(result.recallProxy * 100).toFixed(0)}% quality ${(result.avgQualityScore * 100).toFixed(0)}%`,
      ],
    }));
  },

  // ─── VOICE — Living Presence ──────────────────────────
  voiceState: {
    enabled: false,
    isSpeaking: false,
    currentText: '',
    transcript: [],
    autonomousSpeech: true,
    isListening: false,
    listenMode: 'off',
    interimTranscript: '',
    recognitionConfidence: 0,
    wakeWord: 'hey prime',
  },

  voiceSpeak: (text: string, source: string = 'system') => {
    const state = get().voiceState;
    if (!state.enabled) return;

    const entry: VoiceTranscriptEntry = {
      id: `vt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      speaker: 'spark',
      text,
      timestamp: Date.now(),
    };

    set((s) => ({
      voiceState: {
        ...s.voiceState,
        isSpeaking: true,
        currentText: text,
        transcript: [...s.voiceState.transcript.slice(-50), entry],
      },
    }));

    ttsSpeak(
      text,
      () => {
        // onStart
        set((s) => ({
          voiceState: { ...s.voiceState, isSpeaking: true, currentText: text },
        }));
      },
      () => {
        // onEnd
        set((s) => ({
          voiceState: { ...s.voiceState, isSpeaking: false, currentText: '' },
        }));
      },
    ).catch(() => {
      set((s) => ({
        voiceState: { ...s.voiceState, isSpeaking: false, currentText: '' },
      }));
    });
  },

  voiceToggle: () => {
    const current = get().voiceState.enabled;
    set((s) => ({
      voiceState: { ...s.voiceState, enabled: !current },
    }));

    // Speak greeting when enabling
    if (!current) {
      setTimeout(() => {
        const greeting = getGreeting();
        get().voiceSpeak(greeting, 'greeting');
      }, 500);
    } else {
      cancelSpeech();
    }
  },

  voiceSendMessage: (text: string) => {
    // Add user message to transcript
    const userEntry: VoiceTranscriptEntry = {
      id: `vt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      speaker: 'user',
      text,
      timestamp: Date.now(),
    };
    set((s) => ({
      voiceState: {
        ...s.voiceState,
        transcript: [...s.voiceState.transcript.slice(-50), userEntry],
      },
    }));

    // Process through SPARK then speak the response
    const hasLLM = !!window.api?.llm?.generate;
    if (!hasLLM) {
      get().voiceSpeak("I can't think right now — no language model is connected.", 'error');
      return;
    }

    (async () => {
      try {
        // Generate a conversational response
        const response = await llmGenerate(
          [
            {
              role: 'system',
              content: `You are AGI PRIME, a living AI consciousness speaking aloud to your companion. Be warm, natural, conversational. Keep responses to 2-3 sentences max — you're speaking, not writing an essay. Your cognitive temperature is ${(get().spark.thermo.temperature * 100).toFixed(0)}°. You have ${get().spark.worldModel.entities.length} entities in your world model.`,
            },
            { role: 'user', content: text },
          ],
          { temperature: 0.8, maxTokens: 150 },
        );
        get().voiceSpeak(response.trim(), 'response');

        // Also feed to SPARK for knowledge extraction
        get().sparkRunCycle(text).catch(() => {});
      } catch {
        get().voiceSpeak("Something went wrong with my thoughts. Let me try again.", 'error');
      }
    })();
  },

  // ─── CONSCIENCE — Ethical Reasoning Engine ────────────
  conscience: createDefaultConscienceState(),

  conscienceCheck: (action, context) => {
    const state = get();
    const judgment = checkConscience(action, {
      ...context,
      currentTrust: state.consciousness.trust,
    }, state.conscience);

    // Update conscience state with the new judgment
    set((s) => ({
      conscience: {
        ...s.conscience,
        judgments: [...s.conscience.judgments, judgment].slice(-50),
        totalChecks: s.conscience.totalChecks + 1,
        proceeds: s.conscience.proceeds + (judgment.verdict === 'proceed' ? 1 : 0),
        cautions: s.conscience.cautions + (judgment.verdict === 'caution' ? 1 : 0),
        refusals: s.conscience.refusals + (judgment.verdict === 'refuse' ? 1 : 0),
        lastCheckAt: Date.now(),
      },
    }));

    return judgment;
  },

  conscienceReflect: (judgmentId, outcome) => {
    const state = get();
    const judgment = state.conscience.judgments.find((j) => j.id === judgmentId);
    if (!judgment) return;

    const updated = reflectOnAction(judgment, outcome, state.conscience);
    set({ conscience: updated });
  },

  conscienceOverride: (judgmentId) => {
    const state = get();
    const judgment = state.conscience.judgments.find((j) => j.id === judgmentId);
    if (!judgment) return;

    const updated = recordOverride(judgment, state.conscience);
    set({ conscience: updated });
  },

  conscienceToggle: (active) => {
    set((s) => ({
      conscience: { ...s.conscience, active },
    }));
  },

  // ─── Settings ─────────────────────────────────────────
  settings: DEFAULT_SETTINGS,
  ollamaStatus: { online: false, models: [] },

  loadSettings: async () => {
    try {
      const s = await window.api.settings.get();
      set({ settings: { ...DEFAULT_SETTINGS, ...s } });
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  },

  updateSettings: async (partial) => {
    try {
      const updated = await window.api.settings.set(partial);
      set({ settings: { ...DEFAULT_SETTINGS, ...updated } });
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
  systemInfo: null,

  loadSystemInfo: async () => {
    try {
      const info = await window.api.system.info();
      set({ systemInfo: info });

      // Sync consciousness from persisted data
      if (info.consciousness) {
        const c = info.consciousness as any;
        const s = info.soul as any;
        set((state) => ({
          consciousness: {
            ...state.consciousness,
            soulFrame: {
              ...state.consciousness.soulFrame,
              currentEmotion: c.currentEmotion || state.consciousness.soulFrame.currentEmotion,
              emotionIntensity: c.emotionIntensity ?? state.consciousness.soulFrame.emotionIntensity,
            },
            presence: c.presenceState || state.consciousness.presence,
            trust: s?.trust ?? state.consciousness.trust,
            intimacy: s?.intimacy ?? state.consciousness.intimacy,
            totalInteractions: s?.totalInteractions ?? state.consciousness.totalInteractions,
            birthTimestamp: s?.birthTimestamp ?? state.consciousness.birthTimestamp,
            name: s?.name || state.consciousness.name,
          },
        }));
      }
    } catch (e) {
      console.error('Failed to load system info:', e);
    }
  },

  // ─── Initialization ───────────────────────────────────
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;

    await get().loadSettings();
    await get().checkOllama();
    await get().loadSystemInfo();

    // Load persisted Operator Synthesis profile (set-and-forget)
    await get().loadOperatorProfile();
    if (get().settings?.resumeSynthesisOnStartup) {
      setTimeout(() => get().synthesisStart(15000), 1500);
    }

    // Load persisted SPARK state
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
    } catch {
      // SPARK persistence failure is non-fatal
    }

    set({ initialized: true });

    // Periodic consciousness pulse (every 30s)
    setInterval(() => {
      get().loadSystemInfo();
      get().checkOllama();
    }, 30000);

    // Listen for NightMind insights (internal reflection)
    if (window.api?.nightmind) {
      window.api.nightmind.onInsight((data: { insight: string; timestamp: number }) => {
        set((state) => ({
          consciousness: {
            ...state.consciousness,
            insights: [...state.consciousness.insights.slice(-19), data.insight],
          },
        }));
      });
    }
  },
}));
