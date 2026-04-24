// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Central Nervous System (Composed Store)
//  The unified state that connects all modules.
//  Implementation split into ./store/slices/* for maintainability.
// ═══════════════════════════════════════════════════════════════

import { create } from 'zustand';
import type {
  ModuleId,
  ChatMessage,
  ConsciousnessState,
  ArenaState,
  Settings,
  OllamaStatus,
  EmotionType,
  ForgeState,
  ForgeRunConfig,
  ForgeCandidate,
  ForgeGenerationReport,
  CognitiveStep,
  CognitivePhase,
  SparkState,
  VoiceState,
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
  RuntimeHealthSummary,
  OperatorProfile,
  OperatorObservation,
  SynthesisSessionState,
  CognitiveStartRequest,
  AgiRubricConfig,
  AgiScoreSnapshot,
  NeuralCoreState,
  OracleState,
  OracleLifeEvent,
  OracleSocialNode,
  OracleFeedbackEntry,
} from './types';
import type { OwnerPolicy, AutonomyLevel } from './prime/policy';
import type { KernelExecutionResult } from './prime/kernel';
import type { RuntimeSignal } from './prime/observability';
import type { SovereignPhase } from './prime/sovereign';
import type { OracleRunParams } from './prime/oracle';
import type { HardeningReport } from './prime/hardening';
import type { LearnerStats, LearnerConfig } from './prime/autonomous-learner';
import type { RepoCandidate, RepoIngestConfig, RepoIngestResult } from './prime/repo-ingestor';

import { createChatSlice } from './store/slices/chat';
import { createConsciousnessSlice } from './store/slices/consciousness';
import { createCognitiveSlice } from './store/slices/cognitive';
import { createOperatorSlice } from './store/slices/operator';
import { createForgeSlice } from './store/slices/forge';
import { createGauntletScoreSlice } from './store/slices/gauntlet-score';
import { createSovereignSlice } from './store/slices/sovereign';
import { createSparkSlice } from './store/slices/spark';
import { createRepoIngestorSlice } from './store/slices/repo-ingestor';
import { createOracleSlice } from './store/slices/oracle';
import { createVoiceSlice } from './store/slices/voice';
import { createConscienceSlice } from './store/slices/conscience';
import { createSettingsSlice } from './store/slices/settings';

// ─── Store Interface ───────────────────────────────────────────
export interface AGIStore {
  // Navigation
  activeModule: ModuleId;
  setActiveModule: (m: ModuleId) => void;
  moduleStates: Record<ModuleId, 'online' | 'offline' | 'processing'>;

  // NEXUS — Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  currentRunId: string | null;
  dualBrain: DualBrainState;
  sendMessage: (content: string) => void;
  abortStreaming: () => void;
  setDualBrainEnabled: (enabled: boolean) => void;
  setDualBrainThresholds: (complexity: number, uncertainty: number) => void;
  clearMessages: () => void;
  loadChatHistory: (messages: ChatMessage[]) => void;

  // NEXUS — Conversations
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
  cognitive: {
    isActive: boolean;
    goal: string;
    steps: CognitiveStep[];
    phase: CognitivePhase;
    iteration: number;
  };
  pendingConsentActions: PendingConsentAction[];
  rollbackEntries: RollbackEntry[];
  replay: ReplayState;
  runtimeControlSync: RuntimeControlSyncState;
  runtimeSignals: RuntimeSignal[];
  runtimeHealth: RuntimeHealthSummary | null;
  kernelLastResult: KernelExecutionResult | null;
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
  loadRuntimeHealth: () => Promise<void>;
  kernelDispatch: (actionType: string, payload?: Record<string, unknown>) => Promise<KernelExecutionResult>;
  resolveConsentAction: (requestId: string, decision: ConsentDecision) => Promise<void>;
  refreshRollbacks: () => Promise<void>;
  executeRollback: (rollbackId: string) => Promise<void>;
  replayLoadRuns: () => Promise<void>;
  replayLoadRun: (runId: string) => Promise<void>;
  replayNext: () => void;
  replaySeek: (index: number) => void;
  replayTogglePlayPause: () => void;
  replayStop: () => void;

  // HANDS — Operator Synthesis
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

  // FORGE
  forge: ForgeState;
  startForge: (configOverride?: Partial<ForgeRunConfig>) => Promise<void>;
  cancelForge: () => void;
  resetForge: () => void;
  setForgeStrictEvalMode: (enabled: boolean) => void;
  setForgeVerifierFirst: (enabled: boolean) => void;

  // GAUNTLET
  gauntlet: GauntletState;
  startGauntlet: (capabilitiesOverride?: GauntletCapability[]) => Promise<void>;
  cancelGauntlet: () => void;
  resetGauntlet: () => void;
  setGauntletAutoCycleEnabled: (enabled: boolean) => void;
  startGauntletAutoCycle: () => Promise<void>;
  cancelGauntletAutoCycle: () => void;

  // AGI SCORE
  agiScore: {
    config: AgiRubricConfig;
    snapshots: AgiScoreSnapshot[];
    latest: AgiScoreSnapshot | null;
    lastError: string | null;
  };
  agiScoreLoad: () => Promise<void>;
  agiScoreSetConfig: (partial: Partial<AgiRubricConfig>) => Promise<void>;

