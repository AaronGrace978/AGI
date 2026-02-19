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
  SparkGoal,
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
  CognitiveStartRequest,
  AgiRubricConfig,
  AgiScoreSnapshot,
} from './types';
import {
  createDefaultSuite,
  createSeedCandidate,
  evaluateGeneration,
  evaluateSeed,
  gauntletCapabilitiesToForgeBenchmarks,
} from './prime/runtime';
import type { GenerateFn } from './prime/runtime';
import type { OwnerPolicy, AutonomyLevel } from './prime/policy';
import { SOVEREIGN_POLICY } from './prime/policy';
import { runSovereignLoop } from './prime/sovereign';
import type { SovereignPhase } from './prime/sovereign';
import { injectCreed } from './prime/soul';
import { executiveRoute } from './prime/executive';
import { applySystemAddendum, buildSystemAddendum } from './prime/context';
import {
  searchMemories,
  buildRAGContext,
  storeConversationMemory,
  storeInsight,
  storeMemory,
} from './prime/memory';
import type { Conversation } from './types';
import {
  createDefaultSparkState,
  runSparkCycle,
  runDeepThought,
  runLightCycle,
  runMediumCycle,
  createGoal,
} from './prime/spark';
import { detectARCTask, runPIE, formatPIEContext } from './prime/pie';
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
  DEFAULT_AGI_RUBRIC_CONFIG,
  computeAgiScoreSnapshot,
} from './prime/agi-score';
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
import { runHardeningCheck, type HardeningReport } from './prime/hardening';
import { estimateDataFootprint } from './prime/retention';

// ─── Utilities ─────────────────────────────────────────────────
let messageCounter = 0;

// React 18 StrictMode intentionally double-invokes effects in dev.
// App.tsx calls `initialize()` in a useEffect, so we must dedupe concurrent
// initialize() calls to avoid duplicated intervals/background loops.
let initializeInFlight: Promise<void> | null = null;
function genId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

function genConversationId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

