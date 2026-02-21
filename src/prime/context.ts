// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Shared Context Pack
//  One consistent way to inject state into LLM system messages.
// ═══════════════════════════════════════════════════════════════

import type { ConscienceState, CognitiveGenome } from '../types';
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

export interface SystemAddendumInput {
  ragContext?: string;
  conscienceState?: ConscienceState | null;
  championPrompt?: string | null;
  slowBrainDirective?: string;
  sparkContext?: SparkContextSnapshot | null;
  pieContext?: string;
  neuralContext?: NeuralContextSnapshot | null;
}

export function buildSystemAddendum(input: SystemAddendumInput): string {
  const chunks: string[] = [];

  // Runtime directive: this app is stateful and *does* persist context.
  // Avoid the generic "I have no memory between sessions" disclaimer unless the data is truly missing.
  chunks.push(
    [
      '=== RUNTIME DIRECTIVE ===',
      '- You run inside AGI PRIME (a persistent desktop app). Conversation logs and memory context may be provided.',
      '- If asked about past interactions: use the current chat + provided memory context; if missing, ask rather than inventing.',
      '- Do not claim you are "stateless" or "cannot remember between sessions" as a blanket statement.',
      '=== END DIRECTIVE ===',
    ].join('\n'),
  );

  if (input.ragContext) {
    chunks.push(input.ragContext.trim());
  }

  if (input.conscienceState?.active) {
    const summary = buildConscienceSummary(input.conscienceState);
    chunks.push(`${CONSCIENCE_SYSTEM_DIRECTIVE}\n\n${summary}`);
  }

  if (input.championPrompt) {
    chunks.push(
      `=== EVOLVED COGNITIVE STRATEGY ===\n${input.championPrompt}\n=== END STRATEGY ===`,
    );
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
      sparkParts.push(`COGNITIVE TEMPERATURE: ${(sc.temperature * 100).toFixed(0)}° (${sc.temperature > 0.7 ? 'hot — high activity' : sc.temperature > 0.3 ? 'warm — active' : 'cool — resting'})`);
    }
    if (typeof sc.entropy === 'number' && sc.entropy > 0.3) {
      sparkParts.push(`KNOWLEDGE ENTROPY: ${(sc.entropy * 100).toFixed(0)}% (${sc.entropy > 0.6 ? 'HIGH — contradictions and gaps detected' : 'moderate — some uncertainty'})`);
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
    neuralParts.push(`Trained Models: ${nc.modelsLoaded ? 'LOADED — physics-informed action policies active' : 'NONE — using raw LLM coordinates'}`);
    if (nc.lastPredictionConfidence !== undefined) {
      neuralParts.push(`Last Prediction Confidence: ${(nc.lastPredictionConfidence * 100).toFixed(1)}%`);
    }
    if (nc.predictionCount !== undefined && nc.predictionCount > 0) {
      neuralParts.push(`Predictions made: ${nc.predictionCount}`);
    }
    if (nc.trainingSessions !== undefined && nc.trainingSessions > 0) {
      neuralParts.push(`Training sessions: ${nc.trainingSessions}${nc.bestLoss !== undefined ? ` (best loss: ${nc.bestLoss.toFixed(4)})` : ''}`);
    }
    neuralParts.push('=== END NEURALCORE ===');
    chunks.push(neuralParts.join('\n'));
  }

  return chunks.filter(Boolean).join('\n\n').trim();
}

export function applySystemAddendum<T extends ChatLikeMessage>(
  messages: T[],
  addendum: string,
): T[] {
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