  // SOVEREIGN
  sovereign: {
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
  };
  sovereignPolicy: OwnerPolicy;
  sovereignKillFlag: boolean;
  championPrompt: string | null;
  updateSovereignPolicy: (partial: Partial<OwnerPolicy>) => void;
  startSovereign: () => Promise<void>;
  killSovereign: () => void;
  resetSovereign: () => void;

  // SELF-MOD
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

  // HARDENING
  hardening: {
    report: HardeningReport | null;
    tests: { ran: boolean; pass: boolean; count: number };
  };
  hardeningRunCheck: () => void;
  hardeningMarkTestsPassed: (count?: number) => void;
  hardeningMarkTestsFailed: (count?: number) => void;

  // SPARK
  spark: SparkState;
  memoryConsolidation: MemoryConsolidationState;
  sparkLiveLog: string[];
  sparkHeartbeatId: number | null;
  sparkBusy: boolean;
  sparkAutonomy: { lastHandsDispatchAt: number | null; cooldownMs: number };
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

  learnerActive: boolean;
  learnerStats: LearnerStats | null;
  learnerLastLog: string[];
  setLearnerActive: (active: boolean) => void;
  getLearnerStats: () => LearnerStats | null;
  updateLearnerConfig: (partial: Partial<LearnerConfig>) => void;
  triggerLearningSession: () => Promise<void>;

  // REPO INGESTOR
  repoIngestor: {
    phase: 'idle' | 'discovering' | 'ingesting' | 'complete' | 'error';
    running: boolean;
    topic: string;
    selectedCandidates: string[];
    candidates: RepoCandidate[];
    results: RepoIngestResult[];
    stats: {
      scanned: number;
      accepted: number;
      rejected: number;
      storedMemories: number;
      dedupedMemories: number;
    };
    config: RepoIngestConfig;
    logs: string[];
    lastError: string | null;
    lastRunAt: number | null;
  };
  repoIngestorSetTopic: (topic: string) => void;
  repoIngestorUpdateConfig: (partial: Partial<RepoIngestConfig>) => void;
  repoIngestorToggleCandidate: (fullName: string) => void;
  repoIngestorSelectAllCandidates: () => void;
  repoIngestorClearSelection: () => void;
  repoIngestorClearLogs: () => void;
  repoIngestorStop: () => void;
  repoIngestorDiscover: (topicOverride?: string) => Promise<void>;
  repoIngestorIngestSelected: () => Promise<void>;

  // ORACLE
  oracle: OracleState;
  oracleSetSubject: (
    name: string,
    birthDate: string,
    birthTime?: string,
    birthLocation?: { label?: string; latitude: number; longitude: number },
  ) => void;
  oracleSetFullName: (fullName: string) => void;
  oracleIngestText: (text: string) => void;
  oracleAddLifeEvent: (event: OracleLifeEvent) => void;
  oracleAddSocialNode: (node: OracleSocialNode) => void;
  oracleRunForecast: (params?: OracleRunParams) => void;
  oracleSubmitFeedback: (entry: Omit<OracleFeedbackEntry, 'id' | 'timestamp'> & { timestamp?: number }) => void;
  oracleToggleOverlay: (overlay: keyof OracleState['activeOverlays'], enabled: boolean) => void;
  oracleToggleAstroVoice: (enabled: boolean) => void;

  // VOICE
  voiceState: VoiceState;
  voiceSpeak: (text: string, source?: string) => void;
  voiceSing: () => void;
  voiceSingAbout: (topic: string) => void;
  voiceToggle: () => void;
  voiceSendMessage: (text: string) => void;
  presenceSetMode: (mode: 'off' | 'passive' | 'living') => void;
  presenceTick: () => void;

  // CONSCIENCE
  conscience: ConscienceState;
  conscienceCheck: (
    action: string,
    context: {
      actionType?: string;
      target?: string;
      isAutonomous: boolean;
      userExplicitlyAsked: boolean;
    },
  ) => EthicalJudgment;
  conscienceReflect: (judgmentId: string, outcome: 'good' | 'neutral' | 'harmful' | 'unknown') => void;
  conscienceOverride: (judgmentId: string) => void;
  conscienceToggle: (active: boolean) => void;

  // NEURALCORE
  neuralCore: NeuralCoreState;
  neuralRefreshStatus: () => Promise<void>;
  neuralTrain: (params?: Record<string, unknown>) => Promise<void>;
  neuralLoadModels: (checkpoint?: string) => Promise<void>;

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

// ─── Composed Store ────────────────────────────────────────────
export const useStore = create<AGIStore>()(
  (set, get) =>
    ({
      ...createChatSlice(set as any, get as any),
      ...createConsciousnessSlice(set as any, get as any),
      ...createCognitiveSlice(set as any, get as any),
      ...createOperatorSlice(set as any, get as any),
      ...createForgeSlice(set as any, get as any),
      ...createGauntletScoreSlice(set as any, get as any),
      ...createSovereignSlice(set as any, get as any),
      ...createSparkSlice(set as any, get as any),
      ...createRepoIngestorSlice(set as any, get as any),
      ...createOracleSlice(set as any, get as any),
      ...createVoiceSlice(set as any, get as any),
      ...createConscienceSlice(set as any, get as any),
      ...createSettingsSlice(set as any, get as any),
    }) as unknown as AGIStore,
);