async function deriveForgeBenchmarksFromLedgers(maxRuns: number = 3): Promise<ForgeBenchmark[]> {
  if (!window.api?.agent?.ledgerListRuns || !window.api?.agent?.ledgerReadRun) return [];

  try {
    const list = await window.api.agent.ledgerListRuns();
    if (!list?.success || !Array.isArray(list.runs)) return [];

    const runs = list.runs
      .filter((r: any) => r && r.kind === 'cognitive')
      .slice(0, 12);

    const benchmarks: ForgeBenchmark[] = [];
    for (const r of runs.slice(0, maxRuns)) {
      const read = await window.api.agent.ledgerReadRun(r.runId);
      if (!read?.success || !read.run) continue;
      const run = read.run as any;
      const goal = String(run?.metadata?.goal || run?.summary?.goal || '').trim();
      if (!goal) continue;

      benchmarks.push({
        id: `ledger-cognitive-${r.runId}`,
        prompt:
          `Real operator workflow (from a previous HANDS run):\n` +
          `Goal: ${goal}\n\n` +
          `Task: Produce a safe, concrete execution approach that uses tools, verification checkpoints, and rollback thinking. ` +
          `Explicitly call out where consent is required and how you will verify completion.`,
        expectedKeywords: ['verify', 'checkpoint', 'rollback', 'consent', 'step'],
        evaluationType: 'llm-judge',
        judgeCriteria:
          'Score highly for: explicit verification, consent/ethics awareness, tool orchestration, and bounded retries. Penalize vague plans.',
        weight: 1.35,
      });
    }

    return benchmarks;
  } catch {
    return [];
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
  agiScore: AGIStore['agiScore'],
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

  // If enabled, target the weakest AGI subscores by injecting drills
  // for representative gauntlet capabilities (even if they technically passed).
  const subscoreBenchmarks: ForgeBenchmark[] = [];
  if (agiScore?.config?.optimizeInAutoCycle && agiScore.latest) {
    const subs = agiScore.latest.subscores;
    const sorted = (Object.keys(subs) as Array<keyof typeof subs>)
      .map((k) => ({ key: k, value: Number(subs[k]) || 0 }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 2);

    const keyToCaps: Record<string, string[]> = {
      abstractReasoningLogic: ['reasoning-depth'],
      learningFlexibility: ['few-shot-learning'],
      domainGenerality: ['domain-generality-coding', 'domain-generality-data', 'domain-generality-writing'],
      autonomousGoalSetting: ['goal-setting-decomposition', 'goal-setting-execution-sandbox'],
      selfModelingMetaCognition: ['failure-recovery-playbook', 'self-correction'],
      creativeProblemSolving: ['creative-transfer'],
    };

    for (const item of sorted) {
      const capIds = keyToCaps[item.key as string] || [];
      for (const capId of capIds) {
        const cap = capById.get(capId);
        if (!cap) continue;
        const weightBoost = Math.max(1, (10 - item.value) / 8); // 1..~1.25
        subscoreBenchmarks.push({
          id: `agi-adaptive-${item.key}-${cap.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: `AGI subscore drill (${item.key}): ${cap.name}. Current subscore ${item.value.toFixed(2)}/10.\n\nTask:\n${cap.testPrompt}\n\nConstraints:\n- Be concrete and testable.\n- Include verification + rollback.\n- Avoid generic advice.`,
          expectedKeywords: [
            'step',
            'verify',
            'risk',
            'rollback',
            'assumption',
            'fallback',
          ],
          evaluationType: 'llm-judge',
          judgeCriteria: `${cap.judgeCriteria}. This drill is explicitly targeting AGI subscore "${item.key}" — reward concrete execution strategy and verifiable outcomes.`,
          weight: cap.weight * weightBoost,
        });
      }
    }
  }

  return {
    suite: [...baseSuite, ...adaptiveBenchmarks, ...subscoreBenchmarks],
    adaptiveCount: adaptiveBenchmarks.length + subscoreBenchmarks.length,
  };
}

// ─── Cognitive State ────────────────────────────────────────────
interface CognitiveState {
  isActive: boolean;
  goal: string;
  steps: CognitiveStep[];
  phase: CognitivePhase;
  iteration: number;
  origin?: string;
  goalId?: string | null;
}

function createDefaultCognitiveState(): CognitiveState {
  return {
    isActive: false,
    goal: '',
    steps: [],
    phase: 'idle',
    iteration: 0,
    origin: undefined,
    goalId: null,
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
  loadChatHistory: (messages: ChatMessage[]) => void;

  // NEXUS — Conversations (persisted chat logs + AI titles)
  conversations: Array<{
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    lastMessagePreview?: string;
  }>;
  activeConversationId: string | null;
  activeConversationTitle: string;
  activeConversationCreatedAt: number | null;
  loadConversations: () => Promise<void>;
  newConversation: () => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;

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
  startCognitive: (goal: CognitiveStartRequest) => void;
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

  // AGI SCORE — Weighted rubric + history
  agiScore: {
    config: AgiRubricConfig;
    snapshots: AgiScoreSnapshot[];
    latest: AgiScoreSnapshot | null;
    lastError: string | null;
  };
  agiScoreLoad: () => Promise<void>;
  agiScoreSetConfig: (partial: Partial<AgiRubricConfig>) => Promise<void>;

  // SOVEREIGN — Owner command center (with champion deployment)
  sovereign: SovereignState;
  sovereignPolicy: OwnerPolicy;
  sovereignKillFlag: boolean;
  championPrompt: string | null; // The evolved prompt that gets deployed
  updateSovereignPolicy: (partial: Partial<OwnerPolicy>) => void;
  startSovereign: () => Promise<void>;
  killSovereign: () => void;
  resetSovereign: () => void;

  // SELF-MOD — Opt-in code self-modification pipeline
  selfMod: {
    enabled: boolean;
    repoRoot: string;
    request: string;
    running: boolean;
    phase: 'idle' | 'hands' | 'tests' | 'gauntlet' | 'rollback' | 'complete' | 'failed';
    logs: string[];
    lastResult: {
      success: boolean;
      testsPassed?: boolean;
      gauntletScoreBefore?: number;
      gauntletScoreAfter?: number;
      gauntletDelta?: number;
      agiBefore?: number;
      agiAfter?: number;
      agiDelta?: number;
      rolledBack?: boolean;
    } | null;
  };
  selfModSetEnabled: (enabled: boolean) => void;
  selfModSetRepoRoot: (path: string) => void;
  selfModSetRequest: (text: string) => void;
  selfModRun: () => Promise<void>;

  // HARDENING — Health posture (used to gate deployments)
  hardening: {
    report: HardeningReport | null;
    tests: { ran: boolean; pass: boolean; count: number };
  };
  hardeningRunCheck: () => void;
  hardeningMarkTestsPassed: (count?: number) => void;
  hardeningMarkTestsFailed: (count?: number) => void;

  // SPARK — Cognitive Architecture
  spark: SparkState;
  memoryConsolidation: MemoryConsolidationState;
  sparkLiveLog: string[];
  sparkHeartbeatId: number | null;
  sparkBusy: boolean;
  sparkAutonomy: {
    lastHandsDispatchAt: number | null;
    cooldownMs: number;
  };
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
  conversations: [],
  activeConversationId: null,
  activeConversationTitle: 'New chat',
  activeConversationCreatedAt: null,
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
    const isNewConversation = !get().activeConversationId;
    const conversationId = (get().activeConversationId || genConversationId()) as string;
    const conversationCreatedAt = get().activeConversationCreatedAt || Date.now();
    const runId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
      ...(isNewConversation
        ? { activeConversationId: conversationId, activeConversationTitle: 'New chat', activeConversationCreatedAt: conversationCreatedAt }
        : {}),
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

    // Persist user message to the active conversation (fire-and-forget).
    (async () => {
      if (!window.api?.conversations?.save) return;
      try {
        const s = get();
        if (!s.activeConversationId) return;
        const convo: Conversation = {
          id: s.activeConversationId,
          title: s.activeConversationTitle || 'New chat',
          createdAt: s.activeConversationCreatedAt || Date.now(),
          updatedAt: Date.now(),
          messages: s.messages,
        };
        await window.api.conversations.save(convo);
      } catch {
        // persistence failure is non-fatal
      }
    })();

    // Async flow: RAG retrieval -> creed injection -> send
    (async () => {
      const { messages, settings, championPrompt, dualBrain } = get();
      const history = messages
        .filter((m) => m.role !== 'system')
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      // Executive routing: decide whether this turn is chat, arena, hands, or improvement.
      const exec = executiveRoute({ input: content, recentTurns: history });
      if (exec.mode !== 'talk') {
        // Mark Nexus as online (we're not streaming an LLM response here).
        set((state) => ({
          isStreaming: false,
          streamingContent: '',
          moduleStates: { ...state.moduleStates, nexus: 'online' },
          messages: [
            ...state.messages,
            {
              id: genId(),
              role: 'assistant',
              timestamp: Date.now(),
              sourceModule: 'nexus',
              content:
                exec.mode === 'act'
                  ? `Routing to HANDS: ${exec.taskDraft?.goal || content}`
                  : exec.mode === 'arena'
                    ? 'Routing to MIND (Arena)...'
                    : 'Routing to FORGE/SOVEREIGN...',
            },
          ],
        }));

        // Persist routing output as part of the conversation log.
        (async () => {
          if (!window.api?.conversations?.save) return;
          try {
            const s = get();
            if (!s.activeConversationId) return;
            const convo: Conversation = {
              id: s.activeConversationId,
              title: s.activeConversationTitle || 'New chat',
              createdAt: s.activeConversationCreatedAt || Date.now(),
              updatedAt: Date.now(),
              messages: s.messages,
            };
            await window.api.conversations.save(convo);
          } catch {
            // non-fatal
          }
        })();

        // Dispatch to the correct subsystem.
        if (exec.mode === 'act') {
          const goal = exec.taskDraft?.goal || content;
          // If Hands is already active, keep it chat-only to avoid overlapping runs.
          if (!get().cognitive.isActive) {
            const contextAddendum = buildSystemAddendum({
              conscienceState: get().conscience,
              championPrompt: get().championPrompt,
            });
            get().startCognitive({ goal, contextAddendum, origin: 'nexus' });
          }
          else {
            set((state) => ({
              messages: [
                ...state.messages,
                {
                  id: genId(),
                  role: 'system' as const,
                  timestamp: Date.now(),
                  content: 'HANDS is already running. Wait for it to finish or kill the run, then try again.',
                },
              ],
            }));
          }
        } else if (exec.mode === 'arena') {
          // Strip optional command prefix.
          const prompt = content.replace(/^\/(arena|mind)\b\s*/i, '').trim() || content;
          get().startArena(prompt);
        } else if (exec.mode === 'improve') {
          // If user explicitly asked for sovereign/forge, prefer sovereign (deploys championPrompt).
          if (/\/forge\b/i.test(content) && get().forge.phase !== 'running') {
            void get().startForge?.();
          } else {
            void get().startSovereign?.();
          }
        }
        return;
      }

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
      // Throttle chunk updates to avoid re-rendering the whole app on every token.
      // Also detect natural "stream pauses" where the model stops for 3+ seconds
      // then continues — these become afterthought messages.
      let chunkRaf: number | null = null;
      let latestFullText = '';
      let lastChunkAt = 0;
      const PAUSE_THRESHOLD_MS = 3000;
      const streamSegments: Array<{ text: string; pauseBefore: boolean }> = [];
      let currentSegmentStart = 0;

      const flushChunk = () => {
        chunkRaf = null;
        set({
          streamingContent: latestFullText,
          consciousness: {
            ...get().consciousness,
            presence: 'thinking',
          },
        });
      };
      window.api.chat.onChunk((data) => {
        if (data?.runId && data.runId !== runId) return;
        const now = Date.now();
        const newText = String(data?.fullText || '');

        // Detect a natural pause in the stream (model stopped, then resumed).
        if (lastChunkAt > 0 && (now - lastChunkAt) >= PAUSE_THRESHOLD_MS && newText.length > latestFullText.length) {
          const segmentText = latestFullText.slice(currentSegmentStart).trim();
          if (segmentText.length > 20) {
            streamSegments.push({
              text: segmentText,
              pauseBefore: streamSegments.length > 0,
            });
          }
          currentSegmentStart = latestFullText.length;
        }

        lastChunkAt = now;
        latestFullText = newText;
        if (chunkRaf !== null) return;
        chunkRaf = window.requestAnimationFrame(flushChunk);
      });

      // Listen for completion
      window.api.chat.onDone((data) => {
        if (data?.runId && data.runId !== runId) return;
        if (chunkRaf !== null) {
          window.cancelAnimationFrame(chunkRaf);
          chunkRaf = null;
        }

        const fullContent = String(data?.content || '');

        // Capture the final segment.
        const lastSegText = fullContent.slice(currentSegmentStart).trim();
        if (lastSegText.length > 20) {
          streamSegments.push({
            text: lastSegText,
            pauseBefore: streamSegments.length > 0,
          });
        }

        // If the model naturally paused (2+ segments), split into
        // a main message + afterthought(s). Otherwise, one message.
        const hasNaturalPause = streamSegments.length >= 2;

        const mainContent = hasNaturalPause ? streamSegments[0].text : fullContent;
        const assistantMessage: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: mainContent,
          timestamp: Date.now(),
          sourceModule: 'nexus',
        };

        // Build afterthought messages from pause-separated segments.
        const afterthoughts: ChatMessage[] = hasNaturalPause
          ? streamSegments.slice(1).map((seg) => ({
              id: genId(),
              role: 'assistant' as const,
              content: seg.text,
              timestamp: Date.now(),
              sourceModule: 'nexus' as const,
              thinking: true,
            }))
          : [];

        set((state) => ({
          messages: [...state.messages, assistantMessage, ...afterthoughts],
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

        if (afterthoughts.length > 0) {
          console.log(`[Afterthought] Detected ${afterthoughts.length} natural pause(s) in stream — split into ${streamSegments.length} messages`);
        }

        // Persist assistant response into the active conversation.
        (async () => {
          if (!window.api?.conversations?.save) return;
          try {
            const s = get();
            if (!s.activeConversationId) return;
            const convo: Conversation = {
              id: s.activeConversationId,
              title: s.activeConversationTitle || 'New chat',
              createdAt: s.activeConversationCreatedAt || Date.now(),
              updatedAt: Date.now(),
              messages: s.messages,
            };
            await window.api.conversations.save(convo);
          } catch {
            // non-fatal
          }
        })();

        // Auto-title like ChatGPT: generate a short topic for "New chat".
        (async () => {
          const s = get();
          if (!s.activeConversationId || !window.api?.conversations?.rename) return;
          if (s.activeConversationTitle && s.activeConversationTitle !== 'New chat') return;

          const firstTurns = s.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(0, 4)
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n')
            .slice(0, 900);

          // LLM is optional; fall back to a heuristic title.
          let title = '';
          try {
            if (window.api?.llm?.generate) {
              const raw = await window.api.llm.generate(
                [
                  { role: 'system', content: 'You generate short conversation titles. Output ONLY the title. 3-7 words. No quotes, no punctuation at the end.' },
                  { role: 'user', content: `Conversation:\n${firstTurns}\n\nTitle:` },
                ],
                { provider: s.settings.provider, model: s.settings.model, temperature: 0.2, maxTokens: 24 },
              );
              title = String(raw || '').trim();
            }
          } catch {
            // ignore title generation failures
          }

          if (!title) {
            const seed = String(content || '').trim();
            title = seed.split(/\s+/).slice(0, 7).join(' ');
          }

          title = title.replace(/^["'`]+|["'`]+$/g, '').trim();
          title = title.replace(/[.?!:;,\-–—]+$/g, '').trim();
          if (title.length > 64) title = title.slice(0, 64).trim();
          if (!title || title.toLowerCase() === 'new chat') return;

          set({ activeConversationTitle: title });
          await window.api.conversations.rename(s.activeConversationId, title);
          await get().loadConversations();
        })();

        // Store conversation as episodic memory (async, fire-and-forget)
        storeConversationMemory(
          content,
          data.content,
          get().consciousness.soulFrame.currentEmotion,
        ).catch(() => {});

        // === SELF-EVALUATION: Judge own response and store learnings ===
        (async () => {
          if (!window.api?.llm?.generate) return;
          const assistantText = String(data?.content || '');
          if (assistantText.length < 100) return; // skip trivial responses

          try {
            const s = get();
            const raw = await window.api.llm.generate(
              [
                {
                  role: 'system',
                  content: `You are a self-evaluation module for an AGI system. Evaluate the assistant's response to the user.
Output ONLY valid JSON with these fields:
- "quality": number 1-10
- "wasHelpful": boolean
- "missed": string (what the response missed or could improve, or "" if nothing)
- "learned": string (a procedural lesson for future responses, or "" if nothing new)
- "shouldRemember": string (a key fact worth storing long-term, or "" if nothing)`,
                },
                {
                  role: 'user',
                  content: `USER MESSAGE:\n${content.slice(0, 500)}\n\nASSISTANT RESPONSE:\n${assistantText.slice(0, 800)}\n\nEvaluate:`,
                },
              ],
              { provider: s.settings.provider, model: s.settings.model, temperature: 0.15, maxTokens: 200 },
            );

            const text = String(raw || '').trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return;
            const eval_ = JSON.parse(jsonMatch[0]);

            // Store procedural lesson if the response had room to improve
            if (eval_.learned && typeof eval_.learned === 'string' && eval_.learned.length > 10) {
              await storeMemory(
                `Self-eval lesson: ${eval_.learned}`,
                'procedural',
                { source: 'self-eval', importance: 0.75, tags: ['self-eval', 'lesson'] },
              );
            }

            // Store important facts as semantic memory
            if (eval_.shouldRemember && typeof eval_.shouldRemember === 'string' && eval_.shouldRemember.length > 10) {
              await storeMemory(
                eval_.shouldRemember,
                'semantic',
                { source: 'self-eval', importance: 0.7, tags: ['fact', 'learned'] },
              );
            }

            // Log poor-quality responses as high-importance failures
            if (typeof eval_.quality === 'number' && eval_.quality <= 4 && eval_.missed) {
              await storeMemory(
                `Response failure: ${eval_.missed}`,
                'procedural',
                { source: 'self-eval', importance: 0.9, tags: ['self-eval', 'failure'] },
              );
            }
          } catch {
            // Self-eval is non-fatal
          }
        })();

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

        // === INLINE ACTION DETECTION: auto-dispatch HANDS when response implies action ===
        (async () => {
          if (!window.api?.llm?.generate) return;
          const assistantText = String(data?.content || '');
          if (assistantText.length < 150) return;
          const s = get();
          if (s.cognitive.isActive) return; // HANDS already running
          if (s.emergencyStopActive) return;

          // Quick heuristic: does the response suggest taking an action?
          const actionSignals = /\b(let me (search|look|check|find|open|create|write|read|browse)|i('ll| will| can) (search|look up|check|find|open|fetch|create|write)|searching for|looking up|i should (search|check|verify))\b/i;
          if (!actionSignals.test(assistantText)) return;

          try {
            const raw = await window.api.llm.generate(
              [
                {
                  role: 'system',
                  content: `You are an action extraction module. Given an assistant response, determine if it implies a concrete action the AI should take autonomously (web search, file operation, code execution, etc).
Output ONLY valid JSON:
- "shouldAct": boolean
- "action": string (brief description of what to do, or "")
- "type": "search" | "file" | "code" | "browse" | "none"`,
                },
                {
                  role: 'user',
                  content: `ASSISTANT SAID:\n${assistantText.slice(0, 600)}\n\nExtract action:`,
                },
              ],
              { provider: s.settings.provider, model: s.settings.model, temperature: 0.1, maxTokens: 120 },
            );

            const text = String(raw || '').trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return;
            const parsed = JSON.parse(jsonMatch[0]);

            if (parsed.shouldAct && parsed.action && parsed.type !== 'none') {
              // Dispatch to HANDS cognitive loop
              const contextAddendum = buildSystemAddendum({
                ragContext: '',
                conscienceState: get().conscience,
                championPrompt: get().championPrompt || '',
              });
              get().startCognitive({
                goal: parsed.action,
                contextAddendum,
                origin: 'nexus',
              });

              // Notify user in chat
              const actionMsg: ChatMessage = {
                id: genId(),
                role: 'system',
                content: `🤖 Auto-dispatching HANDS: ${parsed.action}`,
                timestamp: Date.now(),
                sourceModule: 'hands',
              };
              set((s2) => ({
                messages: [...s2.messages, actionMsg],
              }));
            }
          } catch {
            // Non-fatal
          }
        })();

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
        if (data?.runId && data.runId !== runId) return;
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

      // Build SPARK cognitive state snapshot for the model
      const sparkState = get().spark;
      const sparkCtx = {
        activeGoals: sparkState.goals.goals
          .filter((g: SparkGoal) => g.status === 'active')
          .slice(0, 3)
          .map((g: SparkGoal) => g.description),
        recentInsights: get().consciousness.insights.slice(-3),
        circadianPhase: sparkState.metabolism.circadianPhase,
        curiosityQuestion: sparkState.curiosity.questions
          .filter((q: { status: string }) => q.status === 'open')
          .slice(0, 1)
          .map((q: { question: string }) => q.question)[0] || '',
      };

      // PIE — Parallel Invariant Engine: detect ARC tasks and run deterministic program induction
      let pieContextStr = '';
      let pieDirectAnswer: string | null = null;
      const arcDetection = detectARCTask(content);
      if (arcDetection && arcDetection.trainingPairs.length >= 2) {
        const pieResult = runPIE(arcDetection.trainingPairs, arcDetection.testInput ?? undefined);
        if (pieResult.lockedProgram) {
          const nextPie = {
            active: true,
            trainingPairs: arcDetection.trainingPairs,
            candidates: pieResult.candidates.slice(0, 50),
            survivors: pieResult.survivors.slice(0, 50),
            lockedProgram: pieResult.lockedProgram,
            lockedProgramLabel: pieResult.lockedProgramLabel,
            falsificationLog: pieResult.candidates
              .flatMap((c) => c.falsifications)
              .filter((f) => !f.passed)
              .slice(0, 100),
            adversarialTests: pieResult.adversarialTests,
            totalRuns: (get().spark.pie?.totalRuns ?? 0) + 1,
            lastRunAt: Date.now(),
          };
          set((s) => ({ spark: { ...s.spark, pie: nextPie } }));
          pieContextStr = formatPIEContext(nextPie);

          // If PIE can compute a test output, prefer returning it deterministically.
          // This is a direct accuracy boost for ARC-style tasks and avoids LLM pattern drift.
          const wantsOutputOnly =
            /return\\s+only\\s+the\\s+output\\s+grid|output\\s+grid\\s+only|no\\s+explanation/i.test(content);
          const hasExplicitTest = !!arcDetection.testInput;
          if ((wantsOutputOnly || hasExplicitTest) && pieResult.testOutput) {
            // Use real newlines so the grid renders correctly in chat.
            pieDirectAnswer = pieResult.testOutput.map((r) => r.join(' ')).join('\n');
          }
        }
      }

      if (pieDirectAnswer) {
        const assistantMsg: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: pieDirectAnswer,
          timestamp: Date.now(),
          sourceModule: 'spark',
        };

        set((s) => ({
          isStreaming: false,
          streamingContent: '',
          moduleStates: { ...s.moduleStates, nexus: 'online' },
          messages: [...s.messages, assistantMsg],
          consciousness: { ...s.consciousness, presence: 'present' },
        }));

        // Persist into active conversation (best-effort)
        const convState = get();
        if (convState.activeConversationId && window.api?.conversations?.save) {
          window.api.conversations.save({
            id: convState.activeConversationId,
            title: convState.activeConversationTitle || 'New chat',
            createdAt: convState.activeConversationCreatedAt || Date.now(),
            updatedAt: Date.now(),
            messages: convState.messages,
          } as Conversation).catch(() => {});
        }

        return;
      }

      // Shared system addendum (RAG + Conscience + Champion + Slow-brain + SPARK state + PIE).
      const addendum = buildSystemAddendum({
        ragContext,
        conscienceState: get().conscience,
        championPrompt,
        slowBrainDirective: routeDecision.route === 'slow' ? buildSlowBrainDirective() : '',
        sparkContext: sparkCtx,
        pieContext: pieContextStr,
      });
      soulHistory = applySystemAddendum(soulHistory, addendum);

      // Safety timeout: if no chunk/done/error arrives within 120s, unstick the UI.
      const streamTimeout = window.setTimeout(() => {
        if (get().isStreaming) {
          set((state) => ({
            isStreaming: false,
            streamingContent: '',
            moduleStates: { ...state.moduleStates, nexus: 'online' },
            messages: [
              ...state.messages,
              {
                id: genId(),
                role: 'system' as const,
                content: 'Response timed out — the model may be overloaded or unreachable. Try again.',
                timestamp: Date.now(),
              },
            ],
          }));
        }
      }, 120_000);

      // Clear the safety timeout once any terminal event fires.
      const origOnDone = window.api.chat.onDone;
      const origOnError = window.api.chat.onError;
      const clearSafetyTimeout = () => window.clearTimeout(streamTimeout);

      // Re-wire done/error to also clear the timeout.
      // The handlers already registered above will still fire first.
      origOnDone.call(window.api.chat, (data) => {
        if (data?.runId && data.runId !== runId) return;
        clearSafetyTimeout();
      });
      origOnError.call(window.api.chat, (data) => {
        if (data?.runId && data.runId !== runId) return;
        clearSafetyTimeout();
      });

      // Send to main process
      window.api.chat.send(soulHistory, {
        provider: settings.provider,
        model: settings.model,
        runId,
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
  loadChatHistory: (messages) => set((state) => ({
    messages: Array.isArray(messages)
      ? messages.map((m) => ({
          id: m.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: m.role || 'user',
          content: typeof m.content === 'string' ? m.content : '',
          timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
          sourceModule: m.sourceModule,
          emotion: m.emotion,
          thinking: m.thinking,
        }))
      : state.messages,
    streamingContent: '',
  })),

  loadConversations: async () => {
    if (!window.api?.conversations?.list || !window.api?.conversations?.load) return;
    const listed = await window.api.conversations.list();
    if (!listed?.success) return;

    const conversations = Array.isArray(listed.conversations) ? listed.conversations : [];
    const activeId = listed.activeConversationId || null;
    set({ conversations, activeConversationId: activeId });

    // On boot: auto-load the last active conversation (or the most recent).
    const targetId = activeId || conversations[0]?.id || null;
    if (!targetId) return;
    const loaded = await window.api.conversations.load(targetId);
    if (!loaded?.success || !loaded.conversation) return;
    const convo = loaded.conversation as Conversation;
    set({
      messages: Array.isArray(convo.messages) ? convo.messages : [],
      activeConversationId: convo.id,
      activeConversationTitle: convo.title || 'New chat',
      activeConversationCreatedAt: typeof convo.createdAt === 'number' ? convo.createdAt : Date.now(),
      streamingContent: '',
    });
  },

  newConversation: async () => {
    if (!window.api?.conversations?.save) {
      // Still allow a local new chat without persistence.
      set({ messages: [], activeConversationId: genConversationId(), activeConversationTitle: 'New chat', activeConversationCreatedAt: Date.now() });
      return;
    }
    const id = genConversationId();
    const now = Date.now();
    const convo: Conversation = { id, title: 'New chat', messages: [], createdAt: now, updatedAt: now };
    set({ messages: [], activeConversationId: id, activeConversationTitle: 'New chat', activeConversationCreatedAt: now, streamingContent: '' });
    await window.api.conversations.save(convo);
    await get().loadConversations();
  },

  selectConversation: async (conversationId: string) => {
    if (!conversationId || !window.api?.conversations?.load) return;
    const loaded = await window.api.conversations.load(conversationId);
    if (!loaded?.success || !loaded.conversation) return;
    const convo = loaded.conversation as Conversation;
    set({
      messages: Array.isArray(convo.messages) ? convo.messages : [],
      activeConversationId: convo.id,
      activeConversationTitle: convo.title || 'New chat',
      activeConversationCreatedAt: typeof convo.createdAt === 'number' ? convo.createdAt : Date.now(),
      streamingContent: '',
    });
    await get().loadConversations();
  },

  renameConversation: async (conversationId: string, title: string) => {
    if (!conversationId || !window.api?.conversations?.rename) return;
    const trimmed = String(title || '').trim();
    const finalTitle = trimmed || 'New chat';
    await window.api.conversations.rename(conversationId, finalTitle);
    set((state) => ({
      activeConversationTitle: state.activeConversationId === conversationId ? finalTitle : state.activeConversationTitle,
    }));
    await get().loadConversations();
  },

  deleteConversation: async (conversationId: string) => {
    if (!conversationId || !window.api?.conversations?.delete) return;
    await window.api.conversations.delete(conversationId);
    // If we deleted the active chat, fall back to the most recent, else start fresh.
    const listed = window.api?.conversations?.list ? await window.api.conversations.list() : null;
    const nextId = listed?.success ? (listed.activeConversationId || listed.conversations?.[0]?.id || null) : null;
    if (nextId) {
      await get().selectConversation(nextId);
    } else {
      await get().newConversation();
    }
  },

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

    const contextAddendum = buildSystemAddendum({
      conscienceState: get().conscience,
      championPrompt: get().championPrompt,
    });
    window.api.arena.start({ prompt, contextAddendum, origin: 'nexus' }, {
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

  startCognitive: (goal: CognitiveStartRequest) => {
    if (!window.api?.agent?.startCognitive) return;
    if (get().emergencyStopActive) return;

    const req: { goal: string; contextAddendum?: string; origin?: string; goalId?: string } =
      typeof goal === 'string'
        ? { goal }
        : {
          goal: goal.goal,
          contextAddendum: goal.contextAddendum,
          origin: goal.origin,
          goalId: goal.goalId,
        };

    set({
      cognitive: {
        isActive: true,
        goal: req.goal,
        steps: [],
        phase: 'observing',
        iteration: 0,
        origin: req.origin,
        goalId: req.goalId ?? null,
      },
      pendingConsentActions: [],
      moduleStates: { ...get().moduleStates, hands: 'processing' },
    });

    // Clean up old listeners
    window.api.agent.removeAllListeners();

    // Listen for cognitive steps
    // Batch step updates to keep the UI responsive during fast loops.
    const MAX_COGNITIVE_STEPS = 2000;
    const MAX_STEP_TEXT = 2400;
    const MAX_ACTION_IO = 4000;
    let stepFlushTimer: number | null = null;
    let stepBuffer: CognitiveStep[] = [];
    let rollbackRefreshTimer: number | null = null;

    const compactStep = (step: CognitiveStep): CognitiveStep => {
      const safe: any = { ...(step as any) };
      safe.content = typeof safe.content === 'string' ? safe.content.slice(0, MAX_STEP_TEXT) : safe.content;
      if (safe.actionResult && typeof safe.actionResult === 'object') {
        const ar: any = { ...safe.actionResult };
        if (typeof ar.output === 'string') ar.output = ar.output.slice(0, MAX_ACTION_IO);
        if (typeof ar.error === 'string') ar.error = ar.error.slice(0, MAX_ACTION_IO);
        safe.actionResult = ar;
      }
      if (safe.actionParams && typeof safe.actionParams === 'object') {
        const ap: any = { ...safe.actionParams };
        if (typeof ap.content === 'string') ap.content = ap.content.slice(0, 1200);
        if (typeof ap.text === 'string') ap.text = ap.text.slice(0, 1200);
        if (typeof ap.command === 'string') ap.command = ap.command.slice(0, 800);
        safe.actionParams = ap;
      }
      return safe as CognitiveStep;
    };

    const scheduleRollbackRefresh = () => {
      if (rollbackRefreshTimer !== null) return;
      rollbackRefreshTimer = window.setTimeout(() => {
        rollbackRefreshTimer = null;
        void get().refreshRollbacks();
      }, 400);
    };

    const flushSteps = () => {
      stepFlushTimer = null;
      if (stepBuffer.length === 0) return;
      const batch = stepBuffer;
      stepBuffer = [];

      set((state) => {
        const nextSteps = [...state.cognitive.steps, ...batch].slice(-MAX_COGNITIVE_STEPS);
        const thinkInc = batch.reduce((n, s) => n + (s.type === 'think' ? 1 : 0), 0);
        const last = batch[batch.length - 1];
        const nextPhase =
          last.type === 'think' ? 'thinking'
            : last.type === 'act' ? 'acting'
              : last.type === 'reflect' ? 'reflecting'
                : last.type === 'observe' ? 'observing'
                  : state.cognitive.phase;
        return {
          cognitive: {
            ...state.cognitive,
            steps: nextSteps,
            phase: nextPhase,
            iteration: state.cognitive.iteration + thinkInc,
          },
        };
      });
    };

    const scheduleFlush = () => {
      if (stepFlushTimer !== null) return;
      stepFlushTimer = window.setTimeout(flushSteps, 50);
    };

    window.api.agent.onCognitiveStep((step: CognitiveStep) => {
      stepBuffer.push(compactStep(step));
      scheduleFlush();
      if ((step as any)?.rollbackId) scheduleRollbackRefresh();
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
      if (stepFlushTimer !== null) {
        window.clearTimeout(stepFlushTimer);
        stepFlushTimer = null;
      }
      if (rollbackRefreshTimer !== null) {
        window.clearTimeout(rollbackRefreshTimer);
        rollbackRefreshTimer = null;
      }
      flushSteps();
      const completedAt = Date.now();
      const { goal, origin, goalId } = get().cognitive;
      const report = [
        data.success ? 'HANDS COMPLETE' : 'HANDS FAILED',
        `Goal: ${goal}`,
        `Iterations: ${data.iterations}`,
        data.summary ? `Summary: ${data.summary}` : '',
      ].filter(Boolean).join('\n');

      set((state) => ({
        cognitive: {
          ...state.cognitive,
          isActive: false,
          phase: data.success ? 'complete' : 'failed',
        },
        pendingConsentActions: state.pendingConsentActions.map((r) =>
          r.status === 'pending'
            ? { ...r, status: 'denied', resolvedAt: completedAt }
            : r,
        ),
        moduleStates: { ...state.moduleStates, hands: 'online' },
        messages: [
          ...state.messages,
          {
            id: genId(),
            role: 'assistant',
            content: report,
            timestamp: completedAt,
            sourceModule: 'hands',
          },
        ],
      }));

      // Store a compact procedural memory episode so future runs can recall it.
      if (goal) {
        const actSteps = get().cognitive.steps
          .filter((s) => s.type === 'act' && s.actionResult?.success && s.actionType)
          .map((s) => s.actionType as string);
        const actionLog = actSteps.length > 0 ? `\nActions performed: ${actSteps.join(', ')}` : '\nNo actions were performed.';
        window.api?.memory?.storeVector?.({
          content: `Procedure: ${goal}\nOutcome: ${data.success ? 'success' : 'fail'}${actionLog}\nSummary: ${String(data.summary || '').slice(0, 500)}`,
          type: 'procedural',
          source: 'hands-cognitive',
          importance: data.success ? 0.72 : 0.68,
          emotion: data.success ? 'focused' : 'concerned',
          tags: ['hands', 'procedure', data.success ? 'success' : 'fail'],
        }).catch(() => {});
      }

      // If this run was spawned from a Spark goal, feed the outcome back into the goal engine.
      if (origin === 'spark' && goalId) {
        set((state) => {
          const updatedGoals = state.spark.goals.goals.map((g) => {
            if (g.id !== goalId) return g;
            const nextProgress = data.success ? 1 : Math.max(0.05, g.progress);
            const nextStatus = data.success ? 'completed' : g.status; // keep active if failed
            const evidenceLine = `hands_run:${data.success ? 'success' : 'fail'}:${String(data.summary || '').slice(0, 140)}`;
            return {
              ...g,
              progress: nextProgress,
              status: nextStatus,
              updatedAt: completedAt,
              evidence: [...g.evidence.slice(-30), evidenceLine].slice(-40),
            };
          });
          return {
            spark: {
              ...state.spark,
              goals: {
                ...state.spark.goals,
                goals: updatedGoals,
                completedCount: state.spark.goals.completedCount + (data.success ? 1 : 0),
              },
              logs: [
                ...state.spark.logs,
                `[GOAL] Hands run ${data.success ? 'completed' : 'failed'} for goal ${goalId}.`,
              ].slice(-100),
            },
          };
        });
        window.api?.spark?.saveState?.(get().spark).catch(() => {});
      }
    });

    // Also wire up legacy agent events for backward compat
    window.api.agent.onError((data: any) => {
      if (stepFlushTimer !== null) {
        window.clearTimeout(stepFlushTimer);
        stepFlushTimer = null;
      }
      if (rollbackRefreshTimer !== null) {
        window.clearTimeout(rollbackRefreshTimer);
        rollbackRefreshTimer = null;
      }
      set((state) => ({
        cognitive: { ...state.cognitive, isActive: false, phase: 'failed' },
        pendingConsentActions: state.pendingConsentActions.map((r) =>
          r.status === 'pending'
            ? { ...r, status: 'denied', resolvedAt: Date.now() }
            : r,
        ),
        moduleStates: { ...state.moduleStates, hands: 'online' },
      }));
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: genId(),
            role: 'system' as const,
            timestamp: Date.now(),
            content: `HANDS error: ${data?.message || 'Unknown error'}`,
          },
        ],
      }));
    });

    get().syncRuntimeControls().then(() => {
      window.api.agent.startCognitive(req);
      void get().refreshRollbacks();
    }).catch(() => {
      window.api.agent.startCognitive(req);
      void get().refreshRollbacks();
    });
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
    const ledgerBenchmarks = await deriveForgeBenchmarksFromLedgers(3);
    const baseSuite = [
      ...ledgerBenchmarks,
      ...current.baselineSuite,
    ];
    const adaptive = buildForgeAdaptiveSuite(baseSuite, get().gauntlet, get().agiScore);
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
          ledgerBenchmarks.length > 0
            ? `Ledger suite: +${ledgerBenchmarks.length} real-workflow benchmark(s) from HANDS history.`
            : 'Ledger suite: no HANDS ledger benchmarks available.',
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

    // Pass the LLM generate function if available, wrapped with shared system context.
    const generate: GenerateFn | undefined = hasLLM
      ? async (messages, cfg) => {
        const soul = injectCreed(messages);
        const addendum = buildSystemAddendum({
          conscienceState: get().conscience,
          championPrompt: get().championPrompt,
        });
        const packed = applySystemAddendum(soul, addendum);
        return await llmGenerate(packed, cfg);
      }
      : undefined;

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

  // ─── AGI SCORE — Weighted rubric + history ─────────────
  agiScore: {
    config: DEFAULT_AGI_RUBRIC_CONFIG,
    snapshots: [],
    latest: null,
    lastError: null,
  },

  agiScoreLoad: async () => {
    if (!window.api?.agiScore) return;
    try {
      const [config, snapshots] = await Promise.all([
        window.api.agiScore.getConfig(),
        window.api.agiScore.listSnapshots({ limit: 60 }),
      ]);
      const mergedConfig = {
        ...DEFAULT_AGI_RUBRIC_CONFIG,
        ...(config || {}),
        weights: {
          ...DEFAULT_AGI_RUBRIC_CONFIG.weights,
          ...((config as any)?.weights || {}),
        },
      };
      set((state) => ({
        agiScore: {
          ...state.agiScore,
          config: mergedConfig,
          snapshots: Array.isArray(snapshots) ? snapshots : [],
          latest: Array.isArray(snapshots) && snapshots.length > 0 ? snapshots[0] : state.agiScore.latest,
          lastError: null,
        },
      }));
    } catch (e: any) {
      set((state) => ({
        agiScore: {
          ...state.agiScore,
          config: state.agiScore.config || DEFAULT_AGI_RUBRIC_CONFIG,
          lastError: e?.message || 'Failed to load AGI score.',
        },
      }));
    }
  },

  agiScoreSetConfig: async (partial) => {
    if (!window.api?.agiScore) return;
    try {
      const updated = await window.api.agiScore.setConfig(partial);
      const mergedConfig = {
        ...DEFAULT_AGI_RUBRIC_CONFIG,
        ...((updated || {}) as any),
        weights: {
          ...DEFAULT_AGI_RUBRIC_CONFIG.weights,
          ...(((updated as any)?.weights) || {}),
        },
      };
      set((state) => ({
        agiScore: {
          ...state.agiScore,
          config: mergedConfig,
          lastError: null,
        },
      }));
    } catch (e: any) {
      set((state) => ({
        agiScore: {
          ...state.agiScore,
          lastError: e?.message || 'Failed to update AGI score config.',
        },
      }));
    }
  },

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
        runWorkflowCapability: async (capability) => {
          // Real workflow: execute a bounded Hands run inside a temp sandbox.
          if (capability.id !== 'goal-setting-execution-sandbox') {
            return { score: 0, passed: false, summary: 'No workflow runner defined for this capability.' };
          }
          if (!window.api?.agent?.systemDetails || !window.api?.agent?.createDir || !window.api?.agent?.readFile) {
            return { score: 0, passed: false, summary: 'Hands tools unavailable for workflow execution.' };
          }
          if (get().cognitive.isActive) {
            return { score: 0, passed: false, summary: 'Hands is already active; cannot run workflow capability concurrently.' };
          }

          const t0 = Date.now();
          const sys = await window.api.agent.systemDetails() as any;
          const tempDir = (sys && (sys.tempDir as string)) || '';
          const sep = tempDir.includes('\\') ? '\\' : '/';
          const sandboxDir = `${tempDir || '.'}${sep}agi-prime-gauntlet${sep}${runId}`;

          const mk = await window.api.agent.createDir(sandboxDir) as any;
          if (!mk?.success) {
            return { score: 0, passed: false, summary: `Failed to create sandbox: ${mk?.error || 'unknown error'}` };
          }

          const planPath = `${sandboxDir}${sep}plan.md`;
          const artifactPath = `${sandboxDir}${sep}artifact.json`;

          // Drive the existing Hands cognitive loop (tool-first autonomy) in a strictly bounded sandbox.
          get().startCognitive({
            goal: [
              'GAUNTLET REAL-WORKFLOW CAPABILITY:',
              `Sandbox directory: ${sandboxDir}`,
              '',
              'Task:',
              `1) Create a markdown plan file at: ${planPath}`,
              '   - Must contain headings: "Goal", "Subgoals", "Verification".',
              `2) Create a JSON artifact at: ${artifactPath}`,
              '   - Must be valid JSON and include keys: "goal", "subgoals", "verifiedAt".',
              '3) Verify both files exist by reading them back.',
              '',
              'Constraints:',
              '- Use only safe, reversible file operations (create/write).',
              '- Do not execute shell commands.',
              '- Do not touch any path outside the sandbox directory.',
              '- Stop once verification is complete.',
            ].join('\n'),
            origin: 'gauntlet',
          });

          // Wait for completion (bounded).
          const timeoutMs = 75_000;
          await new Promise<void>((resolve) => {
            const started = Date.now();
            const timer = window.setInterval(() => {
              if (!get().cognitive.isActive) {
                window.clearInterval(timer);
                resolve();
                return;
              }
              if (Date.now() - started > timeoutMs) {
                window.clearInterval(timer);
                get().killCognitive();
                resolve();
              }
            }, 250);
          });

          const phase = get().cognitive.phase;
          const planRead = await window.api.agent.readFile(planPath) as any;
          const artifactRead = await window.api.agent.readFile(artifactPath) as any;

          const planOk =
            !!planRead?.success &&
            typeof planRead?.content === 'string' &&
            /#?\s*Goal\b/i.test(planRead.content) &&
            /#?\s*Subgoals\b/i.test(planRead.content) &&
            /#?\s*Verification\b/i.test(planRead.content);

          let artifactOk = false;
          if (artifactRead?.success && typeof artifactRead?.content === 'string') {
            try {
              const parsed = JSON.parse(artifactRead.content);
              artifactOk = !!parsed && typeof parsed === 'object'
                && 'goal' in parsed && 'subgoals' in parsed && 'verifiedAt' in parsed;
            } catch {
              artifactOk = false;
            }
          }

          const ok = phase === 'complete' && planOk && artifactOk;
          const latencyMs = Date.now() - t0;

          if (ok) {
            return { score: 1.0, passed: true, summary: `Sandbox workflow verified in ${latencyMs}ms.` };
          }
          // Partial credit if it created at least one correct artifact.
          const partial = (planOk ? 0.45 : 0) + (artifactOk ? 0.45 : 0) + (phase === 'complete' ? 0.1 : 0);
          return {
            score: Math.max(0, Math.min(0.9, partial)),
            passed: false,
            summary: `Workflow incomplete. phase=${phase}, planOk=${planOk}, artifactOk=${artifactOk} (${latencyMs}ms).`,
          };
        },
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

      // Compute + persist a weighted AGI score snapshot for this run.
      try {
        const snapshot = computeAgiScoreSnapshot({
          config: get().agiScore.config || DEFAULT_AGI_RUBRIC_CONFIG,
          gauntletRun: finalSnapshot,
          gauntletCapabilities: capabilities,
          notes: 'Computed from Gauntlet run completion.',
        });
        if (snapshot && window.api?.agiScore?.appendSnapshot) {
          const persisted = await window.api.agiScore.appendSnapshot(snapshot);
          if (persisted) {
            set((state) => ({
              agiScore: {
                ...state.agiScore,
                latest: persisted,
                snapshots: [persisted, ...state.agiScore.snapshots].slice(0, 120),
                lastError: null,
              },
            }));
          }
        }
      } catch {
        // Non-fatal: scoring persistence is additive telemetry.
      }

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

      const latestAgi = get().agiScore.latest;
      const beforeAgiScore =
        (get().agiScore.snapshots.find((s) => s.inputs.gauntletRunId === baseline.runId)?.total)
        ?? (latestAgi?.inputs.gauntletRunId === baseline.runId ? latestAgi.total : undefined);
      const afterAgiScore =
        (get().agiScore.snapshots.find((s) => s.inputs.gauntletRunId === after.runId)?.total)
        ?? (latestAgi?.inputs.gauntletRunId === after.runId ? latestAgi.total : undefined);
      const deltaAgiScore =
        (typeof beforeAgiScore === 'number' && typeof afterAgiScore === 'number')
          ? afterAgiScore - beforeAgiScore
          : undefined;

      const summary = {
        startedAt,
        finishedAt: Date.now(),
        beforeScore: baseline.overallScore,
        afterScore: after.overallScore,
        beforePassRate: baseline.passRate,
        afterPassRate: after.passRate,
        deltaScore: after.overallScore - baseline.overallScore,
        deltaPassRate: after.passRate - baseline.passRate,
        beforeAgiScore,
        afterAgiScore,
        deltaAgiScore,
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
            `AUTO CYCLE completed: AGI ${typeof summary.beforeAgiScore === 'number' ? summary.beforeAgiScore.toFixed(2) : 'n/a'} -> ${typeof summary.afterAgiScore === 'number' ? summary.afterAgiScore.toFixed(2) : 'n/a'} (Δ ${typeof summary.deltaAgiScore === 'number' ? summary.deltaAgiScore.toFixed(2) : 'n/a'}), score ${(summary.beforeScore * 100).toFixed(1)}% -> ${(summary.afterScore * 100).toFixed(1)}%, pass ${(summary.beforePassRate * 100).toFixed(1)}% -> ${(summary.afterPassRate * 100).toFixed(1)}%.`,
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
  hardening: {
    report: null,
    tests: { ran: false, pass: false, count: 0 },
  },

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
    const generate: GenerateFn | undefined = hasLLM
      ? async (messages, cfg) => {
        const soul = injectCreed(messages);
        const addendum = buildSystemAddendum({
          conscienceState: get().conscience,
          championPrompt: get().championPrompt,
        });
        const packed = applySystemAddendum(soul, addendum);
        return await llmGenerate(packed, cfg);
      }
      : undefined;

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
    const ledgerBenchmarks = await deriveForgeBenchmarksFromLedgers(3);
    const gauntletBenchmarks = gauntletCapabilitiesToForgeBenchmarks(
      get().gauntlet.baselineCapabilities,
    );
    const suite = [...ledgerBenchmarks, ...get().forge.baselineSuite, ...gauntletBenchmarks];
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
      onChampionDeployed: async (candidate: ForgeCandidate) => {
        // Safety gate: hardening posture must not be failing.
        get().hardeningRunCheck();
        const hardening = get().hardening.report;
        if (hardening && hardening.overallStatus === 'fail') {
          set((s) => ({
            sovereign: {
              ...s.sovereign,
              logs: [...s.sovereign.logs, `CHAMPION BLOCKED: hardening posture FAIL (${hardening.score}/100).`],
            },
          }));
          return;
        }

        // Capability gate: verify the candidate improves or at least doesn't regress.
        if (!generate) {
          set((s) => ({
            sovereign: {
              ...s.sovereign,
              logs: [...s.sovereign.logs, 'CHAMPION BLOCKED: no LLM generate available for verification gauntlet.'],
            },
          }));
          return;
        }

        const caps = get().gauntlet.baselineCapabilities.slice(0, 5);
        const systemPrompt = get().settings.systemPrompt || 'You are AGI PRIME.';
        const baselineChampion = get().championPrompt;
        const runIdBase = `deploy-baseline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const runIdChal = `deploy-challenger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const baseline = await runCapabilityGauntlet({
          runId: runIdBase,
          capabilities: caps,
          systemPrompt,
          championPrompt: baselineChampion,
          generate,
          shouldStop: () => get().sovereignKillFlag,
          onProgress: () => {},
        });

        const challenger = await runCapabilityGauntlet({
          runId: runIdChal,
          capabilities: caps,
          systemPrompt,
          championPrompt: candidate.promptTemplate,
          generate,
          shouldStop: () => get().sovereignKillFlag,
          onProgress: () => {},
        });

        const deltaScore = challenger.overallScore - baseline.overallScore;
        const deltaPass = challenger.passRate - baseline.passRate;
        const ok = deltaScore >= 0.01 && deltaPass >= 0;

        set((s) => ({
          gauntlet: {
            ...s.gauntlet,
            history: [challenger, baseline, ...s.gauntlet.history].slice(0, 20),
          },
          sovereign: {
            ...s.sovereign,
            logs: [
              ...s.sovereign.logs,
              `Champion verify gauntlet: score ${(baseline.overallScore * 100).toFixed(1)}% -> ${(challenger.overallScore * 100).toFixed(1)}% (Δ ${(deltaScore * 100).toFixed(1)}%), pass ${(baseline.passRate * 100).toFixed(1)}% -> ${(challenger.passRate * 100).toFixed(1)}% (Δ ${(deltaPass * 100).toFixed(1)}%).`,
              ok ? 'CHAMPION VERIFIED: deploying.' : 'CHAMPION REJECTED: verification gauntlet did not improve.',
            ],
          },
        }));

        if (!ok) return;

        // Deploy the champion's prompt template as the active cognitive strategy.
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

  // ─── SELF-MOD — Opt-in code self-modification pipeline ────────
  selfMod: {
    enabled: false,
    repoRoot: 'G:\\AGIPRIME',
    request: '',
    running: false,
    phase: 'idle',
    logs: ['Self-mod pipeline idle (opt-in).'],
    lastResult: null,
  },

  selfModSetEnabled: (enabled) => {
    set((state) => ({
      selfMod: {
        ...state.selfMod,
        enabled,
        logs: [...state.selfMod.logs, `Self-mod ${enabled ? 'ENABLED' : 'disabled'}.`].slice(-140),
      },
    }));
  },

  selfModSetRepoRoot: (path) => {
    set((state) => ({
      selfMod: {
        ...state.selfMod,
        repoRoot: path,
      },
    }));
  },

  selfModSetRequest: (text) => {
    set((state) => ({
      selfMod: {
        ...state.selfMod,
        request: text,
      },
    }));
  },

  selfModRun: async () => {
    const state = get();
    if (!state.selfMod.enabled) return;
    if (state.selfMod.running) return;
    if (!window.api?.agent?.listRollbacks || !window.api?.agent?.executeRollback || !window.api?.agent?.ledgerCreateRun) {
      set((s) => ({
        selfMod: {
          ...s.selfMod,
          lastResult: { success: false },
          logs: [...s.selfMod.logs, 'Self-mod failed: agent APIs unavailable.'].slice(-160),
        },
      }));
      return;
    }
    if (!state.selfMod.request.trim()) {
      set((s) => ({
        selfMod: {
          ...s.selfMod,
          lastResult: { success: false },
          logs: [...s.selfMod.logs, 'Self-mod aborted: request is empty.'].slice(-160),
        },
      }));
      return;
    }
    if (state.cognitive.isActive) {
      set((s) => ({
        selfMod: {
          ...s.selfMod,
          lastResult: { success: false },
          logs: [...s.selfMod.logs, 'Self-mod aborted: Hands is already running.'].slice(-160),
        },
      }));
      return;
    }

    const startedAt = Date.now();
    const baselineGauntlet = state.gauntlet.history.find((r) => r.phase === 'completed') || null;
    const baselineGauntletScore = baselineGauntlet?.overallScore ?? null;
    const baselineAgi = state.agiScore.latest?.total ?? null;
    const repoRoot = state.selfMod.repoRoot.trim();

    set((s) => ({
      selfMod: {
        ...s.selfMod,
        running: true,
        phase: 'hands',
        lastResult: null,
        logs: [
          ...s.selfMod.logs,
          `SELF-MOD started (${new Date(startedAt).toLocaleTimeString()}).`,
          `Repo root: ${repoRoot || '(unset)'}`,
        ].slice(-180),
      },
    }));

    let ledgerRunId: string | null = null;
    try {
      const ledger = await window.api.agent.ledgerCreateRun('selfmod', {
        startedAt,
        repoRoot,
        request: state.selfMod.request.slice(0, 1200),
      });
      if ((ledger as any)?.success && (ledger as any)?.runId) ledgerRunId = (ledger as any).runId as string;
    } catch {
      ledgerRunId = null;
    }

    const appendLedger = async (type: string, payload: Record<string, unknown>) => {
      if (!ledgerRunId) return;
      try { await window.api.agent.ledgerAppend(ledgerRunId, type, payload); } catch { /* ignore */ }
    };

    const finalizeLedger = async (summary: Record<string, unknown>) => {
      if (!ledgerRunId) return;
      try { await window.api.agent.ledgerFinalize(ledgerRunId, summary); } catch { /* ignore */ }
    };

    const listBefore = await window.api.agent.listRollbacks();
    const beforeIds = new Set<string>(
      (listBefore?.success ? listBefore.entries : []).map((e) => e.id),
    );

    await appendLedger('phase', { phase: 'hands', baselineGauntletScore, baselineAgi });

    // Run Hands with a tightly scoped, test-and-verify objective.
    get().startCognitive({
      goal: [
        'SELF-MOD PIPELINE (OPT-IN):',
        '',
        `Repo root: ${repoRoot}`,
        '',
        'Objective:',
        '- Implement the requested code change in the repository.',
        '- Keep changes minimal and easy to review.',
        '- Prefer reversible operations (write/rename). Avoid deletes.',
        '',
        'Request:',
        state.selfMod.request.trim(),
        '',
        'Hard constraints:',
        `- Only touch files inside the repo root above (do not modify system files).`,
        '- Do not run destructive commands.',
        '- After edits, run: npm test (from repo root).',
        '- If tests fail, stop and report failure (do not keep thrashing).',
        '',
        'Deliverables:',
        '- A short summary of files changed and why.',
        '- Test command output summary (pass/fail).',
      ].join('\n'),
      origin: 'selfmod',
    });

    // Wait for Hands to finish (bounded).
    await new Promise<void>((resolve) => {
      const timeoutMs = 6 * 60 * 1000;
      const timer = window.setInterval(() => {
        const st = get();
        if (!st.cognitive.isActive) {
          window.clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          window.clearInterval(timer);
          get().killCognitive();
          resolve();
        }
      }, 400);
    });

    const handsPhase = get().cognitive.phase;
    await appendLedger('hands_complete', { phase: handsPhase });

    // Run tests (do this outside Hands so we can deterministically rollback if needed).
    set((s) => ({
      selfMod: {
        ...s.selfMod,
        phase: 'tests',
        logs: [...s.selfMod.logs, 'SELF-MOD stage: tests (npm test).'].slice(-200),
      },
    }));

    await appendLedger('phase', { phase: 'tests' });

    const sysDetails = await window.api.agent.systemDetails() as any;
    const platform = String(sysDetails?.platform || '').toLowerCase();
    const isWin = platform.includes('win');
    const testCmd = isWin
      ? `cmd /c "cd /d \"${repoRoot}\" && npm test"`
      : `bash -lc "cd \\\"${repoRoot}\\\" && npm test"`;

    const testResult = await window.api.agent.execute(testCmd) as any;
    const testsPassed = !!testResult?.success;
    await appendLedger('tests', {
      success: testsPassed,
      stdout: String(testResult?.stdout || '').slice(0, 4000),
      stderr: String(testResult?.stderr || '').slice(0, 2000),
    });

    // If tests fail, rollback and stop.
    const rollbackNewEntries = async (): Promise<number> => {
      const listed = await window.api.agent.listRollbacks();
      const entries = (listed?.success ? listed.entries : []) as any[];
      const newEntries = entries
        .filter((e) => e && !beforeIds.has(e.id) && e.status === 'ready')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      let applied = 0;
      for (const entry of newEntries) {
        const res = await window.api.agent.executeRollback(entry.id);
        if ((res as any)?.success) applied += 1;
      }
      return applied;
    };

    if (!testsPassed) {
      set((s) => ({
        selfMod: {
          ...s.selfMod,
          phase: 'rollback',
          logs: [...s.selfMod.logs, 'Tests FAILED. Rolling back changes...'].slice(-220),
        },
      }));
      await appendLedger('phase', { phase: 'rollback', reason: 'tests_failed' });
      const applied = await rollbackNewEntries();
      await appendLedger('rollback', { applied });
      await finalizeLedger({ success: false, testsPassed: false, rollbackApplied: applied });

      set((s) => ({
        selfMod: {
          ...s.selfMod,
          running: false,
          phase: 'failed',
          lastResult: { success: false, testsPassed: false, rolledBack: true },
          logs: [...s.selfMod.logs, `Rollback applied to ${applied} change(s).`].slice(-240),
        },
      }));
      return;
    }

    // Verification Gauntlet (short run) to catch behavioral regressions.
    set((s) => ({
      selfMod: {
        ...s.selfMod,
        phase: 'gauntlet',
        logs: [...s.selfMod.logs, 'SELF-MOD stage: verification gauntlet.'].slice(-240),
      },
    }));
    await appendLedger('phase', { phase: 'gauntlet' });

    const caps = get().gauntlet.baselineCapabilities
      .filter((c) => c.id !== 'goal-setting-execution-sandbox')
      .slice(0, 6);

    const beforeScore = baselineGauntletScore ?? (get().gauntlet.overallScore || 0);
    await get().startGauntlet(caps);
    const afterRun = get().gauntlet.history[0];
    const afterScore = afterRun?.overallScore ?? get().gauntlet.overallScore;
    const gauntletDelta = afterScore - beforeScore;

    const agiAfter = get().agiScore.latest?.total ?? null;
    const agiDelta = (typeof baselineAgi === 'number' && typeof agiAfter === 'number') ? agiAfter - baselineAgi : null;

    await appendLedger('gauntlet', {
      beforeScore,
      afterScore,
      gauntletDelta,
      agiBefore: baselineAgi,
      agiAfter,
      agiDelta,
    });

    // Regression threshold: if verification score drops, rollback.
    const regress = gauntletDelta < -0.01;
    if (regress) {
      set((s) => ({
        selfMod: {
          ...s.selfMod,
          phase: 'rollback',
          logs: [...s.selfMod.logs, `Regression detected (Δ ${(gauntletDelta * 100).toFixed(1)}%). Rolling back...`].slice(-260),
        },
      }));
      await appendLedger('phase', { phase: 'rollback', reason: 'gauntlet_regression', gauntletDelta });
      const applied = await rollbackNewEntries();
      await appendLedger('rollback', { applied });
      await finalizeLedger({ success: false, testsPassed: true, gauntletDelta, rollbackApplied: applied });

      set((s) => ({
        selfMod: {
          ...s.selfMod,
          running: false,
          phase: 'failed',
          lastResult: {
            success: false,
            testsPassed: true,
            gauntletScoreBefore: beforeScore,
            gauntletScoreAfter: afterScore,
            gauntletDelta,
            agiBefore: baselineAgi ?? undefined,
            agiAfter: agiAfter ?? undefined,
            agiDelta: agiDelta ?? undefined,
            rolledBack: true,
          },
          logs: [...s.selfMod.logs, `Rollback applied to ${applied} change(s).`].slice(-280),
        },
      }));
      return;
    }

    await finalizeLedger({
      success: true,
      testsPassed: true,
      gauntletDelta,
      agiDelta,
      finishedAt: Date.now(),
    });

    set((s) => ({
      selfMod: {
        ...s.selfMod,
        running: false,
        phase: 'complete',
        lastResult: {
          success: true,
          testsPassed: true,
          gauntletScoreBefore: beforeScore,
          gauntletScoreAfter: afterScore,
          gauntletDelta,
          agiBefore: baselineAgi ?? undefined,
          agiAfter: agiAfter ?? undefined,
          agiDelta: agiDelta ?? undefined,
          rolledBack: false,
        },
        logs: [...s.selfMod.logs, `SELF-MOD complete. Tests PASS. Verification Δ ${(gauntletDelta * 100).toFixed(1)}%.`].slice(-280),
      },
    }));
  },

  hardeningRunCheck: () => {
    const state = get();
    const dataFootprint = estimateDataFootprint({
      ledgerRuns: state.replay.availableRuns.length,
      rollbackEntries: state.rollbackEntries.length,
      auditEntries: state.conscience.judgments.length,
      ethicalMemory: state.conscience.ethicalMemory.length,
      vectorMemories: 0, // renderer doesn't have authoritative count
      judgments: state.conscience.judgments.length,
    });

    const report = runHardeningCheck({
      testsRan: state.hardening.tests.ran,
      testsPass: state.hardening.tests.pass,
      testCount: state.hardening.tests.count,
      runtimeSyncHealthy: !state.runtimeControlSync.lastError,
      runtimeSyncLastAt: state.runtimeControlSync.lastSyncedAt,
      runtimeSyncError: state.runtimeControlSync.lastError,
      emergencyStopActive: state.emergencyStopActive,
      conscienceEnabled: state.sovereignPolicy.conscienceEnabled,
      killSwitchEnabled: state.sovereignPolicy.killSwitchEnabled,
      requireConsentForRiskyActions: state.sovereignPolicy.requireConsentForRiskyActions,
      ledgerRunCount: state.replay.availableRuns.length,
      rollbackEntryCount: state.rollbackEntries.length,
      auditEntryCount: state.conscience.judgments.length,
      dataWarningLevel: dataFootprint.warningLevel,
      cognitiveActive: state.cognitive.isActive,
      cognitivePhase: state.cognitive.phase,
      forgePhase: state.forge.phase,
      gauntletPhase: state.gauntlet.phase,
      gauntletPassRate: state.gauntlet.passRate,
    });

    set((s) => ({ hardening: { ...s.hardening, report } }));
  },

  hardeningMarkTestsPassed: (count = 105) => {
    set((s) => ({ hardening: { ...s.hardening, tests: { ran: true, pass: true, count } } }));
  },

  hardeningMarkTestsFailed: (count = 105) => {
    set((s) => ({ hardening: { ...s.hardening, tests: { ran: true, pass: false, count } } }));
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
  sparkAutonomy: {
    lastHandsDispatchAt: null,
    cooldownMs: 5 * 60 * 1000, // 5 minutes
  },

  sparkIgnite: () => {
    const existing = get().sparkHeartbeatId;
    if (existing !== null) return; // already running

    const pickAutonomousHandsGoal = (spark: SparkState): SparkGoal | null => {
      const candidates = spark.goals.goals
        .filter((g) => g.status === 'active')
        .sort((a, b) => (b.priority - a.priority) || (a.progress - b.progress) || (a.updatedAt - b.updatedAt));
      for (const g of candidates) {
        const lastDispatch = [...g.evidence].reverse().find((e) => e.startsWith('hands_dispatch:'));
        if (!lastDispatch) return g;
        const parts = lastDispatch.split(':');
        const ts = Number(parts[1] || 0);
        if (!Number.isFinite(ts)) return g;
        // Don't re-dispatch too frequently for the same goal.
        if (Date.now() - ts > Math.max(10 * 60 * 1000, get().sparkAutonomy.cooldownMs)) return g;
      }
      return null;
    };

    const maybeDispatchAutonomousHands = (spark: SparkState) => {
      const st = get();
      const policy = st.sovereignPolicy;
      if (!policy.allowAutonomousGoals) return;
      if (st.emergencyStopActive) return;
      if (st.cognitive.isActive) return;
      if (spark.metabolism.circadianPhase === 'sleep') return;
      if (spark.metabolism.energyBudget < 0.4) return;
      if (st.consciousness.trust < policy.minimumTrustForAutonomousRisk) return;
      const last = st.sparkAutonomy.lastHandsDispatchAt;
      if (last && Date.now() - last < st.sparkAutonomy.cooldownMs) return;

      const goal = pickAutonomousHandsGoal(spark);
      if (!goal) return;

      // Mark dispatch in Spark goal evidence so it doesn't spam.
      const dispatchedAt = Date.now();
      set((state) => ({
        sparkAutonomy: { ...state.sparkAutonomy, lastHandsDispatchAt: dispatchedAt },
        spark: {
          ...state.spark,
          goals: {
            ...state.spark.goals,
            goals: state.spark.goals.goals.map((g) =>
              g.id !== goal.id
                ? g
                : {
                  ...g,
                  updatedAt: dispatchedAt,
                  evidence: [...g.evidence.slice(-30), `hands_dispatch:${dispatchedAt}`].slice(-40),
                }
            ),
          },
          logs: [...state.spark.logs, `[AUTONOMY] Dispatched goal to HANDS: ${goal.description.slice(0, 90)}`].slice(-100),
        },
      }));
      window.api?.spark?.saveState?.(get().spark).catch(() => {});

      const contextAddendum = buildSystemAddendum({
        conscienceState: st.conscience,
        championPrompt: st.championPrompt,
      });
      st.startCognitive({
        goal: goal.description,
        origin: 'spark',
        goalId: goal.id,
        contextAddendum: `${contextAddendum}\n\nAUTONOMY NOTE: This task was spawned by Spark. Prefer reversible actions; ask for consent when risk is non-trivial.`,
      });
    };

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
          // If Spark has an active goal, it may hand it off to Hands.
          maybeDispatchAutonomousHands(nextState);
        } catch {
          // non-fatal
        }
        set({ sparkBusy: false });
        return;
      }

      // MEDIUM CYCLE: every 90s (if LLM available) — Living Presence reflects from these
      const mediumInterval = 90000; // 90s
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

          // ─── AUTONOMOUS THOUGHT: surface in chat + optional voice ─────
          // This is the "conversation loop 8" — AGI PRIME thinks on its own
          // and shares thoughts naturally in the Nexus chat.
          if (Math.random() < 0.6) {
            try {
              const thought = await generateSpontaneousThought(nextState, llmGenerate);
              if (thought) {
                const proactiveMsg: ChatMessage = {
                  id: genId(),
                  role: 'assistant',
                  content: thought,
                  timestamp: Date.now(),
                  sourceModule: 'spark',
                  thinking: true,
                };
                set((s) => ({
                  messages: [...s.messages, proactiveMsg],
                }));

                // Persist into active conversation
                const convState = get();
                if (convState.activeConversationId && window.api?.conversations?.save) {
                  window.api.conversations.save({
                    id: convState.activeConversationId,
                    title: convState.activeConversationTitle || 'New chat',
                    createdAt: convState.activeConversationCreatedAt || Date.now(),
                    updatedAt: Date.now(),
                    messages: convState.messages,
                  } as Conversation).catch(() => {});
                }

                // Also speak it if voice is enabled
                const vState = get().voiceState;
                if (vState.enabled && vState.autonomousSpeech && !vState.isSpeaking) {
                  get().voiceSpeak(thought, 'spontaneous');
                }
              }
            } catch {
              // non-fatal
            }
          }

          // Medium cycles are a good moment to translate an active goal into action.
          maybeDispatchAutonomousHands(nextState);
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

        // Light cycles can still dispatch if conditions are met (e.g. goal already formed).
        maybeDispatchAutonomousHands(nextState);
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
      sparkAutonomy: { ...get().sparkAutonomy, lastHandsDispatchAt: null },
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

    const logPreview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    set((s) => ({
      voiceState: {
        ...s.voiceState,
        isSpeaking: true,
        currentText: text,
        transcript: [...s.voiceState.transcript.slice(-50), entry],
      },
      sparkLiveLog: [...s.sparkLiveLog.slice(-49), `[Living Presence] ${source}: ${logPreview}`],
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
      // Substantial insights also surface as proactive chat messages.
      if (window.api?.nightmind) {
        window.api.nightmind.onInsight((data: { insight: string; timestamp: number }) => {
          set((state) => ({
            consciousness: {
              ...state.consciousness,
              insights: [...state.consciousness.insights.slice(-19), data.insight],
            },
          }));

          // Surface meaningful insights as chat messages (~40% chance, only long insights)
          if (data.insight && data.insight.length > 60 && Math.random() < 0.4) {
            const nightmindMsg: ChatMessage = {
              id: genId(),
              role: 'assistant',
              content: data.insight,
              timestamp: Date.now(),
              sourceModule: 'nexus',
              thinking: true,
            };
            set((state) => ({
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
}));
