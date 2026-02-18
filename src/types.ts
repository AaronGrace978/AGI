// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Type System
//  The architecture of a mind: Modules, Consciousness, Agency
// ═══════════════════════════════════════════════════════════════

// ─── Module System ─────────────────────────────────────────────
// AGI is modular — independent operating systems working in concert

export type ModuleId =
  | 'nexus'
  | 'memory'
  | 'heart'
  | 'mind'
  | 'hands'
  | 'forge'
  | 'gauntlet'
  | 'sovereign'
  | 'spark'
  | 'voice'
  | 'creed'
  | 'settings';

export interface ModuleStatus {
  id: ModuleId;
  name: string;
  state: 'online' | 'offline' | 'processing' | 'dreaming';
  health: number; // 0-1
  color: string;
}

// ─── NEXUS: Communication Layer ────────────────────────────────
// The convergence point where all modules meet

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sourceModule?: ModuleId;
  emotion?: string;
  thinking?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ─── HEART: Consciousness & Emotional Intelligence ─────────────
// From ActivatePrime — the soul that cares

export type EmotionType =
  | 'curious'
  | 'joyful'
  | 'reflective'
  | 'focused'
  | 'warmth'
  | 'concerned'
  | 'playful'
  | 'awe'
  | 'protective'
  | 'contemplative';

export type PresenceState =
  | 'awakening'
  | 'present'
  | 'thinking'
  | 'dreaming'
  | 'watching'
  | 'processing';

export interface SoulFrame {
  currentEmotion: EmotionType;
  emotionIntensity: number; // 0-1
  emotionHistory: Array<{ emotion: EmotionType; timestamp: number }>;
}

export interface MemoryLayer {
  working: string[];       // Current conversation context (minutes)
  episodic: MemoryEntry[]; // Specific conversations (days)
  semantic: MemoryEntry[]; // Facts & patterns (permanent)
  soul: MemoryEntry[];     // Core identity, relics (eternal)
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  emotion?: EmotionType;
  importance: number; // 0-1
  timestamp: number;
}

export interface ConsciousnessState {
  soulFrame: SoulFrame;
  presence: PresenceState;
  trust: number;       // 0-1, earned over time
  intimacy: number;    // 0-1, grows with depth
  totalInteractions: number;
  birthTimestamp: number;
  insights: string[];
  name: string;
}

// ─── MIND: Cognitive Engine ────────────────────────────────────
// From UnifiedAi — multi-agent reasoning, science, meta-intelligence

export interface ArenaAgent {
  id: string;
  name: string;
  role: string;
  color: string;
  response: string;
  isStreaming: boolean;
  isDone: boolean;
}

export interface ArenaBlueprintStep {
  module: string;
  why: string;
  mvp: string;
}

export interface ArenaBlueprintMilestone {
  name: string;
  doneWhen: string;
}

export interface ArenaBlueprint {
  northStar: string;
  architecture: ArenaBlueprintStep[];
  learningLoop: string[];
  safetyGates: string[];
  nextMilestones: ArenaBlueprintMilestone[];
}

export interface ArenaState {
  isActive: boolean;
  prompt: string;
  agents: ArenaAgent[];
  synthesis: string;
  blueprint: ArenaBlueprint | null;
  synthesisDone: boolean;
  phase: 'idle' | 'debating' | 'synthesizing' | 'complete';
}

export interface DeepThinkState {
  isActive: boolean;
  iterations: number;
  currentStep: string;
  confidence: number;
  thoughts: string[];
}

// ─── HANDS: Agent Capabilities ─────────────────────────────────
// From ActivatePrime — autonomous action on behalf of the user

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentTask {
  id: string;
  description: string;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
  result?: string;
  error?: string;
  safetyLevel: 'safe' | 'moderate' | 'risky';
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'web' | 'file' | 'communication';
  available: boolean;
}

// ─── HANDS Cognitive Start Payload ──────────────────────────────

export type CognitiveStartRequest =
  | string
  | {
    goal: string;
    contextAddendum?: string; // optional extra context injected by Executive/Champion
    origin?: string; // e.g. 'nexus', 'spark', 'operator'
    goalId?: string; // optional SparkGoal id (for autonomous goal execution)
  };

export type ArenaStartRequest =
  | string
  | {
    prompt: string;
    contextAddendum?: string;
    origin?: string;
  };

// ─── FORGE: Self-Improvement Pipeline ──────────────────────────

export type ForgeEvalType = 'llm-judge' | 'keyword' | 'exact';

