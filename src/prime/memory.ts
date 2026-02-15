// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Semantic Memory System
//  Real memory. Real learning. Real recall.
//  Vector embeddings + cosine similarity + RAG pipeline.
//  No more keyword matching. The mind remembers by meaning.
// ═══════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────

export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'reflective' | 'autobiographical';

export interface VectorMemory {
  id: string;
  content: string;
  type: MemoryType;
  timestamp: number;
  importance: number;       // 0-1
  source: string;           // module that created this (nexus, hands, forge, nightmind)
  emotion?: string;
  tags: string[];
  // Hierarchical memory enhancements
  accessCount?: number;     // How many times this memory has been retrieved
  lastAccessed?: number;    // Timestamp of last retrieval
  decayRate?: number;       // How fast this memory fades (0=permanent, 1=fast decay)
  associations?: string[];  // IDs of related memories
  layer?: 'working' | 'short-term' | 'long-term' | 'core';  // Memory hierarchy layer
}

export interface MemorySearchResult {
  memory: VectorMemory;
  similarity: number;
}

export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  byLayer?: Record<string, number>;
}

// ─── Memory Hierarchy Constants ─────────────────────────────────

/** Working memory: lasts ~minutes, very fast access */
const WORKING_MEMORY_TTL = 30 * 60 * 1000; // 30 minutes
/** Short-term memory: lasts ~hours, moderate decay */
const SHORT_TERM_TTL = 24 * 60 * 60 * 1000; // 24 hours
/** Long-term: permanent but can decay in importance */

/**
 * Calculate the effective importance of a memory using a forgetting curve.
 * Based on Ebbinghaus forgetting curve: retention = e^(-t/S) where S = strength.
 * Strength increases with importance, access count, and emotional weight.
 */
export function calculateEffectiveImportance(memory: VectorMemory): number {
  const age = Date.now() - memory.timestamp;
  const ageHours = age / (1000 * 60 * 60);

  // Base strength from importance and access count
  const accessBonus = Math.min(0.3, (memory.accessCount || 0) * 0.05);
  const emotionBonus = memory.emotion ? 0.1 : 0;
  const strength = memory.importance + accessBonus + emotionBonus;

  // Decay rate: higher importance memories decay slower
  const decay = memory.decayRate ?? (1 - memory.importance) * 0.1;

  // Forgetting curve: retention decreases exponentially
  const retention = Math.exp(-decay * ageHours / (strength * 100 + 1));

  return Math.max(0.01, memory.importance * retention);
}

/**
 * Determine which hierarchy layer a memory belongs to.
 */
export function determineMemoryLayer(memory: VectorMemory): 'working' | 'short-term' | 'long-term' | 'core' {
  const age = Date.now() - memory.timestamp;

  // Core memories: high importance, frequently accessed, or autobiographical
  if (memory.type === 'autobiographical' || memory.importance >= 0.9) return 'core';
  if ((memory.accessCount || 0) >= 10 && memory.importance >= 0.7) return 'core';

  // Working memory: very recent
  if (age < WORKING_MEMORY_TTL) return 'working';

  // Short-term: recent
  if (age < SHORT_TERM_TTL) return 'short-term';

  // Long-term: everything else
  return 'long-term';
}

/**
 * Find potential associations between a new memory and existing ones.
 * Returns IDs of related memories based on tag overlap and content similarity.
 */
