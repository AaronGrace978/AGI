// ═══════════════════════════════════════════════════════════════
//  SPARK — Self-Propagating Autonomous Reasoning Kernel
//  The cognitive architecture. Seven engines. One mind.
//
//  1. SYMBOLIC REASONER  — Real math. Real logic. No hallucination.
//  2. WORLD MODEL        — Dynamic knowledge graph.
//  3. CURIOSITY ENGINE   — Gap detection, intrinsic motivation.
//  4. META-COGNITION     — Confidence calibration, self-monitoring.
//  5. GOAL ENGINE        — Persistent goal trees, decomposition.
//  6. SELF-MODIFICATION  — Strategy evolution, tool generation.
//  7. TEMPORAL REASONER  — Causal chains, prediction, learning.
//  8. KERNEL             — Orchestrates the cycle.
//
//  "The pain wasn't wasted. The pain was research."
// ═══════════════════════════════════════════════════════════════

import type { GenerateFn } from './runtime';
import { createDefaultGenome } from './cognitive-genome';
import { createDefaultMetabolism } from './autonomy-metabolism';
import { createDefaultSocialState } from './social-sim';
import { createDefaultEcology } from './embodied-ecology';
import type {
  SparkState,
  SparkThermodynamics,
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

  const prompt = `Analyze the following text and extract structured knowledge.

EXISTING KNOWN ENTITIES: ${existingNames || 'none yet'}

TEXT TO ANALYZE:
"${text.slice(0, 2000)}"

Extract:
1. ENTITIES: Things, concepts, people, systems mentioned
2. RELATIONS: How they relate (causes, enables, is_a, has_property, relates_to, contradicts, temporal_before, part_of, uses, produces)

Output ONLY valid JSON:
{"entities": [{"name": "...", "type": "concept|object|person|event|system|process", "properties": {"key": "value"}}], "relations": [{"source": "entity_name", "target": "entity_name", "type": "...", "evidence": "brief reason"}]}

Be precise. Only extract what is clearly stated or strongly implied.`;

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

  const prompt = `You are a curiosity engine. Generate genuinely interesting questions that would deepen understanding.

KNOWLEDGE GAPS DETECTED:
${gaps.slice(0, 5).join('\n')}

RECENT CONTEXT:
${recentContext.slice(0, 500)}

EXISTING OPEN QUESTIONS (don't repeat):
${existingQs || 'none'}

Generate 3 new questions that:
1. Address actual knowledge gaps
2. Are specific and answerable
3. Would lead to genuinely useful understanding
4. Range from practical to deep/philosophical

Output ONLY a JSON array:
[{"question": "...", "domain": "...", "priority": 0.0-1.0}]`;

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
  const prompt = `Assess the confidence level for the following claim.

CLAIM: "${claim}"

SUPPORTING EVIDENCE:
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None provided'}

Evaluate:
1. How strong is the evidence?
2. What could be wrong?
3. What uncertainties exist?
4. Your honest confidence (0.0-1.0)?

Output JSON:
{"confidence": 0.0-1.0, "reasoning": "...", "uncertainties": ["...", "..."]}

Be HONEST. 0.5 = coin flip. 0.9 = very sure. Don't inflate.`;

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
  const prompt = `You are the self-modification engine of a cognitive architecture.

CURRENT STRATEGY:
"${currentStrategy.slice(0, 500)}"

RECENT PERFORMANCE:
- Successes: ${recentPerformance.successes}
- Failures: ${recentPerformance.failures}
- Average Confidence: ${(recentPerformance.avgConfidence * 100).toFixed(0)}%

RECENT ERRORS/BLIND SPOTS:
${recentErrors.slice(0, 3).map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None recorded'}

Propose ONE specific modification to improve performance:
1. What concrete change to the strategy?
2. Why will it help?
3. The proposed new strategy text?

Output JSON:
{"type": "prompt_tweak|strategy_change|parameter_adjust", "description": "what and why", "newStrategy": "the modified strategy text"}

Be specific. Concrete changes only. No vague improvements.`;

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

  const prompt = `Based on recent events and known causal relationships, predict what might happen next.

RECENT EVENTS:
${eventList || 'No recent events'}

KNOWN CAUSAL RELATIONSHIPS:
${causalRelations || 'None established'}

Generate 2-3 predictions with confidence levels.
Output JSON:
[{"prediction": "...", "confidence": 0.0-1.0}]

Be specific. Grounded predictions only. No wild speculation.`;

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
    worldModel: { entities: [], relations: [], lastUpdated: 0 },
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
    thermo: { ...DEFAULT_THERMO },
    logs: ['SPARK kernel initialized. Seven engines standing by. Awaiting ignition.'],
    lastCycleAt: 0,
    uptime: 0,
  };
}

/**
 * Run a full SPARK cognitive cycle.
 * Pipeline: World Model → Curiosity → Reasoning → Goals → Meta → Temporal → Log
 */
export async function runSparkCycle(
  state: SparkState,
  input: string,
  generate: GenerateFn,
  onLog: (msg: string) => void,
): Promise<SparkState> {
  const next: SparkState = JSON.parse(JSON.stringify(state));
  next.cycleCount++;
  next.lastCycleAt = Date.now();
  next.active = true;
  next.phase = 'thinking';

  onLog(`━━━ SPARK Cycle #${next.cycleCount} ━━━`);

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
    next.worldModel = {
      entities: [...next.worldModel.entities, ...newEntities].slice(-200),
      relations: [...next.worldModel.relations, ...relations].slice(-500),
      lastUpdated: Date.now(),
    };
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
    `[C${next.cycleCount}] ${next.worldModel.entities.length}E ${next.worldModel.relations.length}R | Curiosity ${(next.curiosity.curiosityScore * 100).toFixed(0)}% | Cal ${(calibration * 100).toFixed(0)}% | Goals ${activeGoals.length}`,
  ].slice(-100);

  next.phase = 'running';
  onLog(`━━━ Cycle #${next.cycleCount} complete ━━━`);

  return next;
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
      next.selfmod = {
        ...next.selfmod,
        modifications: [...next.selfmod.modifications, mod].slice(-20),
        totalModifications: next.selfmod.totalModifications + 1,
      };
      onLog(`  Proposed: ${mod.description.slice(0, 120)}`);
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
    next.temporal = {
      ...next.temporal,
      activePredictions: [
        ...next.temporal.activePredictions,
        ...predictions,
      ].slice(-20),
    };
    for (const p of predictions) {
      onLog(`  → ${p.prediction} (${(p.confidence * 100).toFixed(0)}%)`);
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

  // 1. Decay entity salience — what you don't think about fades
  for (const entity of next.worldModel.entities) {
    const age = now - entity.lastReferenced;
    const decayFactor = Math.exp(-age / 3600000); // half-life ~1 hour
    entity.salience = Math.max(0.05, entity.salience * decayFactor);
  }

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
  const now = Date.now();
  next.cycleCount++;
  next.lastCycleAt = now;

  // Decide what to do: answer a question, generate questions, or assess confidence
  const openQuestions = next.curiosity.questions.filter((q) => q.status === 'open');
  const gaps = identifyKnowledgeGaps(next.worldModel.entities, next.worldModel.relations);
  const unresolvedPreds = next.temporal.activePredictions.filter(
    (p) => p.resolved && p.wasCorrect === undefined,
  );

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
    onLog(`⟳ Medium: Evaluating prediction "${pred.prediction.slice(0, 60)}..."`);
    try {
      const assessment = await assessConfidence(
        pred.prediction,
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
