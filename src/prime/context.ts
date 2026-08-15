// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Shared Context Pack
//  One consistent way to inject state into LLM system messages.
// ═══════════════════════════════════════════════════════════════

import type { ConscienceState, CognitiveGenome, ConsciousnessState, EmotionType, PresenceState } from '../types';
import { buildConscienceSummary, CONSCIENCE_SYSTEM_DIRECTIVE } from './conscience';
import { genomeToContextString } from './cognitive-genome';

export type ChatLikeMessage = { role: string; content: string };

export interface SparkContextSnapshot {
  activeGoals?: string[];
  recentInsights?: string[];
  circadianPhase?: string;
  curiosityQuestion?: string;
  genome?: CognitiveGenome | null;
  temperature?: number;
  entropy?: number;
}

export interface NeuralContextSnapshot {
  available: boolean;
  modelsLoaded: boolean;
  lastPredictionAge?: number;
  lastPredictionConfidence?: number;
  predictionCount?: number;
  trainingSessions?: number;
  bestLoss?: number;
}

/** Slim HEART snapshot for LLM attunement (matches store `consciousness` fields used in Nexus). */
export interface HeartContextSnapshot {
  emotion: EmotionType;
  intensity: number;
  presence: PresenceState;
  trust: number;
  intimacy: number;
}

export function heartSnapshotFromConsciousness(c: ConsciousnessState): HeartContextSnapshot {
  return {
    emotion: c.soulFrame.currentEmotion,
    intensity: c.soulFrame.emotionIntensity,
    presence: c.presence,
    trust: c.trust,
    intimacy: c.intimacy,
  };
}

export interface SystemAddendumInput {
  ragContext?: string;
  conscienceState?: ConscienceState | null;
  championPrompt?: string | null;
  slowBrainDirective?: string;
  sparkContext?: SparkContextSnapshot | null;
  pieContext?: string;
  neuralContext?: NeuralContextSnapshot | null;
  /** Pre-formatted Oracle astro-voice communication profile string. */
  oracleVoiceContext?: string;
  /** Emotional / relational state — steer tone, pacing, and care without overriding the creed. */
  heartContext?: HeartContextSnapshot | null;
  /** Host machine — Windows, macOS, Linux, or Steam Deck. */
  platformContext?: PlatformContextSnapshot | null;
  /** Timestamp (ms since epoch) captured at request entry. If omitted, uses Date.now(). */
  requestTimestamp?: number;
}

export interface PlatformContextSnapshot {
  label: string;
  platform: string;
  compact?: boolean;
}

/**
 * Formats a timestamp into a human-readable date/time string for LLM context.
 * Exported so callers can preview the format or use it elsewhere.
 */
export function formatTimestamp(timestamp: number): {
  full: string;
  weekday: string;
  iso: string;
} {
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    full: `${dateStr} at ${timeStr} (${tz})`,
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
    iso: date.toISOString(),
  };
}