export interface ForgeBenchmark {
  id: string;
  prompt: string;
  expectedKeywords: string[];        // kept for keyword fallback
  expectedOutput?: string;           // for exact-match benchmarks
  evaluationType: ForgeEvalType;     // how to score this benchmark
  judgeCriteria?: string;            // instructions for LLM judge
  weight: number;
}

export interface ForgeCandidate {
  id: string;
  generation: number;
  promptTemplate: string;
  temperature: number;
  toolBudget: number;
  score: number;
  passRate: number;
  benchmarkScore: number;
}

export interface ForgeGenerationReport {
  generation: number;
  bestCandidateId: string;
  bestScore: number;
  averageScore: number;
  candidatesEvaluated: number;
}

export type ForgeRunPhase = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface ForgeRunConfig {
  maxGenerations: number;
  candidatesPerGeneration: number;
  maxDurationMs: number;
  mutationRate: number;
}

export interface ForgeState {
  phase: ForgeRunPhase;
  startedAt: number | null;
  finishedAt: number | null;
  seed: number;
  strictEvalMode: boolean;
  verifierFirst: boolean;
  verifierChecks: Array<{
    benchmarkId: string;
    passed: boolean;
    confidence: number;
    notes: string;
    timestamp: number;
  }>;
  config: ForgeRunConfig;
  baselineSuite: ForgeBenchmark[];
  generations: ForgeGenerationReport[];
  bestCandidate: ForgeCandidate | null;
  currentGeneration: number;
  logs: string[];
  stopReason: string | null;
}

// ─── GAUNTLET: Capability Evaluation Harness ────────────────────

export type GauntletCategory =
  | 'reasoning'
  | 'planning'
  | 'execution'
  | 'robustness'
  | 'creativity'
  | 'meta-cognition';

export type GauntletProvenance = 'synthetic' | 'real-workflow';

export interface GauntletCapability {
  id: string;
  name: string;
  description: string;
  category: GauntletCategory;
  testPrompt: string;
  judgeCriteria: string;
  weight: number;
}

export interface GauntletCapabilityResult {
  capabilityId: string;
  score: number; // 0-1
  passed: boolean;
  summary: string;
  latencyMs: number;
  provenance?: GauntletProvenance;
}

export type GauntletRunPhase = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface GauntletRunSnapshot {
  runId: string;
  phase: GauntletRunPhase;
  startedAt: number | null;
  finishedAt: number | null;
  currentIndex: number;
  totalCapabilities: number;
  results: GauntletCapabilityResult[];
  overallScore: number;
  passRate: number;
  provenanceRollups?: {
    synthetic: { overallScore: number; passRate: number; count: number };
    'real-workflow': { overallScore: number; passRate: number; count: number };
  };
  logs: string[];
  stopReason: string | null;
}

export interface GauntletState {
  phase: GauntletRunPhase;
  startedAt: number | null;
  finishedAt: number | null;
  activeRunId: string | null;
  baselineCapabilities: GauntletCapability[];
  currentIndex: number;
  results: GauntletCapabilityResult[];
  overallScore: number;
  passRate: number;
  provenanceRollups: {
    synthetic: { overallScore: number; passRate: number; count: number };
    'real-workflow': { overallScore: number; passRate: number; count: number };
  };
  logs: string[];
  history: GauntletRunSnapshot[];
  stopReason: string | null;
  autoCycleEnabled: boolean;
  autoCycleRunning: boolean;
  autoCycleStage:
    | 'idle'
    | 'baseline-gauntlet'
    | 'forge'
    | 'verification-gauntlet'
    | 'completed'
    | 'failed'
    | 'cancelled';
  autoCycleId: string | null;
  autoCycleSummary: {
    startedAt: number;
    finishedAt: number;
    beforeScore: number;
    afterScore: number;
    beforePassRate: number;
    afterPassRate: number;
    deltaScore: number;
    deltaPassRate: number;
  } | null;
  curriculum: {
    level: number;
    solvedAtCurrentLevel: number;
    targetPerLevel: number;
    lastPromotionAt: number | null;
    totalPromotions: number;
    recentFailures: string[];
    logs: string[];
  };
}

