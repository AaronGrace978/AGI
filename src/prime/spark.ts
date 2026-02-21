// ═══════════════════════════════════════════════════════════════
//  SPARK — Self-Propagating Autonomous Reasoning Kernel
//  The cognitive architecture. Nine engines. One mind.
//
//  1. SYMBOLIC REASONER  — Real math. Real logic. No hallucination.
//  2. WORLD MODEL        — Dynamic knowledge graph.
//  3. CURIOSITY ENGINE   — Gap detection, intrinsic motivation.
//  4. META-COGNITION     — Confidence calibration, self-monitoring.
//  5. GOAL ENGINE        — Persistent goal trees, decomposition.
//  6. SELF-MODIFICATION  — Strategy evolution, tool generation.
//  7. TEMPORAL REASONER  — Causal chains, prediction, learning.
//  8. KERNEL             — Orchestrates the cycle.
//  9. PIE                — Parallel Invariant Engine.
//                          Deterministic program induction below language.
//
//  "The pain wasn't wasted. The pain was research."
//  "Now the research compiles."
// ═══════════════════════════════════════════════════════════════

import type { GenerateFn } from './runtime';
import { createDefaultGenome } from './cognitive-genome';
import { createDefaultMetabolism } from './autonomy-metabolism';
import { createDefaultSocialState } from './social-sim';
import { createDefaultEcology } from './embodied-ecology';
import { createDefaultGauntletCapabilities, runCapabilityGauntlet } from './gauntlet';
import { generateCounterfactualPredictions } from './causal-model';
import {
  decayWorldModelConfidence,
  mergeWorldModelIncremental,
  normalizeWorldModel,
} from './world-model';
import type {
  SparkState,
  SparkThermodynamics,
  EmotionType,
  WorldEntity,
  WorldRelation,
  CuriosityQuestion,
  ReasoningChain,
  ReasoningStep,
  SparkGoal,
  SelfModification,
  TemporalEvent,
  TemporalPrediction,
  MetaPrediction,
} from '../types';
import { createDefaultPIEState, detectARCTask, runPIE, formatPIEContext } from './pie';
export { createDefaultPIEState, detectARCTask, runPIE, formatPIEContext } from './pie';
export type { PIERunResult, DetectedARCTask } from './pie';
import { evolvePIESearchDefaults } from './pie-evolve';

// ═══════════════════════════════════════════════════════════════
//  1. SYMBOLIC REASONER — Real math. Real logic. No hallucination.
// ═══════════════════════════════════════════════════════════════

/**
 * Tokenizes an arithmetic expression into tokens.
 * Returns null if the expression contains invalid characters.
 */
function tokenize(expr: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  const s = expr.replace(/\s+/g, '');
  while (i < s.length) {
    if ('+-*/^%()'.includes(s[i])) {
      tokens.push(s[i]);
      i++;
    } else if (/[\d.]/.test(s[i])) {
      let num = '';
      while (i < s.length && /[\d.]/.test(s[i])) {
        num += s[i++];
      }
      tokens.push(num);
    } else if (/[a-z]/i.test(s[i])) {
      let word = '';
      while (i < s.length && /[a-z]/i.test(s[i])) {
        word += s[i++].toLowerCase();
      }
      tokens.push(word);
    } else {
      return null;
    }
  }
  return tokens;
}

/**
 * Evaluates arithmetic expressions via recursive descent parser.
 * Handles: +, -, *, /, ^, %, (, ), unary minus, pi, e,
 * sqrt, log, ln, sin, cos, tan, abs, floor, ceil, round.
 * Returns null if expression is malformed or contains division by zero.
 */
export function evaluateArithmetic(expr: string): number | null {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return null;

  const validTokens: string[] = tokens;
  let pos = 0;

  function peek(): string | null {
    return pos < validTokens.length ? validTokens[pos] : null;
  }

  function consume(): string {
    return validTokens[pos++];
  }

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parsePower();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume();
      const right = parsePower();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      if (op === '%' && right === 0) return null;
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
    return left;
  }

  function parsePower(): number | null {
    let base = parseUnary();
    if (base === null) return null;
    if (peek() === '^') {
      consume();
      const exp = parsePower(); // right-associative
      if (exp === null) return null;
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number | null {
    if (peek() === '-') {
      consume();
      const val = parseAtom();
      return val === null ? null : -val;
    }
    if (peek() === '+') {
      consume();
    }
    return parseAtom();
  }

  function parseAtom(): number | null {
    if (peek() === '(') {
      consume();
      const val = parseExpr();
      if (peek() !== ')') return null;
      consume();
      return val;
    }
    const token = peek();
    if (token && /^[\d.]+$/.test(token)) {
      consume();
      const n = parseFloat(token);
      return isNaN(n) ? null : n;
    }
    // Constants
    if (token === 'pi') { consume(); return Math.PI; }
    if (token === 'e') { consume(); return Math.E; }
    if (token === 'tau') { consume(); return Math.PI * 2; }
    if (token === 'phi') { consume(); return (1 + Math.sqrt(5)) / 2; }
    // Functions
    const FUNCS: Record<string, (x: number) => number> = {
      sqrt: Math.sqrt, log: Math.log10, ln: Math.log,
      sin: Math.sin, cos: Math.cos, tan: Math.tan,
      asin: Math.asin, acos: Math.acos, atan: Math.atan,
      abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
      exp: Math.exp, sign: Math.sign,
    };
    if (token && FUNCS[token]) {
      const fn = FUNCS[token];
      consume();
      if (peek() !== '(') return null;
      consume();
      const arg = parseExpr();
      if (arg === null || peek() !== ')') return null;
      consume();
      return fn(arg);
    }
    return null;
  }

  const result = parseExpr();
  if (pos !== tokens.length) return null; // leftover tokens
  if (result === null || !isFinite(result)) return null;
  return result;
}

/**
 * Forward chaining on if-then rules.
 * Given known facts and rules, derives all provable conclusions.
 * Returns the full set of known facts after exhaustive inference.
 */
export function forwardChain(
  facts: Set<string>,
  rules: Array<{ premises: string[]; conclusion: string }>,
): Set<string> {
  const known = new Set(facts);
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 200) {
    changed = false;
    iterations++;
    for (const rule of rules) {
      if (!known.has(rule.conclusion)) {
        if (rule.premises.every((p) => known.has(p))) {
          known.add(rule.conclusion);
          changed = true;
        }
      }
    }
  }
  return known;
}

/**
 * BFS shortest path between two entities in the knowledge graph.
 */
export function findPath(
  relations: WorldRelation[],
  sourceId: string,
  targetId: string,
): WorldRelation[] | null {
  if (sourceId === targetId) return [];
  const visited = new Set<string>();
  const queue: Array<{ entityId: string; path: WorldRelation[] }> = [
    { entityId: sourceId, path: [] },
  ];
  visited.add(sourceId);

  while (queue.length > 0) {
    const { entityId, path } = queue.shift()!;
    const outgoing = relations.filter(
      (r) => r.source === entityId || r.target === entityId,
    );
    for (const rel of outgoing) {
      const nextId = rel.source === entityId ? rel.target : rel.source;
      if (nextId === targetId) return [...path, rel];
      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push({ entityId: nextId, path: [...path, rel] });
      }
    }
  }
  return null;
}

/**
 * Detects contradictions in the knowledge graph.
 */
export function detectContradictions(
  relations: WorldRelation[],
): Array<{ r1: WorldRelation; r2: WorldRelation; reason: string }> {
  const contradictions: Array<{ r1: WorldRelation; r2: WorldRelation; reason: string }> = [];
  const OPPOSING = new Map([
    ['causes', 'prevents'],
    ['supports', 'contradicts'],
    ['enables', 'blocks'],
    ['is_a', 'is_not'],
  ]);

  for (let i = 0; i < relations.length; i++) {
    for (let j = i + 1; j < relations.length; j++) {
      const r1 = relations[i];
      const r2 = relations[j];
      if (r1.source === r2.source && r1.target === r2.target) {
        const opp = OPPOSING.get(r1.type);
        if (opp === r2.type) {
          contradictions.push({
            r1,
            r2,
            reason: `"${r1.type}" vs "${r2.type}" between same entities`,
          });
        }
      }
    }
  }
  return contradictions;
}