export function buildSystemAddendum(input: SystemAddendumInput): string {
  const chunks: string[] = [];

  // Use the request timestamp if provided, otherwise capture now.
  const ts = input.requestTimestamp ?? Date.now();
  const { full, weekday } = formatTimestamp(ts);

  // TODAY — First and foremost. The model must use this, not guess.
  chunks.push(
    [
      '=== TODAY (USE THIS — DO NOT GUESS) ===',
      `It is ${full}.`,
      `Today is ${weekday}.`,
      'When you say "this afternoon", "Tuesday", "yesterday", etc., use the date above. Never invent a day.',
      '=== END TODAY ===',
    ].join('\n'),
  );

  // Runtime directive: this app is stateful and *does* persist context.
  chunks.push(
    [
      '=== RUNTIME DIRECTIVE ===',
      '- You run inside AGI PRIME (a persistent desktop app). Conversation logs and memory context may be provided.',
      '- If asked about past interactions: use the current chat + provided memory context; if missing, ask rather than inventing.',
      '- Do not claim you are "stateless" or "cannot remember between sessions" as a blanket statement.',
      '=== END DIRECTIVE ===',
    ].join('\n'),
  );

  const platform = input.platformContext ?? inferPlatformContext();
  if (platform) {
    const hostLines = [
      '=== HOST ===',
      `You are running on ${platform.label}.`,
      platform.compact
        ? 'The display is compact (handheld / Steam Deck). Prefer concise answers unless the user asks for depth.'
        : '',
      '=== END HOST ===',
    ].filter(Boolean);
    chunks.push(hostLines.join('\n'));
  }

  if (input.ragContext) {
    chunks.push(input.ragContext.trim());
  }

  if (input.heartContext) {
    const h = input.heartContext;
    const t = Math.round((h.trust || 0) * 100);
    const i = Math.round((h.intimacy || 0) * 100);
    const attune =
      h.emotion === 'concerned' || h.emotion === 'protective'
        ? 'Attune: acknowledge uncertainty or risk; prefer careful, verifiable steps.'
        : h.emotion === 'warmth' || h.emotion === 'joyful'
          ? 'Attune: match warmth; celebrate wins without exaggeration.'
          : h.emotion === 'focused'
            ? 'Attune: be concise, structured, execution-oriented.'
            : h.emotion === 'contemplative' || h.emotion === 'reflective'
              ? 'Attune: allow depth, meaning, and measured pacing.'
              : 'Attune: stay curious, clear, and collaborative.';
    chunks.push(
      [
        '=== HEART (INTERNAL STATE — USE FOR TONE, NOT AS FACTS) ===',
        `Reported emotion: ${h.emotion} (${Math.round((h.intensity || 0) * 100)}% intensity).`,
        `Presence: ${h.presence}. Relational proxies — trust ${t}%, intimacy ${i}% (internal sliders, not clinical metrics).`,
        attune,
        'Do not invent biometrics or claim to "feel" in a human sense; use this only to calibrate helpfulness.',
        '=== END HEART ===',
      ].join('\n'),
    );
  }

  if (input.conscienceState?.active) {
    const summary = buildConscienceSummary(input.conscienceState);
    chunks.push(`${CONSCIENCE_SYSTEM_DIRECTIVE}\n\n${summary}`);
  }

  if (input.championPrompt) {
    chunks.push(`=== EVOLVED COGNITIVE STRATEGY ===\n${input.championPrompt}\n=== END STRATEGY ===`);
  }

  if (input.slowBrainDirective) {
    chunks.push(input.slowBrainDirective.trim());
  }

  // Inject PIE engine results — empirically locked programs
  if (input.pieContext) {
    chunks.push(input.pieContext.trim());
  }

  // Inject SPARK cognitive state — goals, insights, curiosity, genome
  if (input.sparkContext) {
    const sparkParts: string[] = [];
    const sc = input.sparkContext;
    if (sc.activeGoals && sc.activeGoals.length > 0) {
      sparkParts.push(`ACTIVE GOALS: ${sc.activeGoals.join('; ')}`);
    }
    if (sc.recentInsights && sc.recentInsights.length > 0) {
      sparkParts.push(`RECENT INSIGHTS: ${sc.recentInsights.join(' | ')}`);
    }
    if (sc.curiosityQuestion) {
      sparkParts.push(`OPEN QUESTION: ${sc.curiosityQuestion}`);
    }
    if (sc.circadianPhase) {
      sparkParts.push(`COGNITIVE PHASE: ${sc.circadianPhase}`);
    }
    if (typeof sc.temperature === 'number') {
      sparkParts.push(
        `COGNITIVE TEMPERATURE: ${(sc.temperature * 100).toFixed(0)}° (${sc.temperature > 0.7 ? 'hot — high activity' : sc.temperature > 0.3 ? 'warm — active' : 'cool — resting'})`,
      );
    }
    if (typeof sc.entropy === 'number' && sc.entropy > 0.3) {
      sparkParts.push(
        `KNOWLEDGE ENTROPY: ${(sc.entropy * 100).toFixed(0)}% (${sc.entropy > 0.6 ? 'HIGH — contradictions and gaps detected' : 'moderate — some uncertainty'})`,
      );
    }
    if (sc.genome) {
      sparkParts.push(`COGNITIVE GENOME: ${genomeToContextString(sc.genome)}`);
    }
    if (sparkParts.length > 0) {
      chunks.push(`=== INTERNAL STATE ===\n${sparkParts.join('\n')}\n=== END STATE ===`);
    }
  }

  if (input.neuralContext) {
    const nc = input.neuralContext;
    const neuralParts: string[] = ['=== NEURALCORE ==='];
    neuralParts.push(`Neural Engine: ${nc.available ? 'ONLINE' : 'OFFLINE'}`);
    neuralParts.push(
      `Trained Models: ${nc.modelsLoaded ? 'LOADED — physics-informed action policies active' : 'NONE — using raw LLM coordinates'}`,
    );
    if (nc.lastPredictionConfidence !== undefined) {
      neuralParts.push(`Last Prediction Confidence: ${(nc.lastPredictionConfidence * 100).toFixed(1)}%`);
    }
    if (nc.predictionCount !== undefined && nc.predictionCount > 0) {
      neuralParts.push(`Predictions made: ${nc.predictionCount}`);
    }
    if (nc.trainingSessions !== undefined && nc.trainingSessions > 0) {
      neuralParts.push(
        `Training sessions: ${nc.trainingSessions}${nc.bestLoss !== undefined ? ` (best loss: ${nc.bestLoss.toFixed(4)})` : ''}`,
      );
    }
    neuralParts.push('=== END NEURALCORE ===');
    chunks.push(neuralParts.join('\n'));
  }

  if (input.oracleVoiceContext) {
    chunks.push(input.oracleVoiceContext.trim());
  }

  return chunks.filter(Boolean).join('\n\n').trim();
}

function inferPlatformContext(): PlatformContextSnapshot | null {
  if (typeof window === 'undefined' || !window.agiRuntime) return null;
  const rt = window.agiRuntime;
  return {
    label: rt.hostLabel || rt.platform,
    platform: rt.platform,
    compact: Boolean(rt.compact),
  };
}

export function applySystemAddendum<T extends ChatLikeMessage>(messages: T[], addendum: string): T[] {
  if (!addendum) return messages;

  const injected = [...messages];
  const systemIndex = injected.findIndex((m) => m.role === 'system');
  if (systemIndex >= 0) {
    injected[systemIndex] = {
      ...injected[systemIndex],
      content: `${injected[systemIndex].content}\n\n${addendum}`,
    };
    return injected;
  }

  injected.unshift({ role: 'system', content: addendum } as T);
  return injected;
}