export function findAssociations(
  newMemory: { content: string; tags: string[] },
  existingMemories: VectorMemory[],
  maxAssociations: number = 5,
): string[] {
  const candidates: Array<{ id: string; score: number }> = [];

  for (const mem of existingMemories) {
    // Tag overlap scoring
    const tagOverlap = newMemory.tags.filter(t => mem.tags.includes(t)).length;
    const tagScore = tagOverlap / Math.max(1, Math.max(newMemory.tags.length, mem.tags.length));

    // Simple content word overlap
    const newWords = new Set(newMemory.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const memWords = new Set(mem.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    let overlap = 0;
    for (const w of newWords) { if (memWords.has(w)) overlap++; }
    const wordScore = overlap / Math.max(1, Math.max(newWords.size, memWords.size));

    const totalScore = tagScore * 0.4 + wordScore * 0.6;
    if (totalScore > 0.1) {
      candidates.push({ id: mem.id, score: totalScore });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxAssociations)
    .map(c => c.id);
}

// ─── RAG Context Builder ───────────────────────────────────────
// Takes retrieved memories and formats them for LLM context injection

export function buildRAGContext(memories: MemorySearchResult[], maxChars: number = 6000): string {
  if (memories.length === 0) return '';

  const lines: string[] = [
    '=== RECALLED MEMORIES (retrieved by semantic similarity) ===',
  ];

  let charCount = 0;

  for (const { memory, similarity } of memories) {
    const entry = formatMemoryEntry(memory, similarity);
    if (charCount + entry.length > maxChars) break;
    lines.push(entry);
    charCount += entry.length;
  }

  lines.push('=== END RECALLED MEMORIES ===');
  return lines.join('\n');
}

function formatMemoryEntry(mem: VectorMemory, similarity: number): string {
  const age = getTimeAgo(mem.timestamp);
  const sim = (similarity * 100).toFixed(0);
  const typeLabel = mem.type.toUpperCase();
  const emotionTag = mem.emotion ? ` [${mem.emotion}]` : '';
  return `[${typeLabel} | ${age}${emotionTag} | relevance: ${sim}%] ${mem.content}`;
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Memory Client (calls IPC to main process) ────────────────
// These functions are the renderer-side API for the semantic memory system.
// All actual embedding + storage happens in the Electron main process.

export async function storeMemory(
  content: string,
  type: MemoryType,
  metadata: {
    source: string;
    importance?: number;
    emotion?: string;
    tags?: string[];
  },
): Promise<void> {
  if (!window.api?.memory?.storeVector) return;
  try {
    await window.api.memory.storeVector({
      content,
      type,
      source: metadata.source,
      importance: metadata.importance ?? 0.5,
      emotion: metadata.emotion,
      tags: metadata.tags ?? [],
    });
  } catch (e) {
    console.warn('[Memory] Failed to store:', e);
  }
}

export async function searchMemories(
  query: string,
  topK: number = 5,
  typeFilter?: MemoryType,
): Promise<MemorySearchResult[]> {
  if (!window.api?.memory?.searchVector) return [];
  try {
    const results = await window.api.memory.searchVector(query, topK, typeFilter);
    if (!results) return [];
    // Cast the IPC results to our typed interface
    return results.map((r) => ({
      memory: {
        ...r.memory,
        type: r.memory.type as MemoryType,
      },
      similarity: r.similarity,
    }));
  } catch {
    return [];
  }
}

export async function getMemoryStats(): Promise<MemoryStats> {
  if (!window.api?.memory?.vectorStats) {
    return { total: 0, byType: { episodic: 0, semantic: 0, procedural: 0, reflective: 0, autobiographical: 0 } };
  }
  try {
    return await window.api.memory.vectorStats();
  } catch {
    return { total: 0, byType: { episodic: 0, semantic: 0, procedural: 0, reflective: 0, autobiographical: 0 } };
  }
}

// ─── RAG-Enhanced Message Injection ────────────────────────────
// Retrieves relevant memories and injects them into the LLM context

export async function injectRAGContext(
  messages: Array<{ role: string; content: string }>,
  query: string,
): Promise<Array<{ role: string; content: string }>> {
  const memories = await searchMemories(query, 5);
  if (memories.length === 0) return messages;

  const ragContext = buildRAGContext(memories);
  if (!ragContext) return messages;

  // Inject retrieved memories into the system message
  const injected = [...messages];
  const systemIndex = injected.findIndex((m) => m.role === 'system');

  if (systemIndex >= 0) {
    injected[systemIndex] = {
      ...injected[systemIndex],
      content: `${injected[systemIndex].content}\n\n${ragContext}`,
    };
  } else {
    injected.unshift({ role: 'system', content: ragContext });
  }

  return injected;
}

// ─── Experience Storage Helpers ────────────────────────────────
// Convenience functions for storing specific types of experience

export async function storeConversationMemory(
  userMessage: string,
  assistantResponse: string,
  emotion?: string,
): Promise<void> {
  const summary = `User asked: "${userMessage.slice(0, 150)}..." — Responded about: ${assistantResponse.slice(0, 200)}...`;
  await storeMemory(summary, 'episodic', {
    source: 'nexus',
    importance: 0.4,
    emotion,
    tags: ['conversation'],
  });
}

export async function storeTaskExperience(
  goal: string,
  success: boolean,
  stepsUsed: string[],
  lessonLearned?: string,
): Promise<void> {
  const outcome = success ? 'SUCCESS' : 'FAILURE';
  const steps = stepsUsed.slice(0, 5).join(', ');
  const lesson = lessonLearned ? ` Lesson: ${lessonLearned}` : '';
  const content = `Task "${goal.slice(0, 100)}" — ${outcome}. Steps: ${steps}.${lesson}`;
  await storeMemory(content, 'procedural', {
    source: 'hands',
    importance: success ? 0.6 : 0.8, // failures are more important to remember
    tags: ['task', outcome.toLowerCase()],
  });
}

export async function storeInsight(
  insight: string,
  source: string = 'nightmind',
): Promise<void> {
  await storeMemory(insight, 'reflective', {
    source,
    importance: 0.7,
    tags: ['insight', 'reflection'],
  });
}

export async function storeSkill(
  skillDescription: string,
  domain: string,
): Promise<void> {
  await storeMemory(skillDescription, 'semantic', {
    source: 'nightmind',
    importance: 0.8,
    tags: ['skill', domain],
  });
}

/**
 * Store an autobiographical memory — core identity-level memories
 * that define who AGI PRIME is and what it has experienced.
 * These have the highest retention and never decay.
 */
export async function storeAutobiographicalMemory(
  content: string,
  source: string = 'self',
): Promise<void> {
  await storeMemory(content, 'autobiographical', {
    source,
    importance: 0.95,
    tags: ['identity', 'autobiographical', 'core'],
  });
}

/**
 * Store a strategy learned from completing a task.
 * These become reusable plan templates for similar future goals.
 */
export async function storeStrategy(
  goal: string,
  steps: string[],
  outcome: 'success' | 'failure',
  lessonLearned: string,
): Promise<void> {
  const stepsText = steps.slice(0, 8).map((s, i) => `${i + 1}. ${s}`).join('; ');
  const content = `Strategy for "${goal.slice(0, 80)}": ${stepsText}. Outcome: ${outcome}. Lesson: ${lessonLearned}`;
  await storeMemory(content, 'procedural', {
    source: 'cognitive-loop',
    importance: outcome === 'success' ? 0.75 : 0.85,
    tags: ['strategy', outcome, ...goal.toLowerCase().split(/\s+/).slice(0, 5)],
  });
}
