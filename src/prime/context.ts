// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Shared Context Pack
//  One consistent way to inject state into LLM system messages.
// ═══════════════════════════════════════════════════════════════

import type { ConscienceState } from '../types';
import { buildConscienceSummary, CONSCIENCE_SYSTEM_DIRECTIVE } from './conscience';

export type ChatLikeMessage = { role: string; content: string };

export interface SparkContextSnapshot {
  activeGoals?: string[];
  recentInsights?: string[];
  circadianPhase?: string;
  curiosityQuestion?: string;
}

export interface SystemAddendumInput {
  ragContext?: string;
  conscienceState?: ConscienceState | null;
  championPrompt?: string | null;
  slowBrainDirective?: string;
  sparkContext?: SparkContextSnapshot | null;
  pieContext?: string;
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

  // Inject SPARK cognitive state — goals, insights, curiosity
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
    if (sparkParts.length > 0) {
      chunks.push(`=== INTERNAL STATE ===\n${sparkParts.join('\n')}\n=== END STATE ===`);
    }
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