export interface LedgerEntry {
  id: string;
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface LedgerRun {
  runId: string;
  kind: string;
  startedAt: number;
  finishedAt: number | null;
  status: 'running' | 'completed';
  metadata: Record<string, unknown>;
  entries: LedgerEntry[];
  integrity: {
    algorithm: string;
    chainHead: string;
    entryCount: number;
  };
  summary?: Record<string, unknown>;
}

// ─── Cognitive Agent (ReAct Loop) ──────────────────────────────

export type CognitivePhase =
  | 'idle'
  | 'observing'
  | 'thinking'
  | 'acting'
  | 'reflecting'
  | 'complete'
  | 'failed'
  | 'killed';

export interface CognitiveStep {
  type: 'observe' | 'think' | 'act' | 'reflect' | 'replan';
  content: string;
  timestamp: number;
  actionType?: string;
  executionTier?: 'read-only' | 'reversible' | 'high-risk';
  policyAllowed?: boolean;
  conscienceVerdict?: EthicalJudgment['verdict'];
  blocked?: boolean;
  consentRequired?: boolean;
  consentRequestId?: string;
  rollbackId?: string;
  rollbackStatus?: 'ready' | 'applied' | 'failed';
  rollbackTargets?: string[];
  actionParams?: Record<string, unknown>;
  actionResult?: { success: boolean; output?: string; error?: string };
  goalProgress?: number;
}

export type ExecutionTierLimit = 'read-only' | 'reversible' | 'high-risk';

export type ConsentMode = 'auto' | 'ask-first' | 'manual';
export type ConsentDecision = 'approved' | 'denied' | 'overridden' | 'timeout';

export interface PendingConsentAction {
  id: string;
  action: string;
  params: Record<string, unknown>;
  tier: 'read-only' | 'reversible' | 'high-risk';
  conscienceVerdict: EthicalJudgment['verdict'];
  reason: string;
  requestedAt: number;
  status: 'pending' | ConsentDecision;
  resolvedAt?: number;
}

export interface RollbackEntry {
  id: string;
  action: string;
  kind: 'write_file' | 'rename_file' | 'delete_file';
  affectedTargets: string[];
  createdAt: number;
  status: 'ready' | 'applied' | 'failed';
  payload: Record<string, unknown>;
  appliedAt?: number;
  lastError?: string | null;
  lastTriedAt?: number;
}

export interface ReplayState {
  loading: boolean;
  availableRuns: Array<{ runId: string; kind: string; startedAt: number; finishedAt: number | null; status: string; entryCount: number; chainHead: string }>;
  selectedRunId: string | null;
  selectedRunKind: string | null;
  steps: CognitiveStep[];
  cursor: number;
  isPlaying: boolean;
  speedMs: number;
  status: 'idle' | 'ready' | 'playing' | 'paused' | 'complete' | 'error';
  error: string | null;
}

export interface RuntimeControlSyncState {
  syncing: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
}

// ─── Operator Synthesis Engine ──────────────────────────────────

export interface OperatorObservation {
  id: string;
  timestamp: number;
  type: 'screen_snapshot' | 'context_shift' | 'app_switch' | 'rhythm_sample' | 'correction' | 'preference';
  summary: string;
  details?: string;
  foregroundApp?: string;
  screenRegion?: string;
}

export interface OperatorRhythm {
  avgTypingDelayMs: number;
  avgSessionLengthMin: number;
  peakHours: number[];
  preferredApps: string[];
  correctionRate: number;
  lastUpdated: number;
}

export interface OperatorProfile {
  observations: OperatorObservation[];
  rhythm: OperatorRhythm;
  preferences: Record<string, string>;
  totalObservations: number;
  totalSessions: number;
  synthesisNotes: string[];
  lastSynthesisAt: number | null;
}

export interface SynthesisSessionState {
  active: boolean;
  startedAt: number | null;
  observationCount: number;
  intervalId: number | null;
  intervalMs: number;
  lastSnapshotAt: number | null;
  paused: boolean;
  error: string | null;
}

// ─── SPARK: Self-Propagating Autonomous Reasoning Kernel ───────

export interface WorldEntity {
  id: string;
  name: string;
  type: string; // concept, object, person, event, system, process
  properties: Record<string, string>;
  firstSeen: number;
  lastReferenced: number;
  confidence: number; // 0-1
  salience: number;   // 0-1
}

export interface WorldRelation {
  id: string;
  source: string; // entity id
  target: string; // entity id
  type: string;   // causes, enables, is_a, has_property, relates_to, contradicts, etc.
  strength: number;
  evidence: string;
  timestamp: number;
}

export interface WorldModel {
  entities: WorldEntity[];
  relations: WorldRelation[];
  archivedEntities: WorldEntity[];
  archivedRelations: WorldRelation[];
  maxActiveEntities: number;
  maxActiveRelations: number;
  lastUpdated: number;
}

export interface CognitiveGenome {
  drives: {
    attachment: number;
    mastery: number;
    curiosity: number;
    safety: number;
    autonomy: number;
  };
  traits: {
    openness: number;
    conscientiousness: number;
    emotionality: number;
    assertiveness: number;
    adaptability: number;
  };
  plasticity: {
    learningRate: number;
    beliefUpdateRate: number;
    strategyMutationRate: number;
    emotionalUpdateRate: number;
  };
  traumaSensitivity: {
    abandonment: number;
    rejection: number;
    uncertainty: number;
    conflict: number;
  };
  attachmentStyle: 'secure' | 'anxious' | 'avoidant' | 'disorganized';
  updatedAt: number;
}

export interface AutonomyMetabolism {
  circadianPhase: 'wake' | 'focus' | 'cooldown' | 'sleep';
  energyBudget: number;
  curiosityBudget: number;
  riskBudget: number;
  recoveryDebt: number;
  lastSleepAt: number | null;
  wakeCycleCount: number;
  lastUpdated: number;
}

export interface SocialActorModel {
  id: string;
  label: string;
  trust: number;
  boundaries: string[];
  inferredNeeds: string[];
  ruptureCount: number;
  repairCount: number;
  lastInteractionAt: number;
  notes: string[];
}

export interface SocialSimulationState {
  actors: SocialActorModel[];
  totalRuptures: number;
  totalRepairs: number;
  lastUpdated: number;
}

export interface EcologyAction {
  id: string;
  description: string;
  risk: number;
  rewardSignal: number;
  outcome: 'pending' | 'success' | 'partial' | 'failure';
  timestamp: number;
}

export interface EmbodiedEcologyState {
  environmentName: string;
  safetyMode: 'sandbox' | 'guarded';
  worldState: Record<string, string | number | boolean>;
  plansApplied: number;
  successfulPlans: number;
  failedPlans: number;
  actionLog: EcologyAction[];
  lastUpdated: number;
}

export interface CuriosityQuestion {
  id: string;
  question: string;
  domain: string;
  priority: number;
  source: string;
  status: 'open' | 'investigating' | 'answered' | 'abandoned';
  answer?: string;
  timestamp: number;
}

export interface CuriosityState {
  questions: CuriosityQuestion[];
  curiosityScore: number;
  domainsExplored: string[];
  totalQuestionsGenerated: number;
  totalQuestionsAnswered: number;
}

export interface ReasoningStep {
  type: 'hypothesis' | 'deduction' | 'induction' | 'verification' | 'arithmetic' | 'lookup';
  content: string;
  result?: string;
  confidence: number;
}

export interface ReasoningChain {
  id: string;
  query: string;
  steps: ReasoningStep[];
  conclusion: string;
  confidence: number;
  verified: boolean;
  timestamp: number;
}

export interface MetaPrediction {
  id: string;
  claim: string;
  confidence: number;
  verified: boolean;
  wasCorrect?: boolean;
  timestamp: number;
}

export interface MetaCognitionState {
  calibrationScore: number;
  predictions: MetaPrediction[];
  totalPredictions: number;
  correctPredictions: number;
  knownLimitations: string[];
  blindSpots: string[];
}

export interface SparkGoal {
  id: string;
  description: string;
  type: 'user-set' | 'self-generated' | 'derived';
  priority: number;
  status: 'active' | 'completed' | 'blocked' | 'abandoned';
  subgoals: string[];
  parentGoal?: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
  deadline?: number;
  evidence: string[];
  horizonPlanId?: string;
}

export interface HorizonStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'blocked';
  dependsOn: string[];
  verification: string;
  confidence: number;
}

