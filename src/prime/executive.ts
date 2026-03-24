// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Executive Router
//  The "one mind" coordinator: decide which subsystem should run.
//  Start rule-based (deterministic), later can be upgraded to LLM.
// ═══════════════════════════════════════════════════════════════

export type ExecutiveMode = 'talk' | 'arena' | 'act' | 'improve';

export interface ExecutiveDecision {
  mode: ExecutiveMode;
  confidence: number; // 0..1
  reason: string;
  // Optional structured payloads (kept minimal for v1).
  taskDraft?: {
    goal: string;
    verificationHint?: string;
  };
  memoryQuery?: string;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function looksLikeExplicitCommand(text: string): boolean {
  return /^\/(do|act|hands|arena|mind|forge|evolve|improve)\b/i.test(text.trim());
}

function isLikelyImperative(text: string): boolean {
  const t = text.trim().toLowerCase();
  // Not perfect, but catches "do X", "open X", "find X", etc.
  return /^(do|open|close|search|find|rename|move|copy|paste|create|make|draft|email|research|summarize|clean|organize|download|install|run|execute|delete|remove|update|fix|refactor|build)\b/.test(
    t,
  );
}

function isLikelyArenaRequest(text: string): boolean {
  const t = text.toLowerCase();
  if (/^\/(arena|mind)\b/i.test(text.trim())) return true;
  // Require strong arena-specific intent, not casual word overlap.
  // "debate" and "argue" are strong signals; "architecture" and "blueprint"
  // only count when combined with a requesting verb (design, plan, build).
  if (/\b(arena|debate|argue|two sides|pros and cons)\b/i.test(t)) return true;
  if (/\b(design|plan|build|create|draft)\b.*\b(architecture|blueprint)\b/i.test(t)) return true;
  if (/\b(architecture|blueprint)\b.*\b(design|plan|build|create|draft)\b/i.test(t)) return true;
  return false;
}

function isLikelyImproveRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  // Only match when the user is explicitly invoking forge/improve, not
  // casually mentioning "upgrade" or "improvement" in conversation.
  if (/^(forge|evolve|improve)\s*[:-]/i.test(t)) return true;
  if (/\b(forge|self[-\s]?improve)\b/i.test(t)) return true;
  // "evolve" only when it looks like a command, not conversational
  if (/^evolve\b/i.test(t)) return true;
  return false;
}

export function executiveRoute(params: {
  input: string;
  recentTurns?: Array<{ role: string; content: string }>;
}): ExecutiveDecision {
  const input = (params.input || '').trim();
  const recentTurns = params.recentTurns || [];

  if (!input) {
    return { mode: 'talk', confidence: 0.2, reason: 'Empty input' };
  }

  // Explicit commands win.
  if (/^\/(arena|mind)\b/i.test(input)) {
    return { mode: 'arena', confidence: 0.95, reason: 'Explicit /arena command', memoryQuery: input };
  }
  if (/^\/(forge|evolve|improve)\b/i.test(input)) {
    return { mode: 'improve', confidence: 0.95, reason: 'Explicit improve command', memoryQuery: input };
  }
  if (/^\/(do|act|hands)\b/i.test(input)) {
    const goal = input.replace(/^\/(do|act|hands)\b\s*/i, '').trim() || 'Execute the requested task.';
    return {
      mode: 'act',
      confidence: 0.95,
      reason: 'Explicit /do command',
      taskDraft: { goal, verificationHint: 'Verify outcome and summarize actions taken.' },
      memoryQuery: goal,
    };
  }

  // Heuristic routing.
  if (isLikelyImproveRequest(input)) {
    return { mode: 'improve', confidence: 0.7, reason: 'Improve/evolution keywords detected', memoryQuery: input };
  }
  if (isLikelyArenaRequest(input)) {
    return { mode: 'arena', confidence: 0.7, reason: 'Arena/debate keywords detected', memoryQuery: input };
  }

  // If the last assistant message asked "What should I do?", bias toward action.
  const lastAssistant = [...recentTurns].reverse().find((t) => t.role === 'assistant')?.content || '';
  const actionFollowup = /\b(should i do|want me to do|do you want me to)\b/i.test(lastAssistant);

  const imperative = isLikelyImperative(input);
  const commandy = looksLikeExplicitCommand(input);
  const actionScore = clamp01((imperative ? 0.55 : 0) + (actionFollowup ? 0.25 : 0) + (commandy ? 0.15 : 0));

  if (actionScore >= 0.65) {
    return {
      mode: 'act',
      confidence: actionScore,
      reason: 'Imperative intent detected; route to Hands',
      taskDraft: { goal: input, verificationHint: 'Verify outcome and provide a post-run report.' },
      memoryQuery: input,
    };
  }

  return { mode: 'talk', confidence: 0.55, reason: 'Default conversational route', memoryQuery: input };
}
