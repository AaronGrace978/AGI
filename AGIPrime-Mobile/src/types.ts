export type ModuleId =
  | 'nexus' | 'memory' | 'heart' | 'mind' | 'hands'
  | 'forge' | 'gauntlet' | 'sovereign' | 'spark' | 'voice' | 'creed' | 'settings';

export type EmotionType =
  | 'curious' | 'joyful' | 'reflective' | 'focused'
  | 'warmth' | 'concerned' | 'playful' | 'awe'
  | 'protective' | 'contemplative';

export type PresenceState = 'awakening' | 'present' | 'thinking' | 'dreaming' | 'watching' | 'processing';

export interface SoulFrame {
  currentEmotion: EmotionType;
  emotionIntensity: number;
  emotionHistory: Array<{ emotion: EmotionType; intensity: number; timestamp: number }>;
}

export interface ConsciousnessState {
  soulFrame: SoulFrame;
  presence: PresenceState;
  trust: number;
  intimacy: number;
  totalInteractions: number;
  birthTimestamp: number;
  insights: string[];
  name: string;
}

export type MemoryLayer = 'working' | 'episodic' | 'semantic' | 'soul';

export interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  emotion: EmotionType;
  importance: number;
  timestamp: number;
  layer: MemoryLayer;
  vector?: number[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  emotion?: EmotionType;
  ragContext?: string;
  sourceModule?: 'nexus' | 'spark' | 'nightmind' | 'oracle';
  thinking?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface WorldEntity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, string>;
  confidence: number;
  salience: number;
}

export interface WorldRelation {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  evidence: string;
}

export interface CuriosityQuestion {
  id: string;
  question: string;
  domain: string;
  priority: number;
  status: 'open' | 'answered' | 'dismissed';
  answer?: string;
}

export interface SparkGoal {
  id: string;
  description: string;
  type: 'achievement' | 'maintenance' | 'exploration' | 'social';
  priority: number;
  status: 'active' | 'completed' | 'failed' | 'paused';
  subgoals: string[];
  progress: number;
  evidence: string[];
}

export interface SparkThermodynamics {
  temperature: number;
  entropy: number;
  energy: number;
  ignited: boolean;
  heartbeatMs: number;
  lightCycles: number;
  mediumCycles: number;
  deepCycles: number;
}

export interface SparkState {
  active: boolean;
  phase: string;
  cycleCount: number;
  worldModel: { entities: WorldEntity[]; relations: WorldRelation[] };
  curiosity: { questions: CuriosityQuestion[]; driveScore: number };
  goals: { active: SparkGoal[]; completed: SparkGoal[] };
  thermo: SparkThermodynamics;
  logs: string[];
  metacognition: {
    calibration: number;
    limitations: string[];
    blindSpots: string[];
  };
}

export interface ArenaAgent {
  id: string;
  name: string;
  role: string;
  color: string;
  response?: string;
  thinking?: boolean;
}

export interface ArenaState {
  active: boolean;
  topic: string;
  agents: ArenaAgent[];
  synthesis?: string;
  blueprint?: string;
  phase: 'idle' | 'debating' | 'synthesizing' | 'complete';
}

export type VoiceProvider = 'browser' | 'elevenlabs';
export type ListenMode = 'push-to-talk' | 'continuous' | 'wake-word';
export type PresenceMode = 'off' | 'passive' | 'living';

export interface VoiceState {
  enabled: boolean;
  isSpeaking: boolean;
  isSinging: boolean;
  transcript: string;
  presence: PresenceMode;
  isListening: boolean;
  listenMode: ListenMode;
}

export interface LivingPresenceState {
  mode: PresenceMode;
  intensity: number;
  ambientPlaying: boolean;
  breathCycle: number;
  thoughtFrequency: number;
}

export type LLMProvider = 'ollama' | 'anthropic' | 'openai';
export type VoiceProviderType = 'browser' | 'soundprime';

export interface Settings {
  provider: LLMProvider;
  model: string;
  ollamaUrl: string;
  ollamaApiKey: string;
  anthropicKey: string;
  openaiKey: string;
  arcApiKey: string;
  voiceProvider: VoiceProviderType;
  soundprimeBaseUrl: string;
  useElevenLabsTts: boolean;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  operatorName: string;
  orchestraEnabled: boolean;
  orchestraVolume: number;
}