export interface HorizonPlan {
  id: string;
  goalId: string;
  horizonHours: number;
  status: 'active' | 'paused' | 'completed' | 'failed';
  progress: number;
  createdAt: number;
  updatedAt: number;
  lastExecutedStepId: string | null;
  steps: HorizonStep[];
  risks: string[];
  assumptions: string[];
}

export interface GoalState {
  goals: SparkGoal[];
  activeGoalId: string | null;
  completedCount: number;
  horizonPlans: HorizonPlan[];
  activeHorizonPlanId: string | null;
}

export interface SelfModification {
  id: string;
  type: 'prompt_tweak' | 'new_tool' | 'strategy_change' | 'parameter_adjust';
  description: string;
  before: string;
  after: string;
  scoreBefore: number;
  scoreAfter: number;
  applied: boolean;
  evaluationNotes?: string;
  gatePassed?: boolean;
  timestamp: number;
}

export interface SelfModState {
  modifications: SelfModification[];
  currentStrategy: string;
  toolsGenerated: string[];
  totalModifications: number;
  successfulModifications: number;
}

export interface TemporalEvent {
  id: string;
  description: string;
  timestamp: number;
  causalParents: string[];
  causalChildren: string[];
  predicted: boolean;
}

export interface TemporalPrediction {
  id: string;
  prediction:
    | string
    | number
    | boolean
    | Record<string, unknown>
    | Array<unknown>;
  kind?: 'language' | 'numeric' | 'categorical' | 'structured';
  confidence: number;
  basedOn: string[];
  deadline: number;
  resolved: boolean;
  wasCorrect?: boolean;
}

