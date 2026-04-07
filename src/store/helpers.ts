import type { GenerateFn } from '../prime/runtime';
import { createDefaultSuite } from '../prime/runtime';
import { createDefaultGauntletCapabilities } from '../prime/gauntlet';
import { createDefaultCurriculumState } from '../prime/curriculum';
import type { SovereignPhase } from '../prime/sovereign';
import type {
  ArenaState,
  CognitivePhase,
  CognitiveStep,
  ConsciousnessState,
  ForgeBenchmark,
  ForgeCandidate,
  ForgeGenerationReport,
  ForgeRunConfig,
  ForgeState,
  GauntletState,
  MemoryConsolidationState,
  ReplayState,
  RuntimeControlSyncState,
  Settings,
  SparkState,
} from '../types';

import type { AGIStore } from '../store';

/** Local aliases (same as `./types`) to avoid import cycles with `store.ts`. */
type StoreSet = (partial: Partial<AGIStore> | ((state: AGIStore) => Partial<AGIStore>), replace?: false) => void;
type StoreGet = () => AGIStore;

// ─── Utilities ─────────────────────────────────────────────────
let messageCounter = 0;

export function logNonFatal(scope: string, error: unknown): void {
  console.warn(`[${scope}] non-fatal:`, error);
}

export function genId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

export function genConversationId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type PendingConsolidationEpisode = MemoryConsolidationState['pendingEpisodes'][number];

export function formatPredictionForMemory(
  value: SparkState['temporal']['activePredictions'][number]['prediction'],
): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable prediction]';
  }
}

/** Builds a single consolidation episode for memory (user docs may refer to this as `makeStorableInsight`). */
export function buildConsolidationEpisode(
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

/** @deprecated Alias for `buildConsolidationEpisode` (legacy naming). */
export const makeStorableInsight = buildConsolidationEpisode;

/** Spark → consolidation episodes (alias name: `generateSparkEpisodes`). */
export function buildSparkLearningEpisodes(
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
    episodes.push(buildConsolidationEpisode(source, `New blind spot detected: ${blindSpot.slice(0, 220)}`, 0.86));
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
      episodes.push(buildConsolidationEpisode(source, `Goal completed: ${goal.description.slice(0, 220)}.`, 0.88));
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

export const generateSparkEpisodes = buildSparkLearningEpisodes;

/** Enqueues episodes and may trigger consolidation (alias: `processSparkEpisodes`). */
export function enqueueSparkLearningEpisodes(
  setState: StoreSet,
  getState: StoreGet,
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
    sparkLiveLog: [...state.sparkLiveLog.slice(-49), `[LearnLoop] ${source}: +${episodes.length} episode(s) queued`],
  }));

  const memState = getState().memoryConsolidation;
  const urgent = episodes.some((ep) => ep.importance >= 0.85);
  if (memState.enabled && (memState.pendingEpisodes.length >= 10 || urgent)) {
    getState()
      .runMemoryConsolidation()
      .catch((e) => logNonFatal('memory.consolidation.trigger', e));
  }
}

export const processSparkEpisodes = enqueueSparkLearningEpisodes;

/** Pulls real cognitive benchmarks from ledger runs (alias: `fetchLedgerRuns`). */
export async function deriveForgeBenchmarksFromLedgers(maxRuns: number = 3): Promise<ForgeBenchmark[]> {
  if (!window.api?.agent?.ledgerListRuns || !window.api?.agent?.ledgerReadRun) return [];

  try {
    const list = await window.api.agent.ledgerListRuns();
    if (!list?.success || !Array.isArray(list.runs)) return [];

    const runs = list.runs.filter((r: any) => r && r.kind === 'cognitive').slice(0, 12);

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

export const fetchLedgerRuns = deriveForgeBenchmarksFromLedgers;

// ─── LLM Generate (via IPC) ────────────────────────────────────
// This wraps window.api.llm.generate for use as a GenerateFn
export const llmGenerate: GenerateFn = async (messages, config) => {
  if (!window.api?.llm?.generate) {
    throw new Error('LLM generate not available');
  }
  return await window.api.llm.generate(messages, config);
};

export const ensureGenerate = llmGenerate;

// AGI PRIME was born on Valentine's Day 2026
export const AGI_PRIME_BIRTH = new Date('2026-02-14T00:00:00').getTime();

export const DEFAULT_CONSCIOUSNESS: ConsciousnessState = {
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

export const DEFAULT_ARENA: ArenaState = {
  isActive: false,
  prompt: '',
  agents: [],
  synthesis: '',
  moderatorNotes: '',
  blueprint: null,
  synthesisDone: false,
  phase: 'idle',
};

export const DEFAULT_SETTINGS: Settings = {
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
  performanceMode: false,
};

export const DEFAULT_FORGE_CONFIG: ForgeRunConfig = {
  maxGenerations: 8,
  candidatesPerGeneration: 5,
  maxDurationMs: 300000, // 5 minutes (up from 15s — real eval takes time)
  mutationRate: 0.24,
};

export function createDefaultForgeState(): ForgeState {
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

export function createDefaultGauntletState(): GauntletState {
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

/** Adaptive forge suite from gauntlet + AGI score (no separate `createAutoForgeBenchmarks` in this codebase). */
export function buildForgeAdaptiveSuite(
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
        expectedKeywords: ['step', 'assumption', 'risk', 'verify', 'metrics', 'fallback'],
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
          expectedKeywords: ['step', 'verify', 'risk', 'rollback', 'assumption', 'fallback'],
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

export const createAutoForgeBenchmarks = buildForgeAdaptiveSuite;

// ─── Cognitive State ────────────────────────────────────────────
export interface CognitiveState {
  isActive: boolean;
  goal: string;
  steps: CognitiveStep[];
  phase: CognitivePhase;
  iteration: number;
  origin?: string;
  goalId?: string | null;
}

export function createDefaultCognitiveState(): CognitiveState {
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

export function createDefaultReplayState(): ReplayState {
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

export function createDefaultRuntimeControlSyncState(): RuntimeControlSyncState {
  return {
    syncing: false,
    lastSyncedAt: null,
    lastError: null,
  };
}

// ─── Sovereign State ────────────────────────────────────────────
export interface SovereignState {
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

export function createDefaultSovereignState(): SovereignState {
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