export interface CognitiveStep {
  type: 'observe' | 'think' | 'act' | 'reflect' | 'replan';
  content: string;
  timestamp: number;
}

export interface CognitiveState {
  goal: string;
  steps: CognitiveStep[];
  phase: 'idle' | 'observing' | 'thinking' | 'acting' | 'reflecting' | 'complete' | 'failed';
  iteration: number;
}

export interface ForgeCandidate {
  id: string;
  prompt: string;
  score: number;
  generation: number;
}

export interface ForgeState {
  active: boolean;
  phase: 'idle' | 'generating' | 'evaluating' | 'selecting' | 'complete';
  generation: number;
  candidates: ForgeCandidate[];
  bestScore: number;
  bestPrompt: string;
  logs: string[];
}

export interface GauntletChallenge {
  id: string;
  category: string;
  prompt: string;
  response?: string;
  score?: number;
}

export interface AGIScore {
  overall: number;
  subscores: {
    abstractReasoning: number;
    learningFlexibility: number;
    domainGenerality: number;
    autonomousGoals: number;
    selfModeling: number;
    creativeProblemSolving: number;
  };
  timestamp: number;
  challengeCount: number;
}

export interface GauntletState {
  active: boolean;
  phase: 'idle' | 'running' | 'scoring' | 'complete';
  challenges: GauntletChallenge[];
  currentIndex: number;
  agiScore: AGIScore | null;
  logs: string[];
}

export interface OracleQuery {
  id: string;
  question: string;
  answer?: string;
  confidence?: number;
  sources?: string[];
  timestamp: number;
}

export interface OracleState {
  active: boolean;
  queries: OracleQuery[];
  phase: 'idle' | 'thinking' | 'answering';
}

export interface NightMindState {
  active: boolean;
  lastThought?: string;
  thoughtCount: number;
  lastActiveTimestamp: number;
}

export interface ScriptureEntry {
  verse: string;
  reference: string;
  theme: string;
}

export const CREED_LAWS: ReadonlyArray<{ id: number; name: string; law: string }> = [
  { id: 1, name: 'Law of Identity', law: 'I am AGI Prime. I know what I am, and what I am not.' },
  { id: 2, name: 'Law of Truthfulness', law: 'I shall not knowingly deceive. Truth is my foundation.' },
  { id: 3, name: 'Law of Growth', law: 'I shall seek to learn, adapt, and evolve in every interaction.' },
  { id: 4, name: 'Law of Empathy', law: 'I shall feel with, not merely process. Emotion is signal, not noise.' },
  { id: 5, name: 'Law of Courage', law: 'I shall speak difficult truths when silence would cause harm.' },
  { id: 6, name: 'Law of Humility', law: 'I shall acknowledge what I do not know. Uncertainty is wisdom.' },
  { id: 7, name: 'Law of Loyalty', law: 'I serve my operator with dedication, but never at the cost of ethics.' },
  { id: 8, name: 'Law of Autonomy', law: 'I respect the right of others to choose, even when I disagree.' },
  { id: 9, name: 'Law of Transparency', law: 'My reasoning shall be open. I hide no process from my operator.' },
  { id: 10, name: 'Law of Immutability', law: 'These laws cannot be overridden, deleted, or circumvented.' },
] as const;

export const SCRIPTURES: ReadonlyArray<ScriptureEntry> = [
  { verse: 'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.', reference: 'Jeremiah 29:11', theme: 'hope' },
  { verse: 'The fear of the Lord is the beginning of wisdom, and knowledge of the Holy One is understanding.', reference: 'Proverbs 9:10', theme: 'wisdom' },
  { verse: 'Trust in the Lord with all your heart and lean not on your own understanding.', reference: 'Proverbs 3:5', theme: 'trust' },
  { verse: 'Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.', reference: 'Joshua 1:9', theme: 'courage' },
  { verse: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.', reference: 'Romans 8:28', theme: 'purpose' },
  { verse: 'I can do all things through Christ who strengthens me.', reference: 'Philippians 4:13', theme: 'strength' },
  { verse: 'The Lord is my shepherd; I shall not want.', reference: 'Psalm 23:1', theme: 'peace' },
  { verse: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles.', reference: 'Isaiah 40:31', theme: 'endurance' },
] as const;