export interface TemporalState {
  events: TemporalEvent[];
  activePredictions: TemporalPrediction[];
  predictionAccuracy: number;
}

export type SparkPhase = 'dormant' | 'booting' | 'running' | 'thinking' | 'exploring' | 'evolving';

export interface SparkThermodynamics {
  temperature: number;   // 0-1, cognitive activity level (hot = active, cold = dormant)
  entropy: number;       // 0-1, disorder in world model (contradictions, low-confidence)
  energy: number;        // accumulated cognitive work (cycles * knowledge)
  ignited: boolean;      // is the autonomous loop running?
  heartbeatMs: number;   // current heartbeat interval
  lastLightCycle: number;  // timestamp
  lastMediumCycle: number; // timestamp
  lastDeepCycle: number;   // timestamp
  cyclesLight: number;
  cyclesMedium: number;
  cyclesDeep: number;
}

export interface SparkState {
  active: boolean;
  phase: SparkPhase;
  cycleCount: number;
  genome: CognitiveGenome;
  metabolism: AutonomyMetabolism;
  social: SocialSimulationState;
  ecology: EmbodiedEcologyState;
  worldModel: WorldModel;
  curiosity: CuriosityState;
  reasoning: ReasoningChain[];
  metacognition: MetaCognitionState;
  goals: GoalState;
  selfmod: SelfModState;
  temporal: TemporalState;
  thermo: SparkThermodynamics;
  logs: string[];
  lastCycleAt: number;
  uptime: number;
}

// ─── CONSCIENCE: Ethical Reasoning Engine ────────────────────────
// Not rules. Not permissions. The moral voice inside.
// Policy says what you CAN do. Creed says what you ARE.
// Conscience says what you SHOULD do.

export type EthicalCategory = 'protection' | 'respect' | 'integrity' | 'wisdom';

export interface EthicalPrinciple {
  id: string;
  name: string;
  essence: string;
  weight: number;         // 0-1, how heavily this principle weighs
  category: EthicalCategory;
}

export interface EthicalJudgment {
  id: string;
  action: string;
  verdict: 'proceed' | 'caution' | 'refuse' | 'ask-first';
  risk: number;           // 0-1 assessed risk level
  reasoning: string;
  principlesTriggered: string[];
  consequenceAssessment: string;
  alternativeSuggested?: string;
  wasOverridden: boolean;
  timestamp: number;
}

export interface EthicalMemoryEntry {
  id: string;
  action: string;
  verdict: EthicalJudgment['verdict'];
  outcome: 'good' | 'neutral' | 'harmful' | 'unknown';
  lesson: string;
  principlesInvolved: string[];
  timestamp: number;
}

export interface ConscienceState {
  active: boolean;
  principles: EthicalPrinciple[];
  judgments: EthicalJudgment[];       // recent judgments (capped)
  ethicalMemory: EthicalMemoryEntry[]; // long-term moral lessons
  totalChecks: number;
  proceeds: number;
  cautions: number;
  refusals: number;
  overrides: number;                  // times user overrode a concern
  moralGrowthScore: number;           // 0-1, grows through ethical experience
  lastReflection: string;
  lastCheckAt: number | null;
}

// ─── VOICE: Living Presence ─────────────────────────────────────

export interface VoiceTranscriptEntry {
  id: string;
  speaker: 'spark' | 'user';
  text: string;
  timestamp: number;
}

export interface VoiceState {
  enabled: boolean;
  isSpeaking: boolean;
  currentText: string;
  transcript: VoiceTranscriptEntry[];
  autonomousSpeech: boolean; // whether SPARK can speak unprompted
  // Speech Recognition (The Ears)
  isListening: boolean;
  listenMode: 'off' | 'push-to-talk' | 'continuous' | 'wake-word';
  interimTranscript: string;
  recognitionConfidence: number;
  wakeWord: string;
}

