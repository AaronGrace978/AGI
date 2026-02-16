// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Shared Context Pack
//  One consistent way to inject state into LLM system messages.
// ═══════════════════════════════════════════════════════════════

import type { ConscienceState } from '../types';
import { buildConscienceSummary, CONSCIENCE_SYSTEM_DIRECTIVE } from './conscience';

export type ChatLikeMessage = { role: string; content: string };

export interface SystemAddendumInput {
  ragContext?: string;
  conscienceState?: ConscienceState | null;
  championPrompt?: string | null;
  slowBrainDirective?: string;
}

export function buildSystemAddendum(input: SystemAddendumInput): string {
  const chunks: string[] = [];

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

