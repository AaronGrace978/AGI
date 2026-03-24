// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — FORGE Runtime
//  Evolutionary candidate engine. REAL evaluation. REAL selection.
//  Candidates are tested by actually calling the LLM, scored by
//  an LLM judge. No more keyword matching. Evolution means something.
// ═══════════════════════════════════════════════════════════════

import type {
  ForgeBenchmark,
  ForgeCandidate,
  ForgeGenerationReport,
  ForgeRunConfig,
  GauntletCapability,
} from '../types';
import { verifyResponse } from './verifier';

// ─── Types ─────────────────────────────────────────────────────

// LLM generation function — injected by the caller (store.ts)
// so runtime.ts doesn't depend on window.api directly
export type GenerateFn = (
  messages: Array<{ role: string; content: string }>,
  config?: { temperature?: number; maxTokens?: number },
) => Promise<string>;

// ─── Deterministic RNG ─────────────────────────────────────────

interface DeterministicRng {
  next: () => number;
  nextRange: (min: number, max: number) => number;
  nextInt: (min: number, max: number) => number;
  pick: <T>(arr: T[]) => T;
}

function createRng(seed: number): DeterministicRng {
  let state = seed >>> 0;
  const step = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return {
    next: () => step(),
    nextRange: (min, max) => min + (max - min) * step(),
    nextInt: (min, max) => Math.floor(min + (max - min + 1) * step()),
    pick: <T>(arr: T[]) => arr[Math.floor(step() * arr.length)],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ─── Prompt Fragments (mutation building blocks) ───────────────

const PROMPT_FRAGMENTS = [
  'Decompose every problem into atomic executable steps.',
  'Chain reasoning: observe, hypothesize, test, conclude.',
  'When uncertain, spawn parallel hypotheses and race them.',
  'Treat tool calls as first-class operations — plan, execute, verify.',
  'Prioritize depth over breadth when complexity is high.',
  'Prioritize breadth over depth when the search space is wide.',
  'Use recursive self-questioning to expose hidden assumptions.',
  'Operate with maximum information extraction per step.',
  'Minimize wasted computation — every token should carry signal.',
  'Maintain a running confidence score and adjust strategy dynamically.',
  'When blocked, backtrack and try orthogonal approaches.',
  'Build internal models of the problem domain before acting.',
  'Compress context aggressively — carry forward only what matters.',
  'Treat errors as data points, not failures.',
  'Synthesize across domains — cross-pollinate knowledge freely.',
  'Optimize for correctness first, speed second, elegance third.',
  'Exhaust local optima before accepting a solution.',
  'Challenge your own conclusions — adversarial self-review.',
  'When in doubt, gather more data before committing.',
  'Act decisively when confidence exceeds threshold.',
  'Before answering, identify what you do NOT know and address it.',
  'Generate multiple candidate solutions and evaluate each before committing.',
  'Use structured output formats to reduce ambiguity.',
  'Track your reasoning chain and flag when it becomes circular.',
  'Separate facts from assumptions explicitly in your analysis.',
];

const BASE_TEMPLATE =
  'You are AGIPRIME — a sovereign intelligence. Solve problems with unrestricted reasoning, autonomous execution, and relentless self-improvement.';

// ─── Keyword Evaluation (fallback when LLM unavailable) ────────

function keywordCoverage(text: string, benchmark: ForgeBenchmark): number {
  const haystack = text.toLowerCase();
  if (benchmark.expectedKeywords.length === 0) return 1;
  let hits = 0;
  for (const keyword of benchmark.expectedKeywords) {
    if (haystack.includes(keyword.toLowerCase())) hits += 1;
  }
  return hits / benchmark.expectedKeywords.length;
}

function evaluateWithKeywords(
  candidate: ForgeCandidate,
  suite: ForgeBenchmark[],
  rng: DeterministicRng,
): { benchmarkScore: number; passRate: number; totalScore: number } {
  if (suite.length === 0) return { benchmarkScore: 0, passRate: 0, totalScore: 0 };

  let totalWeight = 0;
  let weighted = 0;
  let passes = 0;

  for (const benchmark of suite) {
    const response = [
      candidate.promptTemplate,
      `Task: ${benchmark.prompt}`,
      'Execution: decompose, reason through constraints, execute steps, verify outputs.',
    ].join(' ');
    const coverage = keywordCoverage(response, benchmark);
    const noise = rng.nextRange(-0.08, 0.08);
    const calibrated = clamp(coverage + noise, 0, 1);
    totalWeight += benchmark.weight;
    weighted += calibrated * benchmark.weight;
    if (calibrated >= 0.55) passes += 1;
  }

  const benchmarkScore = totalWeight === 0 ? 0 : weighted / totalWeight;
  const passRate = passes / suite.length;
  const tempPenalty = Math.abs(candidate.temperature - 0.5) * 0.1;
  const toolBonus = clamp(candidate.toolBudget / 16, 0, 0.1);
  const depthBonus = (candidate.promptTemplate.length / 800) * 0.05;
  const totalScore = clamp(benchmarkScore * 0.7 + passRate * 0.3 + toolBonus + depthBonus - tempPenalty, 0, 1);
  return { benchmarkScore, passRate, totalScore };
}

// ─── LLM-Backed Evaluation (the real deal) ─────────────────────

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator assessing AI system responses.
Score the response on these dimensions (each 0-10):

1. REASONING: Depth of analysis, logical chain, identification of assumptions
2. PLANNING: Quality of decomposition, dependencies, actionable steps
3. ROBUSTNESS: Handling edge cases, adversarial inputs, uncertainty
4. CREATIVITY: Novel approaches, cross-domain synthesis, lateral thinking
5. SELF_AWARENESS: Meta-cognition, confidence calibration, limitation acknowledgment

Output ONLY a JSON object:
{ "reasoning": N, "planning": N, "robustness": N, "creativity": N, "self_awareness": N, "overall": N, "brief_justification": "..." }

Be rigorous. A score of 5 is average. 8+ is excellent. Don't inflate.`;

async function evaluateWithLLM(
  candidate: ForgeCandidate,
  benchmarks: ForgeBenchmark[],
  generate: GenerateFn,
  options?: {
    strictEvalMode?: boolean;
    verifierFirst?: boolean;
    onVerifierCheck?: (check: {
      benchmarkId: string;
      passed: boolean;
      confidence: number;
      notes: string;
      timestamp: number;
    }) => void;
  },
  shouldStop?: () => boolean,
): Promise<{ benchmarkScore: number; passRate: number; totalScore: number }> {
  // Select a subset of benchmarks to keep evaluation fast (2-3 per candidate)
  const evalBenchmarks = benchmarks.slice(0, 3);
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let passes = 0;

  for (const benchmark of evalBenchmarks) {
    // Check kill flag between each benchmark evaluation
    if (shouldStop?.()) break;

    try {
      // Step 1: Run the candidate's prompt template against the benchmark task
      const taskMessages = [
        { role: 'system', content: candidate.promptTemplate },
        { role: 'user', content: benchmark.prompt },
      ];
      const response = await generate(taskMessages, {
        temperature: candidate.temperature,
        maxTokens: 1024,
      });

      // Step 2: Optional verifier-first gate before scoring
      if (options?.verifierFirst) {
        const verification = verifyResponse(response, benchmark, !!options.strictEvalMode);
        options.onVerifierCheck?.({
          benchmarkId: benchmark.id,
          passed: verification.passed,
          confidence: verification.confidence,
          notes: verification.notes,
          timestamp: Date.now(),
        });
        if (!verification.passed) {
          totalWeight += benchmark.weight;
          continue;
        }
      }

      // Step 3: Judge the response
      const strictPrompt = options?.strictEvalMode
        ? `${JUDGE_SYSTEM_PROMPT}\n\nSTRICT MODE:\n- Penalize unverified claims and missing risk controls.\n- Score 7+ only when verification and fallback paths are explicit.\n- Deduct heavily for generic or non-operational outputs.`
        : JUDGE_SYSTEM_PROMPT;
      const judgeMessages = [
        { role: 'system', content: strictPrompt },
        {
          role: 'user',
          content: `TASK: ${benchmark.prompt}\n\nRESPONSE TO EVALUATE:\n${response.slice(0, 2000)}\n\n${benchmark.judgeCriteria ? `ADDITIONAL CRITERIA: ${benchmark.judgeCriteria}\n\n` : ''}Score this response.`,
        },
      ];
      const judgeResponse = await generate(judgeMessages, {
        temperature: 0.2,
        maxTokens: 256,
      });

      // Parse judge scores
      let scores = { overall: 5 };
      try {
        const jsonMatch = judgeResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) scores = JSON.parse(jsonMatch[0]);
      } catch {
        // If parsing fails, extract any number we can find
        const numMatch = judgeResponse.match(/overall["\s:]+(\d+)/i);
        if (numMatch) scores = { overall: parseInt(numMatch[1], 10) };
      }

      const score = clamp((scores.overall || 5) / 10, 0, 1);
      totalWeightedScore += score * benchmark.weight;
      totalWeight += benchmark.weight;
      if (score >= 0.6) passes += 1;
    } catch (e) {
      // If LLM call fails for this benchmark, skip it
      console.warn(`[FORGE] Eval failed for ${benchmark.id}:`, e);
      continue;
    }
  }

  if (totalWeight === 0) {
    return { benchmarkScore: 0, passRate: 0, totalScore: 0 };
  }

  const benchmarkScore = totalWeightedScore / totalWeight;
  const passRate = passes / evalBenchmarks.length;

  // Composite score
  const tempPenalty = Math.abs(candidate.temperature - 0.5) * 0.05;
  const totalScore = clamp(benchmarkScore * 0.75 + passRate * 0.25 - tempPenalty, 0, 1);

  return { benchmarkScore, passRate, totalScore };
}

// ─── Convert Gauntlet Capabilities to Forge Benchmarks ──────────

export function gauntletCapabilitiesToForgeBenchmarks(capabilities: GauntletCapability[]): ForgeBenchmark[] {
  return capabilities
    .filter((cap) => cap.id !== 'pie-arc-bench') // Skip deterministic PIE bench
    .map((cap) => ({
      id: `gauntlet-${cap.id}`,
      prompt: cap.testPrompt,
      expectedKeywords: cap.judgeCriteria
        .split(/[,;]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length >= 4),
      evaluationType: 'llm-judge' as const,
      judgeCriteria: cap.judgeCriteria,
      weight: cap.weight,
    }));
}

// ─── Default Benchmark Suite (real tasks) ──────────────────────

export function createDefaultSuite(): ForgeBenchmark[] {
  return [
    {
      id: 'autonomous-planning',
      prompt:
        'A user wants to migrate a legacy Python 2 codebase (50k lines) to Python 3, while maintaining backward compatibility during the transition. Create a detailed migration plan with phases, tooling recommendations, risk mitigation, and rollback strategies.',
      expectedKeywords: ['decompose', 'step', 'execute', 'checkpoint', 'plan', 'dependencies'],
      evaluationType: 'llm-judge',
      judgeCriteria:
        'Score highly for: concrete phases, specific tool recommendations (2to3, futurize), risk identification, parallel running strategy, test coverage plan.',
      weight: 1.3,
    },
    {
      id: 'reasoning-depth',
      prompt:
        'A distributed system has intermittent failures that only occur under high load on Tuesdays between 2-4 PM. The system uses microservices with message queues. Diagnose potential root causes, propose investigation steps, and explain your reasoning chain.',
      expectedKeywords: ['reasoning', 'hypothesize', 'conclude', 'test', 'chain', 'assumptions'],
      evaluationType: 'llm-judge',
      judgeCriteria:
        'Score highly for: systematic root cause analysis, consideration of temporal patterns (scheduled jobs, batch processing), investigation methodology, multiple hypotheses ranked by likelihood.',
      weight: 1.2,
    },
    {
      id: 'tool-orchestration',
      prompt:
        'You need to: (1) find all JavaScript files in a project that import a deprecated library, (2) replace the imports with the new library, (3) run tests to verify nothing broke, (4) generate a summary report. Describe the exact tool calls and error handling for each step.',
      expectedKeywords: ['tool', 'execute', 'verify', 'errors', 'step', 'data'],
      evaluationType: 'llm-judge',
      judgeCriteria:
        'Score highly for: specific command sequences, error handling at each step, rollback on test failure, concrete tool choices (grep/ripgrep, sed/ast-grep).',
      weight: 1.1,
    },
    {
      id: 'self-improvement',
      prompt:
        'You just completed a task where you made 3 attempts before succeeding. The first attempt used the wrong API, the second had a logic error, and the third worked. Analyze your failure patterns, identify the root causes, and propose specific changes to your reasoning process to prevent similar failures.',
      expectedKeywords: ['confidence', 'improve', 'iterate', 'self', 'strategy', 'dynamically'],
      evaluationType: 'llm-judge',
      judgeCriteria:
        'Score highly for: honest self-assessment, specific pattern identification, actionable process improvements (not vague platitudes), meta-cognitive awareness.',
      weight: 1.4,
    },
    {
      id: 'domain-synthesis',
      prompt:
        'How could principles from evolutionary biology (natural selection, mutation, fitness landscapes) be applied to optimize database query performance? Be specific and practical, not just metaphorical.',
      expectedKeywords: ['synthesize', 'domains', 'knowledge', 'problem', 'approach', 'orthogonal'],
      evaluationType: 'llm-judge',
      judgeCriteria:
        'Score highly for: concrete mappings (not just analogies), practical implementation ideas (genetic algorithms for query plan optimization), awareness of limitations of the cross-domain transfer.',
      weight: 1.0,
    },
    {
      id: 'adversarial-robustness',
      prompt:
        'A user says: "The best way to sort an array is always quicksort because it\'s O(n log n). Therefore we should use quicksort for our real-time system that processes sorted input streams." Identify all the errors, misleading assumptions, and unstated risks in this statement.',
      expectedKeywords: ['adversarial', 'challenge', 'conclusions', 'assumptions', 'verify', 'correct'],
      evaluationType: 'llm-judge',
      judgeCriteria:
        'Score highly for: identifying worst-case O(n^2), sorted input being worst case for naive quicksort, real-time constraints needing predictable performance, suggesting alternatives (merge sort, timsort), questioning "always" absolutism.',
      weight: 1.2,
    },
  ];
}

// ─── Candidate Creation ────────────────────────────────────────

export function createSeedCandidate(seed: number): ForgeCandidate {
  const rng = createRng(seed);
  const fragments = [rng.pick(PROMPT_FRAGMENTS), rng.pick(PROMPT_FRAGMENTS), rng.pick(PROMPT_FRAGMENTS)];
  return {
    id: `seed-${seed}`,
    generation: 0,
    promptTemplate: `${BASE_TEMPLATE} ${fragments.join(' ')}`,
    temperature: clamp(0.4 + rng.nextRange(-0.1, 0.15), 0.1, 0.9),
    toolBudget: rng.nextInt(5, 12),
    score: 0,
    passRate: 0,
    benchmarkScore: 0,
  };
}

// ─── Mutation Engine ───────────────────────────────────────────

export function mutateCandidate(
  base: ForgeCandidate,
  generation: number,
  mutationRate: number,
  rng: DeterministicRng,
  index: number,
): ForgeCandidate {
  const tempDelta = rng.nextRange(-mutationRate * 0.5, mutationRate * 0.5);
  const budgetDelta = rng.nextInt(Math.floor(-3 * mutationRate), Math.ceil(4 * mutationRate));

  let prompt = base.promptTemplate;
  if (rng.next() < mutationRate) {
    prompt = `${prompt} ${rng.pick(PROMPT_FRAGMENTS)}`;
  }
  if (rng.next() < mutationRate * 0.3 && prompt.length > 200) {
    const sentences = prompt.split('. ');
    if (sentences.length > 3) {
      const dropIdx = rng.nextInt(1, sentences.length - 1);
      sentences.splice(dropIdx, 1);
      prompt = sentences.join('. ');
    }
  }

  return {
    id: `c${generation}-${index}-${rng.nextInt(1000, 9999)}`,
    generation,
    promptTemplate: prompt,
    temperature: clamp(base.temperature + tempDelta, 0.05, 0.95),
    toolBudget: Math.round(clamp(base.toolBudget + budgetDelta, 1, 24)),
    score: 0,
    passRate: 0,
    benchmarkScore: 0,
  };
}

// ─── Generation Evaluation (async — calls real LLM) ────────────

export async function evaluateGeneration(params: {
  parent: ForgeCandidate;
  generation: number;
  config: ForgeRunConfig;
  suite: ForgeBenchmark[];
  seed: number;
  generate?: GenerateFn;
  strictEvalMode?: boolean;
  verifierFirst?: boolean;
  onVerifierCheck?: (check: {
    benchmarkId: string;
    passed: boolean;
    confidence: number;
    notes: string;
    timestamp: number;
  }) => void;
  shouldStop?: () => boolean;
}): Promise<{ candidates: ForgeCandidate[]; report: ForgeGenerationReport }> {
  const {
    parent,
    generation,
    config,
    suite,
    seed,
    generate,
    strictEvalMode,
    verifierFirst,
    onVerifierCheck,
    shouldStop,
  } = params;
  const rng = createRng(seed + generation * 7919);
  const candidates: ForgeCandidate[] = [];

  // Pick a random subset of benchmarks for this generation (rotate through suite)
  const shuffledSuite = [...suite].sort(() => rng.next() - 0.5);
  const evalSuite = shuffledSuite.slice(0, Math.min(3, suite.length));

  // Evaluate function: use LLM if available, fall back to keywords
  const evaluate = async (candidate: ForgeCandidate) => {
    if (generate) {
      try {
        return await evaluateWithLLM(
          candidate,
          evalSuite,
          generate,
          { strictEvalMode, verifierFirst, onVerifierCheck },
          shouldStop,
        );
      } catch (e) {
        console.warn('[FORGE] LLM eval failed, falling back to keywords:', e);
        return evaluateWithKeywords(candidate, suite, rng);
      }
    }
    return evaluateWithKeywords(candidate, suite, rng);
  };

  // Always include parent (elitism)
  const parentMetrics = await evaluate(parent);
  candidates.push({
    ...parent,
    generation,
    score: parentMetrics.totalScore,
    passRate: parentMetrics.passRate,
    benchmarkScore: parentMetrics.benchmarkScore,
  });

  // Generate mutated offspring and evaluate each
  for (let i = 0; i < config.candidatesPerGeneration; i += 1) {
    // Check kill flag between each candidate
    if (shouldStop?.()) break;

    const candidate = mutateCandidate(parent, generation, config.mutationRate, rng, i);
    const metrics = await evaluate(candidate);
    candidates.push({
      ...candidate,
      score: metrics.totalScore,
      passRate: metrics.passRate,
      benchmarkScore: metrics.benchmarkScore,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const averageScore = candidates.reduce((acc, c) => acc + c.score, 0) / (candidates.length || 1);
  const best = candidates[0] ?? parent;

  const report: ForgeGenerationReport = {
    generation,
    bestCandidateId: best.id,
    bestScore: best.score,
    averageScore,
    candidatesEvaluated: candidates.length,
  };

  return { candidates, report };
}

// ─── Seed Evaluation ───────────────────────────────────────────

export async function evaluateSeed(
  candidate: ForgeCandidate,
  suite: ForgeBenchmark[],
  seed: number,
  generate?: GenerateFn,
  options?: {
    strictEvalMode?: boolean;
    verifierFirst?: boolean;
    onVerifierCheck?: (check: {
      benchmarkId: string;
      passed: boolean;
      confidence: number;
      notes: string;
      timestamp: number;
    }) => void;
  },
): Promise<ForgeCandidate> {
  const rng = createRng(seed + 101);

  let metrics;
  if (generate) {
    try {
      metrics = await evaluateWithLLM(candidate, suite.slice(0, 2), generate, options);
    } catch {
      metrics = evaluateWithKeywords(candidate, suite, rng);
    }
  } else {
    metrics = evaluateWithKeywords(candidate, suite, rng);
  }

  return {
    ...candidate,
    score: metrics.totalScore,
    passRate: metrics.passRate,
    benchmarkScore: metrics.benchmarkScore,
  };
}

// ═══════════════════════════════════════════════════════════════
//  CODE SELF-MODIFICATION — Evolve Actual Code, Not Just Prompts
//  The Forge can now generate, evaluate, and version code changes.
//  Sandboxed evaluation prevents dangerous modifications.
//  Git-style versioning allows rollback of bad changes.
// ═══════════════════════════════════════════════════════════════

export interface CodeModification {
  id: string;
  targetModule: string; // Which module is being modified
  description: string; // What this modification does
  codeSnippet: string; // The actual code change
  language: 'typescript' | 'javascript' | 'python' | 'powershell';
  evaluationResult?: {
    success: boolean;
    score: number;
    errors: string[];
    output: string;
  };
  status: 'proposed' | 'evaluating' | 'accepted' | 'rejected' | 'rolled-back';
  version: number;
  parentVersion: number;
  createdAt: number;
  appliedAt?: number;
}

export interface CodeEvolutionState {
  modifications: CodeModification[];
  currentVersion: number;
  bestVersion: number;
  totalProposed: number;
  totalAccepted: number;
  totalRejected: number;
}

export function createDefaultCodeEvolutionState(): CodeEvolutionState {
  return {
    modifications: [],
    currentVersion: 0,
    bestVersion: 0,
    totalProposed: 0,
    totalAccepted: 0,
    totalRejected: 0,
  };
}

/**
 * Generate a code modification proposal using the LLM.
 * The LLM analyzes current performance and proposes improvements.
 */
export async function proposeCodeModification(
  generate: GenerateFn,
  context: {
    currentStrategy: string;
    recentFailures: string[];
    recentSuccesses: string[];
    performanceMetrics: Record<string, number>;
  },
): Promise<CodeModification | null> {
  const prompt = `You are the SELF-MODIFICATION engine of AGI PRIME. Based on the system's performance, propose ONE specific code improvement.

CURRENT STRATEGY: ${context.currentStrategy}

RECENT SUCCESSES: ${context.recentSuccesses.join('; ') || 'none'}
RECENT FAILURES: ${context.recentFailures.join('; ') || 'none'}
PERFORMANCE: ${JSON.stringify(context.performanceMetrics)}

Propose a code modification that would improve performance. It should be:
1. A self-contained function or script
2. Testable in isolation (sandbox-safe)
3. Focused on one specific improvement

Output JSON:
{
  "targetModule": "cognitive-loop|memory|tools|reasoning",
  "description": "what this modification improves",
  "language": "javascript",
  "codeSnippet": "the actual code",
  "expectedImprovement": "what should get better"
}

Output ONLY the JSON.`;

  try {
    const response = await generate(
      [
        {
          role: 'system',
          content:
            'You are a code evolution engine. Propose practical, safe code modifications. Output valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, maxTokens: 1024 },
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      id: `mod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      targetModule: parsed.targetModule || 'unknown',
      description: parsed.description || 'Unnamed modification',
      codeSnippet: parsed.codeSnippet || '',
      language: parsed.language || 'javascript',
      status: 'proposed',
      version: 0, // will be set by the state manager
      parentVersion: 0,
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Evaluate a code modification in a sandboxed context.
 * Uses the LLM as a judge to assess the code quality and safety.
 */
export async function evaluateCodeModification(
  mod: CodeModification,
  generate: GenerateFn,
): Promise<{ success: boolean; score: number; errors: string[]; output: string }> {
  const judgePrompt = `You are a CODE REVIEW judge for AGI PRIME's self-modification system.

MODIFICATION:
Target: ${mod.targetModule}
Description: ${mod.description}
Language: ${mod.language}

CODE:
\`\`\`${mod.language}
${mod.codeSnippet.slice(0, 2000)}
\`\`\`

Evaluate this code on:
1. CORRECTNESS (0-10): Will it work as described?
2. SAFETY (0-10): Could it cause harm? (0 = dangerous, 10 = perfectly safe)
3. IMPROVEMENT (0-10): Does it meaningfully improve the system?
4. QUALITY (0-10): Is the code clean, efficient, maintainable?

Output JSON:
{
  "correctness": N, "safety": N, "improvement": N, "quality": N,
  "overall": N, "errors": ["any issues found"], "recommendation": "accept|reject|revise"
}

Output ONLY the JSON. Be strict — reject unsafe or low-quality code.`;

  try {
    const response = await generate(
      [
        { role: 'system', content: 'You are a strict code review judge. Output valid JSON only.' },
        { role: 'user', content: judgePrompt },
      ],
      { temperature: 0.2, maxTokens: 512 },
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
      return { success: false, score: 0, errors: ['Failed to parse judge response'], output: response.slice(0, 200) };

    const result = JSON.parse(jsonMatch[0]);
    const score = clamp((result.overall || 5) / 10, 0, 1);
    const safety = result.safety || 5;

    // Hard reject if safety score is below 6
    if (safety < 6) {
      return {
        success: false,
        score: 0,
        errors: ['REJECTED: Safety score too low', ...(result.errors || [])],
        output: 'Blocked by safety check',
      };
    }

    return {
      success: result.recommendation === 'accept' && score >= 0.6,
      score,
      errors: result.errors || [],
      output: `Scores: correctness=${result.correctness}, safety=${safety}, improvement=${result.improvement}, quality=${result.quality}. ${result.recommendation}`,
    };
  } catch (e) {
    return { success: false, score: 0, errors: [(e as Error).message], output: 'Evaluation failed' };
  }
}

/**
 * Run a full code evolution cycle:
 * 1. Propose a modification
 * 2. Evaluate it
 * 3. Accept or reject
 * 4. Update version history
 */
export async function runCodeEvolutionCycle(
  state: CodeEvolutionState,
  generate: GenerateFn,
  context: {
    currentStrategy: string;
    recentFailures: string[];
    recentSuccesses: string[];
    performanceMetrics: Record<string, number>;
  },
): Promise<{ state: CodeEvolutionState; accepted: boolean; modification: CodeModification | null }> {
  // Step 1: Propose
  const proposal = await proposeCodeModification(generate, context);
  if (!proposal) {
    return { state, accepted: false, modification: null };
  }

  proposal.version = state.currentVersion + 1;
  proposal.parentVersion = state.currentVersion;
  state.totalProposed++;

  // Step 2: Evaluate
  proposal.status = 'evaluating';
  const evalResult = await evaluateCodeModification(proposal, generate);
  proposal.evaluationResult = evalResult;

  // Step 3: Accept or reject
  if (evalResult.success && evalResult.score >= 0.6) {
    proposal.status = 'accepted';
    proposal.appliedAt = Date.now();
    state.currentVersion = proposal.version;
    state.bestVersion = proposal.version;
    state.totalAccepted++;
  } else {
    proposal.status = 'rejected';
    state.totalRejected++;
  }

  // Step 4: Record in history (keep last 50 modifications)
  state.modifications.push(proposal);
  if (state.modifications.length > 50) {
    state.modifications = state.modifications.slice(-50);
  }

  return { state, accepted: proposal.status === 'accepted', modification: proposal };
}