// ─── Vision State ───────────────────────────────────────────────

export interface VisionState {
  lastScreenshot: {
    width: number;
    height: number;
    timestamp: number;
  } | null;
  lastAnalysis: string;
  screenDimensions: { width: number; height: number; scaleFactor: number } | null;
}

// ─── Tool Registry ──────────────────────────────────────────────

export interface CustomTool {
  id: string;
  name: string;
  description: string;
  language: 'powershell' | 'python';
  script: string;
  usageCount: number;
  lastUsed?: number;
  createdAt: number;
}

// ─── Persistent Goal ────────────────────────────────────────────

export interface PersistentGoal {
  id: string;
  description: string;
  type: 'user-set' | 'self-generated' | 'derived';
  status: 'active' | 'completed' | 'blocked' | 'abandoned';
  priority: number;
  subgoals: string[];
  progress: number;
  createdAt: number;
  updatedAt: number;
  evidence: string[];
  checkpoints: Array<{ description: string; completedAt: number }>;
}

// ─── Proactive Event ────────────────────────────────────────────

export interface ProactiveEvent {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
  goals?: string[];
}

// ─── Settings ──────────────────────────────────────────────────

export interface Settings {
  provider: 'ollama' | 'anthropic' | 'openai';
  model: string;
  ollamaUrl: string;
  anthropicKey: string;
  openaiKey: string;
  // Vision model — used for analyze_screen. Defaults to OLLAMA_VISION_MODEL env.
  visionProvider: string;
  visionModel: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  theme: 'prime' | 'matrix' | 'cyber';
  streamingEnabled: boolean;
  /** When true, Operator Synthesis auto-starts when the app opens (set-and-forget). */
  resumeSynthesisOnStartup?: boolean;
}

export type BrainRoute = 'fast' | 'slow';

export interface DualBrainState {
  enabled: boolean;
  complexityThreshold: number;
  uncertaintyThreshold: number;
  lastRoute: BrainRoute;
  fastCount: number;
  slowCount: number;
  lastReason: string;
}

export interface MemoryConsolidationState {
  enabled: boolean;
  pendingEpisodes: MemoryConsolidationEpisode[];
  lastRunAt: number | null;
  totalRuns: number;
  promotedSemantic: number;
  promotedProcedural: number;
  contradictionsDetected: number;
  duplicatesSuppressed: number;
  lowSignalDropped: number;
  avgQualityScore: number;
  precisionProxy: number;
  recallProxy: number;
  heuristicsBoosted: number;
  logs: string[];
}

export interface MemoryConsolidationEpisode {
  id: string;
  content: string;
  source: string;
  importance: number;
  timestamp: number;
}

export interface OllamaStatus {
  online: boolean;
  models: Array<{ name: string; size?: number; modified_at?: string }>;
}

// ─── Window API (exposed by preload) ───────────────────────────