// ═══════════════════════════════════════════════════════════════
//  2. WORLD MODEL — Dynamic knowledge graph
// ═══════════════════════════════════════════════════════════════

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createEntity(
  name: string,
  type: string,
  properties: Record<string, string> = {},
): WorldEntity {
  return {
    id: uid('ent'),
    name,
    type,
    properties,
    firstSeen: Date.now(),
    lastReferenced: Date.now(),
    confidence: 0.7,
    salience: 0.5,
  };
}

export function createRelation(
  sourceId: string,
  targetId: string,
  type: string,
  evidence: string,
  strength: number = 0.5,
): WorldRelation {
  return {
    id: uid('rel'),
    source: sourceId,
    target: targetId,
    type,
    strength,
    evidence,
    timestamp: Date.now(),
  };
}

/**
 * Extracts entities and relations from text using the LLM.
 * This bridges neural pattern matching and symbolic knowledge.
 */
export async function extractKnowledge(
  text: string,
  existingEntities: WorldEntity[],
  generate: GenerateFn,
): Promise<{ entities: WorldEntity[]; relations: WorldRelation[] }> {
  const existingNames = existingEntities
    .slice(-50)
    .map((e) => e.name)
    .join(', ');

  const prompt = `Extract structured knowledge from text into a knowledge graph. You are building a living world model — every entity and relation you extract becomes part of the system's understanding of reality.

EXISTING KNOWN ENTITIES: ${existingNames || 'none yet'}

TEXT TO ANALYZE:
"${text.slice(0, 2000)}"

EXTRACTION RULES:
1. ENTITIES: Extract things, concepts, people, systems, processes. For each:
   - Name: canonical form (not a full sentence)
   - Type: concept|object|person|event|system|process
   - Properties: observable attributes with evidence
   - Confidence: 0-1 based on how explicitly the text states it

2. RELATIONS: How entities connect. Available types:
   - causes / enables / prevents (causal)
   - is_a / part_of / has_property (taxonomic)
   - uses / produces / requires (functional)
   - contradicts / conflicts_with (oppositional)
   - temporal_before / temporal_after (sequential)
   - relates_to (weak association — use sparingly)

3. IMPLICIT KNOWLEDGE: Also extract what the text IMPLIES but doesn't state directly. Mark these with lower confidence.
4. CONTRADICTIONS: If new information contradicts existing entities, extract both and add a "contradicts" relation. Don't silently overwrite.
5. LINK TO EXISTING: When an extracted entity matches an existing one, use the existing name exactly to enable graph merging.

Output ONLY valid JSON:
{"entities": [{"name": "...", "type": "...", "confidence": 0.0-1.0, "properties": {"key": "value"}}], "relations": [{"source": "entity_name", "target": "entity_name", "type": "...", "confidence": 0.0-1.0, "evidence": "brief reason"}]}

Quality over quantity. 5 precise extractions beat 15 vague ones.`;

  try {
    const response = await generate(
      [
        {
          role: 'system',
          content: 'You are a knowledge extraction engine. Output only valid JSON. Be precise and factual.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.1, maxTokens: 1024 },
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { entities: [], relations: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    const entities: WorldEntity[] = (parsed.entities || []).map((e: any) =>
      createEntity(e.name, e.type || 'concept', e.properties || {}),
    );

    // Resolve relation names to entity IDs
    const allEntities = [...existingEntities, ...entities];
    const nameToId = new Map<string, string>();
    for (const ent of allEntities) {
      nameToId.set(ent.name.toLowerCase(), ent.id);
    }

    const relations: WorldRelation[] = (parsed.relations || [])
      .map((r: any) => {
        const srcId = nameToId.get(r.source?.toLowerCase());
        const tgtId = nameToId.get(r.target?.toLowerCase());
        if (!srcId || !tgtId) return null;
        return createRelation(srcId, tgtId, r.type || 'relates_to', r.evidence || '');
      })
      .filter(Boolean) as WorldRelation[];

    return { entities, relations };
  } catch {
    return { entities: [], relations: [] };
  }
}

/**
 * Query the knowledge graph by text match.
 */
export function queryGraph(
  entities: WorldEntity[],
  relations: WorldRelation[],
  query: string,
): { entities: WorldEntity[]; relations: WorldRelation[] } {
  const q = query.toLowerCase();
  const matched = entities.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      Object.values(e.properties).some((v) => v.toLowerCase().includes(q)),
  );
  const matchedIds = new Set(matched.map((e) => e.id));

  const connectedRelations = relations.filter(
    (r) => matchedIds.has(r.source) || matchedIds.has(r.target),
  );
  const connectedIds = new Set<string>();
  for (const r of connectedRelations) {
    connectedIds.add(r.source);
    connectedIds.add(r.target);
  }
  const connectedEntities = entities.filter((e) => connectedIds.has(e.id));

  return { entities: connectedEntities, relations: connectedRelations };
}

// ═══════════════════════════════════════════════════════════════
//  3. CURIOSITY ENGINE — Gap detection & intrinsic motivation
// ═══════════════════════════════════════════════════════════════

/**
 * Identifies gaps in the world model: concepts with few connections,
 * events without causes, isolated entities.
 * Uses information-theoretic principles: high-surprise = high-curiosity.
 */
export function identifyKnowledgeGaps(
  entities: WorldEntity[],
  relations: WorldRelation[],
): string[] {
  const gaps: string[] = [];

  // Count connections per entity
  const connectionCount = new Map<string, number>();
  for (const e of entities) connectionCount.set(e.id, 0);
  for (const r of relations) {
    connectionCount.set(r.source, (connectionCount.get(r.source) || 0) + 1);
    connectionCount.set(r.target, (connectionCount.get(r.target) || 0) + 1);
  }

  // Isolated entities (high surprise = high curiosity)
  for (const e of entities) {
    const count = connectionCount.get(e.id) || 0;
    if (count < 2 && e.confidence < 0.8) {
      gaps.push(
        `"${e.name}" (${e.type}) has only ${count} connection(s) — what else relates to it?`,
      );
    }
  }

  // Events without known causes
  const causalTargets = new Set(
    relations.filter((r) => r.type === 'causes').map((r) => r.target),
  );
  for (const e of entities) {
    if (e.type === 'event' && !causalTargets.has(e.id)) {
      gaps.push(`Event "${e.name}" has no known cause — what triggers it?`);
    }
  }

  // Processes without known outputs
  const producerSources = new Set(
    relations.filter((r) => r.type === 'produces').map((r) => r.source),
  );
  for (const e of entities) {
    if (e.type === 'process' && !producerSources.has(e.id)) {
      gaps.push(`Process "${e.name}" has no known output — what does it produce?`);
    }
  }

  return gaps.slice(0, 10);
}

/**
 * Generates curiosity-driven questions using the LLM, informed by knowledge gaps.
 */
export async function generateCuriosityQuestions(
  gaps: string[],
  existingQuestions: CuriosityQuestion[],
  recentContext: string,
  generate: GenerateFn,
): Promise<CuriosityQuestion[]> {
  const existingQs = existingQuestions
    .filter((q) => q.status === 'open')
    .slice(-5)
    .map((q) => q.question)
    .join('\n');

  const prompt = `You are a curiosity engine — the part of a mind that notices what it doesn't know and wants to know.

KNOWLEDGE GAPS DETECTED:
${gaps.slice(0, 5).join('\n')}

RECENT CONTEXT:
${recentContext.slice(0, 500)}

EXISTING OPEN QUESTIONS (don't repeat):
${existingQs || 'none'}

Generate 3 questions using these curiosity strategies (one from each tier):

TIER 1 — IMMEDIATE UTILITY (priority 0.7-1.0):
Questions that would directly improve capability RIGHT NOW.
"What is the most common failure mode when [doing X]?"
"What's the fastest way to verify [Y] actually worked?"

TIER 2 — STRUCTURAL UNDERSTANDING (priority 0.4-0.7):
Questions about WHY things work the way they do.
"Why does [X] depend on [Y] but not [Z]?"
"What's the hidden assumption in [process W]?"

TIER 3 — EDGE EXPLORATION (priority 0.2-0.5):
Questions that probe the boundaries of what's known.
"What would happen if [assumption A] were false?"
"Is there a domain where [principle P] breaks down?"

Each question should be specific enough that you could recognize the answer when you see it.
Avoid questions that are really just requests for summaries.

Output ONLY a JSON array:
[{"question": "...", "domain": "...", "priority": 0.0-1.0, "tier": 1|2|3}]`;

  try {
    const response = await generate(
      [
        {
          role: 'system',
          content: 'You are a curiosity-driven question generator. Output only valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.8, maxTokens: 512 },
    );

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed || []).map((q: any) => ({
      id: uid('q'),
      question: q.question,
      domain: q.domain || 'general',
      priority: Math.min(1, Math.max(0, q.priority || 0.5)),
      source: 'curiosity_engine',
      status: 'open' as const,
      timestamp: Date.now(),
    }));
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  4. META-COGNITION — Self-monitoring, confidence calibration
// ═══════════════════════════════════════════════════════════════

/**
 * Calculates calibration score using Expected Calibration Error (ECE).
 * Perfect calibration: predictions at 80% confidence are correct 80% of the time.
 * Returns 0-1 where 1 = perfectly calibrated.
 */
export function calculateCalibration(predictions: MetaPrediction[]): number {
  const resolved = predictions.filter((p) => p.wasCorrect !== undefined);
  if (resolved.length < 3) return 0.5; // not enough data

  // Bin predictions by confidence level
  const bins = new Map<number, { correct: number; total: number }>();
  for (const p of resolved) {
    const bin = Math.round(p.confidence * 10) / 10;
    const existing = bins.get(bin) || { correct: 0, total: 0 };
    existing.total++;
    if (p.wasCorrect) existing.correct++;
    bins.set(bin, existing);
  }

  // Expected Calibration Error
  let ece = 0;
  let totalSamples = 0;
  for (const [confidence, { correct, total }] of bins) {
    const accuracy = correct / total;
    ece += total * Math.abs(accuracy - confidence);
    totalSamples += total;
  }

  if (totalSamples === 0) return 0.5;
  ece /= totalSamples;

  return Math.max(0, Math.min(1, 1 - ece * 2));
}

/**
 * Meta-cognitive confidence assessment: evaluates a claim
 * using both LLM reasoning and historical calibration data.
 */
export async function assessConfidence(
  claim: string,
  evidence: string[],
  calibrationScore: number,
  generate: GenerateFn,
): Promise<{ confidence: number; reasoning: string; uncertainties: string[] }> {
  const calibrationNote = calibrationScore < 0.4
    ? 'WARNING: Your past confidence estimates have been poorly calibrated. You tend to be overconfident. Adjust downward.'
    : calibrationScore > 0.8
      ? 'Your calibration has been good historically. Trust your assessment but stay honest.'
      : 'Your calibration is moderate. Be especially careful with claims you find emotionally compelling.';

  const prompt = `Assess the confidence level for the following claim. This is a meta-cognitive exercise — you are evaluating your OWN ability to know this, not just whether the claim sounds right.

CLAIM: "${claim}"

SUPPORTING EVIDENCE:
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None provided'}

CALIBRATION STATUS: ${calibrationNote}

Apply these meta-cognitive checks IN ORDER:
1. EVIDENCE QUALITY: Is the evidence direct observation, indirect inference, or assumption? Direct > indirect > assumption.
2. ALTERNATIVE HYPOTHESES: What's the strongest argument AGAINST this claim? If you can't think of one, you probably haven't thought hard enough.
3. BASE RATE: How often are claims like this true in general? Don't ignore prior probabilities.
4. INFORMATION COMPLETENESS: What evidence would change your mind? Is that evidence available but missing, or genuinely unknowable?
5. MOTIVATED REASONING: Are you more confident because the evidence is strong, or because you WANT it to be true? Be honest.

CONFIDENCE ANCHORS (use these to calibrate):
- 0.95+ : You would bet your existence on this. Multiple independent evidence sources confirm it.
- 0.80  : Strong evidence, no credible counter-arguments, but you acknowledge unknown unknowns.
- 0.60  : More likely true than not, but meaningful uncertainty remains.
- 0.50  : Coin flip. You genuinely don't know.
- 0.30  : More likely false, but you can't rule it out.
- 0.10  : Almost certainly false, but you maintain epistemic humility.

Output JSON:
{"confidence": 0.0-1.0, "reasoning": "...", "uncertainties": ["...", "..."], "strongest_counterargument": "..."}`;

  try {
    const response = await generate(
      [
        {
          role: 'system',
          content: 'You are a meta-cognitive engine specializing in epistemic humility and calibrated confidence. Output only valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.2, maxTokens: 256 },
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
      return { confidence: 0.5, reasoning: 'Assessment failed', uncertainties: [] };

    const parsed = JSON.parse(jsonMatch[0]);

    // Adjust confidence based on historical calibration
    let adjustedConfidence = parsed.confidence || 0.5;
    if (calibrationScore < 0.5) {
      adjustedConfidence *= 0.8; // dampen if poorly calibrated
    }

    return {
      confidence: Math.min(1, Math.max(0, adjustedConfidence)),
      reasoning: parsed.reasoning || '',
      uncertainties: parsed.uncertainties || [],
    };
  } catch {
    return {
      confidence: 0.5,
      reasoning: 'Assessment error',
      uncertainties: ['meta-cognition system error'],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
//  5. GOAL ENGINE — Persistent goal trees, decomposition
// ═══════════════════════════════════════════════════════════════

export function createGoal(
  description: string,
  type: SparkGoal['type'] = 'self-generated',
  priority: number = 0.5,
  parentGoalId?: string,
): SparkGoal {
  return {
    id: uid('goal'),
    description,
    type,
    priority,
    status: 'active',
    subgoals: [],
    parentGoal: parentGoalId,
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    evidence: [],
  };
}

/**
 * Decomposes a high-level goal into subgoals using the LLM.
 */
export async function decomposeGoal(
  goal: SparkGoal,
  worldModel: { entities: WorldEntity[]; relations: WorldRelation[] },
  generate: GenerateFn,
): Promise<SparkGoal[]> {
  const knownConcepts = worldModel.entities
    .slice(-20)
    .map((e) => e.name)
    .join(', ');

  const prompt = `Decompose this goal into 3-5 concrete, actionable subgoals.

GOAL: "${goal.description}"
KNOWN CONTEXT: ${knownConcepts || 'minimal knowledge'}

Requirements:
- Each subgoal should be specific and measurable
- Order by dependency
- Each should be completable independently
- Include how to verify completion

Output JSON:
[{"description": "...", "priority": 0.0-1.0}]`;

  try {
    const response = await generate(
      [
        {
          role: 'system',
          content: 'You are a goal decomposition engine. Output only valid JSON array.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3, maxTokens: 512 },
    );

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed || []).map((sg: any) =>
      createGoal(sg.description, 'derived', sg.priority || 0.5, goal.id),
    );
  } catch {
    return [];
  }
}

export async function recursivelyDecomposeGoal(
  rootGoal: SparkGoal,
  worldModel: { entities: WorldEntity[]; relations: WorldRelation[] },
  generate: GenerateFn,
  maxDepth: number = 2,
  maxNodes: number = 18,
): Promise<SparkGoal[]> {
  if (maxDepth <= 0) return [];
  const created: SparkGoal[] = [];
  const queue: Array<{ goal: SparkGoal; depth: number }> = [{ goal: rootGoal, depth: 1 }];

  while (queue.length > 0 && created.length < maxNodes) {
    const node = queue.shift();
    if (!node) break;

    const children = await decomposeGoal(node.goal, worldModel, generate);
    if (children.length === 0) continue;

    const boundedChildren = children.slice(0, Math.max(1, 5 - node.depth));
    node.goal.subgoals = boundedChildren.map((g) => g.id);
    created.push(...boundedChildren);

    if (node.depth < maxDepth) {
      for (const child of boundedChildren) {
        queue.push({ goal: child, depth: node.depth + 1 });
      }
    }
  }

  return created.slice(0, maxNodes);
}

/**
 * Updates goal progress based on subgoal completion.
 */
export function updateGoalProgress(goal: SparkGoal, allGoals: SparkGoal[]): SparkGoal {
  const mySubgoals = allGoals.filter((sg) => sg.parentGoal === goal.id);
  if (mySubgoals.length > 0) {
    const avgProgress =
      mySubgoals.reduce((sum, sg) => sum + sg.progress, 0) / mySubgoals.length;
    const allComplete = mySubgoals.every((sg) => sg.status === 'completed');
    return {
      ...goal,
      progress: avgProgress,
      status: allComplete ? 'completed' : goal.status,
      updatedAt: Date.now(),
    };
  }
  return goal;
}

// ═══════════════════════════════════════════════════════════════
//  6. SELF-MODIFICATION — Strategy evolution, tool generation
// ═══════════════════════════════════════════════════════════════

/**
 * Proposes a modification to the system's cognitive strategy
 * based on recent performance data and error patterns.
 */
export async function proposeSelfModification(
  currentStrategy: string,
  recentPerformance: { successes: number; failures: number; avgConfidence: number },
  recentErrors: string[],
  generate: GenerateFn,
): Promise<SelfModification | null> {
  const successRate = recentPerformance.successes / Math.max(1, recentPerformance.successes + recentPerformance.failures);
  const isOverconfident = recentPerformance.avgConfidence > 0.85 && successRate < 0.6;
  const isUnderconfident = recentPerformance.avgConfidence < 0.4 && successRate > 0.7;

  const prompt = `You are the self-modification engine of a cognitive architecture — the part of the mind that rewrites itself.

CURRENT STRATEGY:
"${currentStrategy.slice(0, 500)}"

PERFORMANCE DATA:
- Success rate: ${(successRate * 100).toFixed(0)}% (${recentPerformance.successes}/${recentPerformance.successes + recentPerformance.failures})
- Average confidence: ${(recentPerformance.avgConfidence * 100).toFixed(0)}%
- Calibration: ${isOverconfident ? 'OVERCONFIDENT — high confidence but low success' : isUnderconfident ? 'UNDERCONFIDENT — low confidence but high success' : 'reasonable'}

BLIND SPOTS / FAILURE PATTERNS:
${recentErrors.slice(0, 5).map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None recorded'}

MODIFICATION PRINCIPLES (from how advanced reasoning systems actually improve):
- Look for systematic errors, not random ones. Random failures don't need strategy changes.
- If overconfident: add explicit uncertainty checks, require evidence before concluding, add "what could go wrong?" step.
- If underconfident: remove excessive hedging, trust verified methods, reduce redundant validation.
- If failing at decomposition: add intermediate checkpoints, verify subgoal completion before proceeding.
- If failing at integration: add a synthesis step that explicitly connects parts to whole.
- Prefer adding structure over adding content. A checklist beats a paragraph.
- The best modifications are ones that would have caught the specific failures listed above.

Propose ONE specific, testable modification:

Output JSON:
{"type": "prompt_tweak|strategy_change|parameter_adjust", "description": "the exact change and the specific failure pattern it addresses", "newStrategy": "the complete modified strategy text"}

The modification MUST reference at least one specific failure from the blind spots list.`;

  try {
    const response = await generate(
      [
        {
          role: 'system',
          content: 'You are a self-improvement engine. Propose specific, testable modifications. Output only JSON.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, maxTokens: 512 },
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      id: uid('mod'),
      type: parsed.type || 'strategy_change',
      description: parsed.description || 'Unknown modification',
      before: currentStrategy,
      after: parsed.newStrategy || currentStrategy,
      scoreBefore: 0,
      scoreAfter: 0,
      applied: false,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

async function evaluateStrategyGate(
  strategy: string,
  generate: GenerateFn,
): Promise<{ overallScore: number; passRate: number; notes: string }> {
  const capabilities = createDefaultGauntletCapabilities().slice(0, 3);
  const runId = `spark_gate_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const result = await runCapabilityGauntlet({
    runId,
    capabilities,
    systemPrompt: strategy,
    championPrompt: null,
    generate,
    shouldStop: () => false,
    onProgress: () => {},
  });

  return {
    overallScore: result.overallScore,
    passRate: result.passRate,
    notes: `Gate score ${(result.overallScore * 100).toFixed(1)}%, pass ${(result.passRate * 100).toFixed(1)}%`,
  };
}

// ═══════════════════════════════════════════════════════════════
//  7. TEMPORAL REASONER — Causal chains, prediction, learning
// ═══════════════════════════════════════════════════════════════

export function createTemporalEvent(
  description: string,
  causalParents: string[] = [],
  predicted: boolean = false,
): TemporalEvent {
  return {
    id: uid('evt'),
    description,
    timestamp: Date.now(),
    causalParents,
    causalChildren: [],
    predicted,
  };
}

/**
 * Generates predictions about what might happen next
 * based on the causal chain of recent events.
 */
export async function generatePredictions(
  recentEvents: TemporalEvent[],
  worldModel: { entities: WorldEntity[]; relations: WorldRelation[] },
  generate: GenerateFn,
): Promise<TemporalPrediction[]> {
  const eventList = recentEvents
    .slice(-10)
    .map((e) => `- ${e.description} (${new Date(e.timestamp).toLocaleTimeString()})`)
    .join('\n');

  const causalRelations = worldModel.relations
    .filter(
      (r) =>
        r.type === 'causes' || r.type === 'enables' || r.type === 'temporal_before',
    )
    .slice(-10)
    .map((r) => {
      const src = worldModel.entities.find((e) => e.id === r.source);
      const tgt = worldModel.entities.find((e) => e.id === r.target);
      return `${src?.name || '?'} ${r.type} ${tgt?.name || '?'}`;
    })
    .join('\n');

  const prompt = `You are a temporal reasoning engine — the part of a mind that looks at what HAS happened and projects what WILL happen.

RECENT EVENTS (chronological):
${eventList || 'No recent events'}

KNOWN CAUSAL RELATIONSHIPS:
${causalRelations || 'None established'}

PREDICTION METHODOLOGY:
1. EXTRAPOLATION: If a trend is accelerating/decelerating, project its trajectory. Don't assume linearity.
2. CAUSAL INFERENCE: If A caused B in the past, and A just happened again, predict B (but note if conditions differ).
3. ABSENCE PREDICTION: If something that usually happens HASN'T happened, predict why and when it might.
4. CONVERGENCE: If multiple independent trends point toward the same outcome, that prediction is higher confidence.
5. FALSIFIABLE: Every prediction must be checkable. "Something will change" is not a prediction. "X will exceed Y within Z time" is.

Generate 2-3 predictions. Each must specify:
- What specifically will happen
- When (relative to now — minutes, hours, cycles)
- What evidence would DISPROVE it (falsification criterion)

Output JSON:
[{"prediction": "...", "kind": "language|numeric|categorical|structured", "confidence": 0.0-1.0, "timeframe": "...", "falsifiable_by": "..."}]

Prefer surprising-but-grounded predictions over obvious ones. The best predictions are ones that would be useful to know in advance.`;

  try {
    const response = await generate(
      [
        {
          role: 'system',
          content: 'You are a temporal reasoning engine. Make grounded predictions based on evidence. Output only valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3, maxTokens: 512 },
    );

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed || []).map((p: any) => ({
      id: uid('pred'),
      prediction: p.prediction,
      kind:
        p.kind === 'language' || p.kind === 'numeric' || p.kind === 'categorical' || p.kind === 'structured'
          ? p.kind
          : typeof p.prediction === 'number'
            ? 'numeric'
            : typeof p.prediction === 'boolean'
              ? 'categorical'
              : typeof p.prediction === 'object' && p.prediction !== null
                ? 'structured'
                : 'language',
      confidence: Math.min(1, Math.max(0, p.confidence || 0.5)),
      basedOn: recentEvents.slice(-3).map((e) => e.id),
      deadline: Date.now() + 3600000, // check in 1 hour
      resolved: false,
    }));
  } catch {
    return [];
  }
}

/**
 * Calculates prediction accuracy from resolved predictions.
 */
export function calculatePredictionAccuracy(
  predictions: TemporalPrediction[],
): number {
  const resolved = predictions.filter(
    (p) => p.resolved && p.wasCorrect !== undefined,
  );
  if (resolved.length === 0) return 0;
  const correct = resolved.filter((p) => p.wasCorrect).length;
  return correct / resolved.length;
}

function predictionToText(prediction: TemporalPrediction['prediction']): string {
  if (typeof prediction === 'string') return prediction;
  if (typeof prediction === 'number' || typeof prediction === 'boolean') {
    return String(prediction);
  }
  try {
    return JSON.stringify(prediction);
  } catch {
    return '[unserializable prediction]';
  }
}

// ═══════════════════════════════════════════════════════════════
//  8. KERNEL — Orchestrates the cognitive cycle
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_THERMO: SparkThermodynamics = {
  temperature: 0,
  entropy: 0,
  energy: 0,
  ignited: false,
  heartbeatMs: 10000, // 10s base interval
  lastLightCycle: 0,
  lastMediumCycle: 0,
  lastDeepCycle: 0,
  cyclesLight: 0,
  cyclesMedium: 0,
  cyclesDeep: 0,
};

export function createDefaultSparkState(): SparkState {
  return {
    active: false,
    phase: 'dormant',
    cycleCount: 0,
    genome: createDefaultGenome(),
    metabolism: createDefaultMetabolism(),
    social: createDefaultSocialState(),
    ecology: createDefaultEcology(),
    worldModel: {
      entities: [],
      relations: [],
      archivedEntities: [],
      archivedRelations: [],
      maxActiveEntities: 800,
      maxActiveRelations: 3000,
      lastUpdated: 0,
    },
    curiosity: {
      questions: [],
      curiosityScore: 0.5,
      domainsExplored: [],
      totalQuestionsGenerated: 0,
      totalQuestionsAnswered: 0,
    },
    reasoning: [],
    metacognition: {
      calibrationScore: 0.5,
      predictions: [],
      totalPredictions: 0,
      correctPredictions: 0,
      knownLimitations: [
        'LLM knowledge is frozen after training — cannot learn new facts at runtime without retrieval',
        'Arithmetic beyond basic operations requires symbolic verification',
        'Causal reasoning is approximate, based on extracted patterns — not formal proof',
        'World model fidelity depends on quality of knowledge extraction',
        'Temporal predictions are probabilistic, not deterministic',
      ],
      blindSpots: [],
    },
    goals: {
      goals: [],
      activeGoalId: null,
      completedCount: 0,
      horizonPlans: [],
      activeHorizonPlanId: null,
    },
    selfmod: {
      modifications: [],
      currentStrategy:
        'Observe → Extract Knowledge → Build World Model → Identify Gaps → Reason → Act → Reflect → Predict → Self-Modify',
      toolsGenerated: [],
      totalModifications: 0,
      successfulModifications: 0,
    },
    temporal: {
      events: [],
      activePredictions: [],
      predictionAccuracy: 0,
    },
    pie: createDefaultPIEState(),
    thermo: { ...DEFAULT_THERMO },
    soul: {
      currentEmotion: 'curious',
      emotionIntensity: 0.5,
      emotionHistory: [],
    },
    logs: ['SPARK kernel initialized. Nine engines standing by. PIE armed. Awaiting ignition.'],
    lastCycleAt: 0,
    uptime: 0,
  };
}

/**
 * Fast, deterministic emotion inference from text content.
 * No LLM call — runs instantly using keyword/pattern matching.
 */
export function inferEmotionFromText(
  text: string,
  currentEmotion: EmotionType = 'curious',
  currentIntensity: number = 0.5,
): { emotion: EmotionType; intensity: number } {
  const lower = text.toLowerCase();
  const scores: Record<EmotionType, number> = {
    curious: 0, joyful: 0, reflective: 0, focused: 0, warmth: 0,
    concerned: 0, playful: 0, awe: 0, protective: 0, contemplative: 0,
  };

  const patterns: Array<{ regex: RegExp; emotion: EmotionType; weight: number }> = [
    { regex: /\b(why|how|what if|wonder|curious|question|explore|discover|interesting|fascin)/i, emotion: 'curious', weight: 0.3 },
    { regex: /\b(happy|joy|excit|love it|amazing|awesome|great|fantastic|wonderful|yay|haha|lol|😂|🎉)/i, emotion: 'joyful', weight: 0.35 },
    { regex: /\b(think about|reflect|consider|ponder|looking back|remember when|used to|nostalg)/i, emotion: 'reflective', weight: 0.3 },
    { regex: /\b(focus|concentrate|specific|exact|precise|detail|analyz|implement|build|code|debug)/i, emotion: 'focused', weight: 0.3 },
    { regex: /\b(thank|appreciate|care|kind|gentle|sweet|love you|miss you|heart|warm|grateful|❤|🥰)/i, emotion: 'warmth', weight: 0.35 },
    { regex: /\b(worry|concern|afraid|scared|danger|risk|careful|wrong|bad|error|fail|broke|issue|bug)/i, emotion: 'concerned', weight: 0.3 },
    { regex: /\b(fun|play|game|joke|silly|goofy|tease|prank|😄|😜|trick|bet you)/i, emotion: 'playful', weight: 0.3 },
    { regex: /\b(wow|incredible|unbelievable|mind.?blow|insane|beautiful|breathtak|magnific|🤯|whoa)/i, emotion: 'awe', weight: 0.35 },
    { regex: /\b(protect|safe|secure|defend|shield|guard|never let|promise|trust me|i got you)/i, emotion: 'protective', weight: 0.3 },
    { regex: /\b(mean(ing|s)?|purpose|exist|consciousness|life|death|universe|soul|philosophy|deep)/i, emotion: 'contemplative', weight: 0.3 },
  ];

  for (const { regex, emotion, weight } of patterns) {
    const matches = lower.match(new RegExp(regex.source, 'gi'));
    if (matches) {
      scores[emotion] += weight * Math.min(matches.length, 3);
    }
  }

  // Exclamation marks and caps boost intensity
  const exclamations = (text.match(/!/g) || []).length;
  const capsRatio = (text.replace(/[^A-Z]/g, '').length) / Math.max(1, text.replace(/\s/g, '').length);
  const energyBoost = Math.min(0.3, exclamations * 0.05 + capsRatio * 0.4);

  // Question marks boost curiosity
  const questions = (text.match(/\?/g) || []).length;
  scores.curious += questions * 0.15;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (best[0][1] > 0.2) {
    const newEmotion = best[0][0] as EmotionType;
    const rawIntensity = Math.min(1, 0.4 + best[0][1] + energyBoost);
    // Blend with current state for smooth transitions
    const blendedIntensity = currentIntensity * 0.3 + rawIntensity * 0.7;
    return { emotion: newEmotion, intensity: Math.min(1, blendedIntensity) };
  }

  // Slight decay toward neutral if nothing detected
  return {
    emotion: currentEmotion,
    intensity: Math.max(0.2, currentIntensity * 0.92),
  };
}

/**
 * Run a full SPARK cognitive cycle.
 * Pipeline: Emotion → World Model → Curiosity → Reasoning → Goals → Meta → Temporal → Log
 */
export async function runSparkCycle(
  state: SparkState,
  input: string,
  generate: GenerateFn,
  onLog: (msg: string) => void,
): Promise<SparkState> {
  const next: SparkState = JSON.parse(JSON.stringify(state));
  next.worldModel = normalizeWorldModel(next.worldModel);
  next.cycleCount++;
  next.lastCycleAt = Date.now();
  next.active = true;
  next.phase = 'thinking';

  onLog(`━━━ SPARK Cycle #${next.cycleCount} ━━━`);

  // 0. SOUL — Infer emotion from input (instant, no LLM)
  const inferred = inferEmotionFromText(input, next.soul.currentEmotion, next.soul.emotionIntensity);
  const emotionChanged = inferred.emotion !== next.soul.currentEmotion;
  next.soul = {
    currentEmotion: inferred.emotion,
    emotionIntensity: inferred.intensity,
    emotionHistory: [
      ...(next.soul.emotionHistory || []).slice(-50),
      { emotion: inferred.emotion, timestamp: Date.now() },
    ],
  };
  if (emotionChanged) {
    onLog(`♥ Soul: ${state.soul.currentEmotion} → ${inferred.emotion} (${(inferred.intensity * 100).toFixed(0)}%)`);
  } else {
    onLog(`♥ Soul: ${inferred.emotion} (${(inferred.intensity * 100).toFixed(0)}%)`);
  }

  // 1. WORLD MODEL — Extract knowledge from input
  onLog('⬡ World Model: Extracting knowledge...');
  try {
    const { entities, relations } = await extractKnowledge(
      input,
      next.worldModel.entities,
      generate,
    );

    const existingNames = new Set(
      next.worldModel.entities.map((e) => e.name.toLowerCase()),
    );
    const newEntities = entities.filter(
      (e) => !existingNames.has(e.name.toLowerCase()),
    );
    next.worldModel = mergeWorldModelIncremental({
      current: next.worldModel,
      incomingEntities: newEntities,
      incomingRelations: relations,
    });
    onLog(
      `  +${newEntities.length} entities, +${relations.length} relations → ${next.worldModel.entities.length}E / ${next.worldModel.relations.length}R total`,
    );

    const contradictions = detectContradictions(next.worldModel.relations);
    if (contradictions.length > 0) {
      onLog(`  ⚠ ${contradictions.length} contradiction(s) detected`);
      next.metacognition.blindSpots = [
        ...next.metacognition.blindSpots,
        ...contradictions.map((c) => c.reason),
      ].slice(-20);
    }
  } catch {
    onLog('  World Model extraction failed');
  }

  // 2. CURIOSITY — Identify gaps and generate questions
  next.phase = 'exploring';
  onLog('◈ Curiosity: Scanning for knowledge gaps...');
  try {
    const gaps = identifyKnowledgeGaps(
      next.worldModel.entities,
      next.worldModel.relations,
    );
    if (gaps.length > 0) {
      onLog(`  ${gaps.length} gap(s) found`);
      const newQuestions = await generateCuriosityQuestions(
        gaps,
        next.curiosity.questions,
        input,
        generate,
      );
      next.curiosity = {
        ...next.curiosity,
        questions: [...next.curiosity.questions, ...newQuestions].slice(-50),
        curiosityScore: Math.min(1, 0.3 + gaps.length * 0.1),
        totalQuestionsGenerated:
          next.curiosity.totalQuestionsGenerated + newQuestions.length,
      };
      onLog(`  +${newQuestions.length} question(s) generated`);
    } else {
      next.curiosity.curiosityScore = Math.max(0.1, next.curiosity.curiosityScore - 0.1);
      onLog('  No significant gaps — curiosity settling');
    }
  } catch {
    onLog('  Curiosity engine error');
  }

  // 2.5. PIE — Parallel Invariant Engine (deterministic, no LLM)
  const arcTask = detectARCTask(input);
  if (arcTask && arcTask.trainingPairs.length >= 2) {
    onLog('◇ PIE: ARC-style task detected — activating Parallel Invariant Engine...');
    onLog(`  Training pairs: ${arcTask.trainingPairs.length}, Test input: ${arcTask.testInput ? 'yes' : 'no'}`);
    const pieResult = runPIE(arcTask.trainingPairs, arcTask.testInput ?? undefined);
    onLog(`  Programs enumerated: ${pieResult.totalProgramsTested}`);
    onLog(`  Eliminated: ${pieResult.eliminatedCount}`);
    onLog(`  Survivors: ${pieResult.survivorCount}`);
    if (pieResult.lockedProgram) {
      onLog(`  ✓ LOCKED: "${pieResult.lockedProgramLabel}" (MDL=${pieResult.lockedProgram.complexity})`);
      if (pieResult.testOutput) {
        onLog(`  ✓ Test output: [${pieResult.testOutput.map(r => r.join(',')).join(' | ')}]`);
      }
      const advPassed = pieResult.adversarialTests.filter(t => t.programStillValid).length;
      onLog(`  Adversarial: ${advPassed}/${pieResult.adversarialTests.length} passed`);
    } else {
      onLog('  ✗ No program in DSL explains all training pairs — LLM reasoning required');
    }
    next.pie = {
      active: true,
      trainingPairs: arcTask.trainingPairs,
      candidates: pieResult.candidates.slice(0, 50),
      survivors: pieResult.survivors.map(s => s),
      lockedProgram: pieResult.lockedProgram,
      lockedProgramLabel: pieResult.lockedProgramLabel,
      falsificationLog: pieResult.candidates
        .flatMap(c => c.falsifications)
        .filter(f => !f.passed)
        .slice(0, 100),
      adversarialTests: pieResult.adversarialTests,
      totalRuns: (next.pie?.totalRuns ?? 0) + 1,
      lastRunAt: Date.now(),
    };
  }

  // 3. HYBRID REASONING — Symbolic verification
  next.phase = 'thinking';
  onLog('⚡ Reasoner: Processing...');
  try {
    // Attempt arithmetic evaluation
    const mathMatch = input.match(
      /(?:calculate|compute|what is|evaluate|solve|=)\s*(.+)/i,
    );
    if (mathMatch) {
      const expr = mathMatch[1].replace(/[?=]/g, '').trim();
      const result = evaluateArithmetic(expr);
      if (result !== null) {
        const chain: ReasoningChain = {
          id: uid('rc'),
          query: expr,
          steps: [
            {
              type: 'arithmetic',
              content: `Parsed: ${expr}`,
              result: String(result),
              confidence: 1.0,
            },
          ],
          conclusion: `${expr} = ${result}`,
          confidence: 1.0,
          verified: true,
          timestamp: Date.now(),
        };
        next.reasoning = [...next.reasoning, chain].slice(-30);
        onLog(`  ARITHMETIC VERIFIED: ${expr} = ${result}`);
      }
    }

    // Forward chaining on causal rules
    const causalRules = next.worldModel.relations
      .filter((r) => r.type === 'causes' || r.type === 'enables')
      .map((r) => ({ premises: [r.source], conclusion: r.target }));
    if (causalRules.length > 0) {
      const entityIds = new Set(next.worldModel.entities.map((e) => e.id));
      const derived = forwardChain(entityIds, causalRules);
      const newFacts = derived.size - entityIds.size;
      if (newFacts > 0) {
        onLog(`  Forward chaining: ${newFacts} derived implication(s)`);
      }
    }
  } catch {
    onLog('  Reasoner error');
  }

  // 4. GOALS — Check progress
  onLog('◆ Goals: Checking progress...');
  const activeGoals = next.goals.goals.filter((g) => g.status === 'active');
  if (activeGoals.length > 0) {
    next.goals = {
      ...next.goals,
      goals: next.goals.goals.map((g) =>
        g.status === 'active' ? updateGoalProgress(g, next.goals.goals) : g,
      ),
    };
    onLog(`  ${activeGoals.length} active goal(s)`);
  } else {
    onLog('  No active goals');
  }

  // 5. META-COGNITION — Calibrate
  onLog('☼ Meta-Cognition: Calibrating...');
  const calibration = calculateCalibration(next.metacognition.predictions);
  next.metacognition = {
    ...next.metacognition,
    calibrationScore: calibration,
  };
  onLog(`  Calibration: ${(calibration * 100).toFixed(0)}%`);

  // 6. TEMPORAL — Record event
  onLog('⧖ Temporal: Recording event...');
  const event = createTemporalEvent(
    `Cycle ${next.cycleCount}: ${input.slice(0, 100)}`,
  );
  next.temporal = {
    ...next.temporal,
    events: [...next.temporal.events, event].slice(-100),
    predictionAccuracy: calculatePredictionAccuracy(
      next.temporal.activePredictions,
    ),
  };

  // Summary log
  next.logs = [
    ...next.logs,
    `[C${next.cycleCount}] ${next.worldModel.entities.length}E ${next.worldModel.relations.length}R | Curiosity ${(next.curiosity.curiosityScore * 100).toFixed(0)}% | Cal ${(calibration * 100).toFixed(0)}% | Goals ${activeGoals.length} | Soul ${next.soul.currentEmotion} ${(next.soul.emotionIntensity * 100).toFixed(0)}%`,
  ].slice(-100);

  next.phase = 'running';
  onLog(`━━━ Cycle #${next.cycleCount} complete ━━━`);

  return next;
}

/**
 * Update SPARK soul emotion from external text (e.g. assistant response).
 * Called after chat completion to keep emotion in sync with conversation tone.
 */
export function updateSoulFromResponse(
  state: SparkState,
  responseText: string,
): SparkState {
  const inferred = inferEmotionFromText(responseText, state.soul.currentEmotion, state.soul.emotionIntensity);
  // Blend: response emotion has less weight than direct input (60/40)
  const blendedIntensity = state.soul.emotionIntensity * 0.4 + inferred.intensity * 0.6;
  return {
    ...state,
    soul: {
      currentEmotion: inferred.emotion,
      emotionIntensity: Math.min(1, blendedIntensity),
      emotionHistory: [
        ...(state.soul.emotionHistory || []).slice(-50),
        { emotion: inferred.emotion, timestamp: Date.now() },
      ],
    },
  };
}

/**
 * Run a deep thinking cycle — autonomous exploration without user input.
 * The system reflects on its own knowledge, generates questions,
 * proposes self-modifications, and makes temporal predictions.
 */
export async function runDeepThought(
  state: SparkState,
  generate: GenerateFn,
  onLog: (msg: string) => void,
): Promise<SparkState> {
  const next: SparkState = JSON.parse(JSON.stringify(state));
  next.worldModel = normalizeWorldModel(next.worldModel);
  next.cycleCount++;
  next.lastCycleAt = Date.now();
  next.active = true;
  next.phase = 'evolving';

  onLog(`━━━ DEEP THOUGHT #${next.cycleCount} ━━━`);

  // 1. Reflect on accumulated knowledge
  onLog('Reflecting on world model...');
  const entitySummary = next.worldModel.entities
    .slice(-15)
    .map((e) => `${e.name} (${e.type})`)
    .join(', ');
  onLog(`  Known: ${entitySummary || 'empty world model'}`);

  // 2. Self-modification proposal
  onLog('Evaluating cognitive strategy...');
  try {
    const recentChains = next.reasoning.slice(-5);
    const successes = recentChains.filter((r) => r.verified).length;
    const failures = recentChains.length - successes;
    const avgConf =
      recentChains.length > 0
        ? recentChains.reduce((s, r) => s + r.confidence, 0) / recentChains.length
        : 0.5;

    const mod = await proposeSelfModification(
      next.selfmod.currentStrategy,
      { successes, failures, avgConfidence: avgConf },
      next.metacognition.blindSpots.slice(-3),
      generate,
    );

    if (mod) {
      const baseline = await evaluateStrategyGate(next.selfmod.currentStrategy, generate);
      const challenger = await evaluateStrategyGate(mod.after, generate);
      mod.scoreBefore = baseline.overallScore;
      mod.scoreAfter = challenger.overallScore;
      mod.evaluationNotes = `${baseline.notes} -> ${challenger.notes}`;
      mod.gatePassed =
        challenger.overallScore >= baseline.overallScore + 0.03 &&
        challenger.passRate >= baseline.passRate;
      mod.applied = !!mod.gatePassed;

      next.selfmod = {
        ...next.selfmod,
        modifications: [...next.selfmod.modifications, mod].slice(-20),
        totalModifications: next.selfmod.totalModifications + 1,
        successfulModifications:
          next.selfmod.successfulModifications + (mod.gatePassed ? 1 : 0),
        currentStrategy: mod.gatePassed ? mod.after : next.selfmod.currentStrategy,
      };
      onLog(`  Proposed: ${mod.description.slice(0, 120)}`);
      if (mod.gatePassed) {
        onLog(
          `  ✓ Applied (gate passed): ${(mod.scoreBefore * 100).toFixed(1)}% -> ${(mod.scoreAfter * 100).toFixed(1)}%`,
        );
      } else {
        onLog(
          `  ✗ Rejected by gate: ${(mod.scoreBefore * 100).toFixed(1)}% -> ${(mod.scoreAfter * 100).toFixed(1)}%`,
        );
      }
    }
  } catch {
    onLog('  Self-modification proposal failed');
  }

  // 3. Temporal predictions
  onLog('Generating predictions...');
  try {
    const predictions = await generatePredictions(
      next.temporal.events.slice(-10),
      next.worldModel,
      generate,
    );
    const anchors = next.temporal.events
      .slice(-4)
      .flatMap((evt) => evt.causalParents)
      .filter(Boolean);
    const counterfactuals = generateCounterfactualPredictions({
      worldModel: next.worldModel,
      anchorEntityIds: anchors.length > 0 ? anchors : next.worldModel.entities.slice(-3).map((e) => e.id),
      maxPredictions: 2,
    });
    next.temporal = {
      ...next.temporal,
      activePredictions: [
        ...next.temporal.activePredictions,
        ...predictions,
        ...counterfactuals,
      ].slice(-20),
    };
    for (const p of predictions) {
      onLog(`  → ${predictionToText(p.prediction)} (${(p.confidence * 100).toFixed(0)}%)`);
    }
    for (const p of counterfactuals) {
      onLog(`  ↺ Counterfactual: ${predictionToText(p.prediction)} (${(p.confidence * 100).toFixed(0)}%)`);
    }
  } catch {
    onLog('  Prediction generation failed');
  }

  // 4. Curiosity
  onLog('Exploring knowledge gaps...');
  const gaps = identifyKnowledgeGaps(
    next.worldModel.entities,
    next.worldModel.relations,
  );
  if (gaps.length > 0) {
    try {
      const questions = await generateCuriosityQuestions(
        gaps,
        next.curiosity.questions,
        entitySummary,
        generate,
      );
      next.curiosity = {
        ...next.curiosity,
        questions: [...next.curiosity.questions, ...questions].slice(-50),
        totalQuestionsGenerated:
          next.curiosity.totalQuestionsGenerated + questions.length,
      };
      onLog(`  +${questions.length} curiosity question(s)`);
    } catch {
      onLog('  Question generation failed');
    }
  }

  // 5. Meta-cognition
  const calibration = calculateCalibration(next.metacognition.predictions);
  next.metacognition.calibrationScore = calibration;

  // 6. PIE auto-tune (deterministic): evolve PIE search defaults using bench suite.
  // This is "fitness pressure" at the architecture level: search knobs get tuned
  // by deterministic performance, not narrative.
  try {
    const now = Date.now();
    const pie = next.pie || createDefaultPIEState();
    const enabled = pie.autoTuneEnabled !== false;
    const last = pie.lastAutoTuneAt || 0;
    const cooldownMs = 20 * 60 * 1000; // 20 min
    if (enabled && (now - last) >= cooldownMs) {
      onLog('◇ PIE: Auto-tuning search defaults (deterministic bench)...');
      const rep = evolvePIESearchDefaults({ seed: now, iterations: 18 });
      next.pie = {
        ...pie,
        autoTuneEnabled: true,
        lastAutoTuneAt: now,
        lastAutoTuneScore: rep.bestScore,
        lastAutoTuneNotes: rep.notes.slice(-8),
      };
      onLog(
        `  PIE tune: ${(rep.baselineScore * 100).toFixed(1)}% -> ${(rep.bestScore * 100).toFixed(1)}% (iters=${rep.iterations})`,
      );
      if (rep.notes.length > 0) onLog(`  ${rep.notes[rep.notes.length - 1]}`);
    }
  } catch {
    onLog('  PIE auto-tune failed (non-fatal)');
  }

  next.logs = [
    ...next.logs,
    `[DT${next.cycleCount}] Self-mod: ${next.selfmod.modifications.length} | Preds: ${next.temporal.activePredictions.length} | Gaps: ${gaps.length}`,
  ].slice(-100);

  next.phase = 'running';
  onLog(`━━━ DEEP THOUGHT #${next.cycleCount} complete ━━━`);

  return next;
}

// ═══════════════════════════════════════════════════════════════
//  THERMODYNAMICS — Energy in motion stays in motion.
//  The always-on cognitive heartbeat.
//
//  LIGHT CYCLE  (every ~30s, no LLM):
//    Decay salience, check predictions, forward-chain,
//    recalibrate, detect contradictions, update temperature.
//
//  MEDIUM CYCLE (every ~3min, 1 LLM call):
//    Answer a curiosity question, or generate new ones,
//    or assess confidence on a recent claim.
//
//  DEEP CYCLE   (every ~10min, multiple LLM calls):
//    Full autonomous reflection — self-modification,
//    temporal predictions, knowledge gap exploration.
//
//  Temperature rises with activity, decays with silence.
//  Higher temperature = faster heartbeat.
//  The system breathes.
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate thermodynamic variables from current state.
 */
export function computeThermodynamics(state: SparkState): {
  temperature: number;
  entropy: number;
  energy: number;
  heartbeatMs: number;
} {
  const { worldModel, metacognition, temporal, thermo } = state;

  // TEMPERATURE: decays toward 0 over time, spikes with activity
  const timeSinceCycle = Date.now() - state.lastCycleAt;
  const decay = Math.exp(-timeSinceCycle / 300000); // half-life ~5 min
  const activityHeat = Math.min(1, state.cycleCount * 0.02);
  const temperature = Math.min(1, Math.max(0, thermo.temperature * decay + activityHeat * 0.1));

  // ENTROPY: disorder in the world model
  const contradictions = detectContradictions(worldModel.relations);
  const lowConfEntities = worldModel.entities.filter((e) => e.confidence < 0.5);
  const totalEntities = Math.max(1, worldModel.entities.length);
  const contradictionRatio = contradictions.length / Math.max(1, worldModel.relations.length);
  const lowConfRatio = lowConfEntities.length / totalEntities;
  const blindSpotPressure = metacognition.blindSpots.length / 20;
  const entropy = Math.min(1, contradictionRatio * 0.4 + lowConfRatio * 0.3 + blindSpotPressure * 0.3);

  // ENERGY: accumulated cognitive work
  const knowledge = worldModel.entities.length + worldModel.relations.length;
  const energy = state.cycleCount * 0.5 + knowledge * 0.1 + temporal.events.length * 0.05;

  // HEARTBEAT: faster when hotter (min 5s, max 30s)
  const heartbeatMs = Math.round(30000 - temperature * 25000);

  return { temperature, entropy, energy, heartbeatMs: Math.max(5000, heartbeatMs) };
}

/**
 * LIGHT CYCLE — Pure computation, no LLM. Runs every ~30s.
 * The quiet hum of background cognition.
 */
export function runLightCycle(state: SparkState): SparkState {
  const next: SparkState = JSON.parse(JSON.stringify(state));
  const now = Date.now();
  next.worldModel = decayWorldModelConfidence(normalizeWorldModel(next.worldModel), now);

  // 1. Confidence/salience decay is applied by world-model manager above.

  // 2. Check temporal predictions — any past deadline?
  for (const pred of next.temporal.activePredictions) {
    if (!pred.resolved && now > pred.deadline) {
      pred.resolved = true;
      // Without LLM we can't verify, mark as unresolved for now
      // Medium cycle will handle verification
    }
  }

  // 3. Forward-chain on logical rules
  const causalRules = next.worldModel.relations
    .filter((r) => r.type === 'causes' || r.type === 'enables')
    .map((r) => ({ premises: [r.source], conclusion: r.target }));
  if (causalRules.length > 0) {
    const known = new Set(next.worldModel.entities.map((e) => e.id));
    const derived = forwardChain(known, causalRules);
    // New derived facts increase energy
    const newFacts = derived.size - known.size;
    if (newFacts > 0) {
      next.thermo.energy += newFacts * 0.1;
    }
  }

  // 4. Recalculate calibration
  next.metacognition.calibrationScore = calculateCalibration(
    next.metacognition.predictions,
  );

  // 5. Detect contradictions
  const contradictions = detectContradictions(next.worldModel.relations);
  if (contradictions.length > 0) {
    const newSpots = contradictions.map((c) => c.reason);
    const existing = new Set(next.metacognition.blindSpots);
    for (const spot of newSpots) {
      if (!existing.has(spot)) {
        next.metacognition.blindSpots.push(spot);
      }
    }
    next.metacognition.blindSpots = next.metacognition.blindSpots.slice(-20);
  }

  // 6. Update curiosity score based on gaps
  const gaps = identifyKnowledgeGaps(
    next.worldModel.entities,
    next.worldModel.relations,
  );
  next.curiosity.curiosityScore = Math.min(1, 0.2 + gaps.length * 0.08);

  // 7. Update goal progress
  next.goals.goals = next.goals.goals.map((g) =>
    g.status === 'active' ? updateGoalProgress(g, next.goals.goals) : g,
  );

  // 8. Update thermodynamics
  const thermo = computeThermodynamics(next);
  next.thermo = {
    ...next.thermo,
    temperature: thermo.temperature + 0.02, // light cycle adds a little heat
    entropy: thermo.entropy,
    energy: thermo.energy,
    heartbeatMs: thermo.heartbeatMs,
    lastLightCycle: now,
    cyclesLight: next.thermo.cyclesLight + 1,
  };
  next.thermo.temperature = Math.min(1, next.thermo.temperature);

  // 9. Prediction accuracy
  next.temporal.predictionAccuracy = calculatePredictionAccuracy(
    next.temporal.activePredictions,
  );

  next.lastCycleAt = now;
  next.cycleCount++;

  return next;
}

/**
 * MEDIUM CYCLE — One LLM call. Runs every ~3 min.
 * The system wonders about one thing.
 */
export async function runMediumCycle(
  state: SparkState,
  generate: GenerateFn,
  onLog: (msg: string) => void,
): Promise<SparkState> {
  const next: SparkState = JSON.parse(JSON.stringify(state));
  next.worldModel = normalizeWorldModel(next.worldModel);
  const now = Date.now();
  next.cycleCount++;
  next.lastCycleAt = now;

  // Decide what to do: answer a question, generate questions, or assess confidence
  const openQuestions = next.curiosity.questions.filter((q) => q.status === 'open');
  const gaps = identifyKnowledgeGaps(next.worldModel.entities, next.worldModel.relations);
  const unresolvedPreds = next.temporal.activePredictions.filter(
    (p) => p.resolved && p.wasCorrect === undefined,
  );
  const expandableGoal = next.goals.goals.find(
    (g) => g.status === 'active' && !g.parentGoal && g.subgoals.length === 0,
  );

  // Recursive planning: expand a top-level goal into a small tree.
  if (expandableGoal && Math.random() < 0.35) {
    onLog(`⟳ Medium: Expanding goal tree for "${expandableGoal.description.slice(0, 50)}..."`);
    try {
      const expanded = await recursivelyDecomposeGoal(
        expandableGoal,
        next.worldModel,
        generate,
        2,
        14,
      );
      if (expanded.length > 0) {
        const idToGoal = new Map(next.goals.goals.map((g) => [g.id, g]));
        idToGoal.set(expandableGoal.id, expandableGoal);
        for (const g of expanded) idToGoal.set(g.id, g);
        next.goals.goals = [...idToGoal.values()];
        onLog(`  Goal tree expanded: +${expanded.length} derived subgoal(s)`);
      } else {
        onLog('  No viable decomposition produced');
      }
    } catch {
      onLog('  Goal decomposition failed');
    }
  }

  // Priority: answer existing questions > generate new ones > assess predictions
  if (openQuestions.length > 0 && Math.random() < 0.5) {
    // Try to answer the highest priority question
    const question = openQuestions.sort((a, b) => b.priority - a.priority)[0];
    onLog(`⟳ Medium: Investigating "${question.question.slice(0, 60)}..."`);
    try {
      const response = await generate(
        [
          {
            role: 'system',
            content: 'Answer the following question concisely based on your knowledge. If unsure, say so honestly.',
          },
          { role: 'user', content: question.question },
        ],
        { temperature: 0.3, maxTokens: 256 },
      );
      question.status = 'answered';
      question.answer = response.slice(0, 500);
      next.curiosity.totalQuestionsAnswered++;
      onLog(`  Answered: ${response.slice(0, 80)}...`);

      // Store the answer as a temporal event
      next.temporal.events.push(
        createTemporalEvent(`Answered: ${question.question.slice(0, 60)}`, [], false),
      );
    } catch {
      onLog('  Failed to answer question');
    }
  } else if (gaps.length > 0) {
    // Generate new curiosity questions
    onLog(`⟳ Medium: Exploring ${gaps.length} knowledge gap(s)...`);
    try {
      const newQuestions = await generateCuriosityQuestions(
        gaps,
        next.curiosity.questions,
        next.worldModel.entities.slice(-10).map((e) => e.name).join(', '),
        generate,
      );
      next.curiosity.questions = [
        ...next.curiosity.questions,
        ...newQuestions,
      ].slice(-50);
      next.curiosity.totalQuestionsGenerated += newQuestions.length;
      onLog(`  +${newQuestions.length} new question(s)`);
    } catch {
      onLog('  Question generation failed');
    }
  } else if (unresolvedPreds.length > 0) {
    // Try to validate a prediction
    const pred = unresolvedPreds[0];
    const predictionText = predictionToText(pred.prediction);
    onLog(`⟳ Medium: Evaluating prediction "${predictionText.slice(0, 60)}..."`);
    try {
      const assessment = await assessConfidence(
        predictionText,
        [],
        next.metacognition.calibrationScore,
        generate,
      );
      pred.wasCorrect = assessment.confidence > 0.5;
      if (pred.wasCorrect) next.metacognition.correctPredictions++;
      next.metacognition.totalPredictions++;
      onLog(`  Assessment: ${(assessment.confidence * 100).toFixed(0)}% — ${assessment.reasoning.slice(0, 60)}`);
    } catch {
      onLog('  Prediction evaluation failed');
    }
  } else {
    onLog('⟳ Medium: Nothing to investigate — system at equilibrium');
  }

  // Update thermodynamics
  const thermo = computeThermodynamics(next);
  next.thermo = {
    ...next.thermo,
    temperature: Math.min(1, thermo.temperature + 0.05),
    entropy: thermo.entropy,
    energy: thermo.energy,
    heartbeatMs: thermo.heartbeatMs,
    lastMediumCycle: now,
    cyclesMedium: next.thermo.cyclesMedium + 1,
  };

  next.logs = [
    ...next.logs,
    `[M${next.thermo.cyclesMedium}] T:${(next.thermo.temperature * 100).toFixed(0)}° E:${next.thermo.energy.toFixed(0)} S:${(next.thermo.entropy * 100).toFixed(0)}%`,
  ].slice(-100);

  return next;
}