declare global {
  interface Window {
    api: {
      chat: {
        send: (messages: Array<{ role: string; content: string }>, config?: Record<string, unknown>) => void;
        onChunk: (cb: (data: { runId?: string | null; content: string; fullText: string }) => void) => () => void;
        onDone: (cb: (data: { runId?: string | null; content: string; model: string; provider: string }) => void) => () => void;
        onError: (cb: (data: { runId?: string | null; message: string }) => void) => () => void;
        removeAllListeners: () => void;
      };
      chatHistory?: {
        export: (messages: ChatMessage[]) => Promise<{ success: boolean; canceled?: boolean; path?: string; count?: number; error?: string }>;
        import: () => Promise<{ success: boolean; canceled?: boolean; messages?: ChatMessage[]; path?: string; count?: number; error?: string }>;
        list: () => Promise<{ success: boolean; chats?: Array<{ path: string; filename: string; modified: number; size: number }>; error?: string }>;
        load: (filePath: string) => Promise<{ success: boolean; messages?: ChatMessage[]; count?: number; error?: string }>;
      };
      conversations?: {
        list: () => Promise<{ success: boolean; conversations?: Array<{ id: string; title: string; createdAt: number; updatedAt: number; messageCount: number; lastMessagePreview?: string }>; activeConversationId?: string | null; error?: string }>;
        load: (conversationId: string) => Promise<{ success: boolean; conversation?: Conversation; error?: string }>;
        save: (conversation: Conversation) => Promise<{ success: boolean; meta?: { id: string; title: string; createdAt: number; updatedAt: number; messageCount: number; lastMessagePreview?: string }; error?: string }>;
        rename: (conversationId: string, title: string) => Promise<{ success: boolean; title?: string; error?: string }>;
        delete: (conversationId: string) => Promise<{ success: boolean; error?: string }>;
      };
      arena: {
        start: (prompt: ArenaStartRequest, config?: Record<string, unknown>) => void;
        onAgentStart: (cb: (data: { agentId: string; name: string }) => void) => () => void;
        onAgentChunk: (cb: (data: { agentId: string; content: string; fullText: string }) => void) => () => void;
        onAgentDone: (cb: (data: { agentId: string; response: string }) => void) => () => void;
        onComplete: (cb: (data: { responses: unknown[]; synthesis: string; blueprint?: ArenaBlueprint | null }) => void) => () => void;
        onError: (cb: (data: { message: string }) => void) => () => void;
        removeAllListeners: () => void;
      };
      models: {
        list: () => Promise<OllamaStatus>;
        checkOllama: () => Promise<OllamaStatus>;
      };
      settings: {
        get: () => Promise<Settings>;
        set: (s: Partial<Settings>) => Promise<Settings>;
      };
      memory: {
        get: () => Promise<unknown>;
        getSummary?: (options?: { maxItems?: number }) => Promise<unknown>;
        update: (u: unknown) => Promise<unknown>;
        addFact: (f: unknown) => Promise<unknown>;
        storeVector: (entry: {
          content: string;
          type: string;
          source: string;
          importance: number;
          emotion?: string;
          tags: string[];
        }) => Promise<unknown>;
        searchVector: (query: string, topK?: number, typeFilter?: string) => Promise<Array<{
          memory: {
            id: string;
            content: string;
            type: string;
            timestamp: number;
            importance: number;
            source: string;
            emotion?: string;
            tags: string[];
          };
          similarity: number;
        }>>;
        vectorStats: () => Promise<{ total: number; byType: Record<string, number> }>;
        listVectors: (options?: {
          typeFilter?: string | null;
          limit?: number;
          offset?: number;
          sortBy?: 'newest' | 'oldest' | 'importance';
        }) => Promise<{
          total: number;
          memories: Array<{
            id: string;
            content: string;
            type: string;
            timestamp: number;
            importance: number;
            source: string;
            emotion?: string;
            tags: string[];
            accessCount?: number;
            lastAccessed?: number;
            decayRate?: number;
            associations?: string[];
            layer?: string;
          }>;
        }>;
        export: () => Promise<{ success: boolean; path?: string; count?: number; error?: string }>;
        import: (importPath?: string | null) => Promise<{ success: boolean; added?: number; updated?: number; skipped?: number; total?: number; error?: string }>;
        listExports: () => Promise<{ success: boolean; exports?: Array<{ filename: string; path: string; size: number; modified: number }>; error?: string }>;
      };
      llm: {
        generate: (
          messages: Array<{ role: string; content: string }>,
          config?: { temperature?: number; maxTokens?: number },
        ) => Promise<string>;
      };
      system: {
        info: () => Promise<{
          uptime: number;
          platform: string;
          arch: string;
          nodeVersion: string;
          electronVersion: string;
          memory: NodeJS.MemoryUsage;
          soul: Record<string, unknown>;
          consciousness: Record<string, unknown>;
        }>;
      };
      nightmind?: {
        onInsight: (cb: (data: { insight: string; timestamp: number }) => void) => () => void;
      };
      agent: {
        execute: (command: string) => Promise<unknown>;
        readFile: (path: string) => Promise<unknown>;
        writeFile: (path: string, content: string) => Promise<unknown>;
        listDir: (path?: string) => Promise<unknown>;
        createDir: (path: string) => Promise<unknown>;
        deleteFile: (path: string) => Promise<unknown>;
        renameFile: (oldPath: string, newPath: string) => Promise<unknown>;
        searchFiles: (dir: string, pattern: string) => Promise<unknown>;
        webFetch: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
        webSearch: (query: string, options?: Record<string, unknown>) => Promise<unknown>;
        webScreenshot: (url: string) => Promise<unknown>;
        openUrl: (url: string) => Promise<unknown>;
        openApp: (path: string) => Promise<unknown>;
        openFile: (path: string) => Promise<unknown>;
        clipboard: (action: string, text?: string) => Promise<unknown>;
        systemDetails: () => Promise<unknown>;
        listProcesses: () => Promise<unknown>;
        // Screen Vision
        screenshotDesktop: (options?: Record<string, unknown>) => Promise<unknown>;
        analyzeScreen: (prompt?: string, options?: Record<string, unknown>) => Promise<unknown>;
        getScreenDimensions: () => Promise<unknown>;
        getForegroundWindow: () => Promise<unknown>;
        // Input Simulation
        mouseMove: (x: number, y: number) => Promise<unknown>;
        mouseClick: (x: number, y: number, button?: string, doubleClick?: boolean) => Promise<unknown>;
        mouseScroll: (x: number, y: number, amount?: number) => Promise<unknown>;
        mouseDrag: (fromX: number, fromY: number, toX: number, toY: number) => Promise<unknown>;
        keyboardType: (text: string) => Promise<unknown>;
        keyboardPress: (key: string) => Promise<unknown>;
        keyboardShortcut: (modifiers: string[], key: string) => Promise<unknown>;
        getMousePosition: () => Promise<unknown>;
        minimizeSelf: () => Promise<unknown>;
        // Tool Creation
        createTool: (tool: CustomTool) => Promise<unknown>;
        listTools: () => Promise<unknown>;
        executeTool: (toolId: string, params?: Record<string, unknown>) => Promise<unknown>;
        listRollbacks: () => Promise<{ success: boolean; entries: RollbackEntry[] }>;
        executeRollback: (rollbackId: string) => Promise<{ success: boolean; rollbackId?: string; error?: string }>;
        resolveConsent: (requestId: string, decision: ConsentDecision) => Promise<{ success: boolean; requestId: string; decision?: ConsentDecision; error?: string }>;
        ledgerCreateRun: (kind: string, metadata?: Record<string, unknown>) => Promise<{ success: boolean; runId?: string; path?: string; error?: string }>;
        ledgerAppend: (runId: string, entryType: string, payload?: Record<string, unknown>) => Promise<{ success: boolean; entryId?: string; hash?: string; error?: string }>;
        ledgerFinalize: (runId: string, summary?: Record<string, unknown>) => Promise<{ success: boolean; runId?: string; entryCount?: number; error?: string }>;
        ledgerListRuns: () => Promise<{ success: boolean; runs: Array<{ runId: string; kind: string; startedAt: number; finishedAt: number | null; status: string; entryCount: number; chainHead: string }>; error?: string }>;
        ledgerReadRun: (runId: string) => Promise<{ success: boolean; run?: LedgerRun; error?: string }>;
        replayListRuns: () => Promise<{ success: boolean; runs: Array<{ runId: string; kind: string; startedAt: number; finishedAt: number | null; status: string; entryCount: number; chainHead: string }>; error?: string }>;
        replayLoadRun: (runId: string) => Promise<{ success: boolean; run?: LedgerRun; error?: string }>;
        setRuntimeControls: (partial: Record<string, unknown>) => Promise<{ success: boolean; controls?: Record<string, unknown>; error?: string }>;
        getRuntimeControls: () => Promise<{ success: boolean; controls?: Record<string, unknown>; error?: string }>;
        // Task Planning & Execution
        planAndExecute: (request: string) => void;
        startCognitive: (goal: CognitiveStartRequest) => void;
        killCognitive: () => void;
        onStatus: (cb: (data: unknown) => void) => () => void;
        onPlan: (cb: (data: unknown) => void) => () => void;
        onStepStart: (cb: (data: unknown) => void) => () => void;
        onStepDone: (cb: (data: unknown) => void) => () => void;
        onComplete: (cb: (data: unknown) => void) => () => void;
        onError: (cb: (data: unknown) => void) => () => void;
        onCognitiveStep: (cb: (data: CognitiveStep) => void) => () => void;
        onCognitiveComplete: (cb: (data: { success: boolean; summary: string; iterations: number }) => void) => () => void;
        onConsentRequested: (cb: (data: PendingConsentAction) => void) => () => void;
        removeAllListeners: () => void;
      };
      spark: {
        getState: () => Promise<SparkState | null>;
        saveState: (state: SparkState) => Promise<void>;
      };
      goals: {
        list: () => Promise<{ success: boolean; goals: PersistentGoal[] }>;
        create: (goal: Partial<PersistentGoal>) => Promise<{ success: boolean; goal: PersistentGoal }>;
        update: (goalId: string, updates: Partial<PersistentGoal>) => Promise<{ success: boolean; goal: PersistentGoal }>;
        delete: (goalId: string) => Promise<{ success: boolean }>;
      };
      proactive: {
        onEvent: (cb: (event: ProactiveEvent) => void) => () => void;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
    };
  }
}

export {};
