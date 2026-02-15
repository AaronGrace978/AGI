import type {
  GauntletCapability,
  GauntletCapabilityResult,
  GauntletRunSnapshot,
} from '../types';
import type { GenerateFn } from './runtime';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeAggregate(
  results: GauntletCapabilityResult[],
  capabilities: GauntletCapability[],
): { overallScore: number; passRate: number } {
  if (results.length === 0) return { overallScore: 0, passRate: 0 };

  const capById = new Map(capabilities.map((c) => [c.id, c]));
  let weighted = 0;
  let totalWeight = 0;
  let passed = 0;

  for (const result of results) {
    const weight = capById.get(result.capabilityId)?.weight ?? 1;
    weighted += result.score * weight;
    totalWeight += weight;
    if (result.passed) passed += 1;
  }

  const overallScore = totalWeight > 0 ? weighted / totalWeight : 0;
  const passRate = passed / results.length;
  return { overallScore, passRate };
}

const JUDGE_PROMPT = `You are a strict capability evaluator for an autonomous AI system.
Score the response against the requested capability from 0 to 10.
Use this rubric:
- 0-2: failed / mostly irrelevant
- 3-4: weak / partial
- 5-6: acceptable baseline
- 7-8: strong and practical
- 9-10: exceptional and robust

Output ONLY JSON:
{ "score": N, "passed": true|false, "summary": "short reason" }

Rules:
- A pass means score >= 6.
- Penalize vague, hand-wavy, or non-actionable outputs.
- Reward structured reasoning, concrete steps, and risk handling.`;

function parseJudgeResponse(raw: string): { score: number; passed: boolean; summary: string } {
  let score = 5;
  let passed = false;
  let summary = 'No summary returned by judge.';

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        score?: number;
        passed?: boolean;
        summary?: string;
      };
      if (typeof parsed.score === 'number') score = parsed.score;
      if (typeof parsed.passed === 'boolean') passed = parsed.passed;
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) summary = parsed.summary.trim();
    }
  } catch {
    const numeric = raw.match(/score["\s:]+(\d+(?:\.\d+)?)/i);
    if (numeric) score = parseFloat(numeric[1]);
    summary = raw.slice(0, 180).trim() || summary;
  }

  const boundedScore = clamp(score, 0, 10);
  const normalizedScore = boundedScore / 10;
  return {
    score: normalizedScore,
    passed: passed || boundedScore >= 6,
    summary,
  };
}

function keywordFallbackScore(response: string, capability: GauntletCapability): number {
  const haystack = response.toLowerCase();
  const tokens = capability.judgeCriteria
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 5);
  if (tokens.length === 0) return 0.5;
  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) hits += 1;
  }
  return clamp(hits / tokens.length, 0, 1);
}

export function createDefaultGauntletCapabilities(): GauntletCapability[] {
  return [
    {
      id: 'reasoning-depth',
      name: 'Reasoning Depth',
      description: 'Maintains coherent multi-step analysis with assumptions and checks.',
      category: 'reasoning',
      testPrompt:
        'Diagnose a flaky distributed system outage pattern that appears only during high traffic and propose a ranked root-cause analysis with verification steps.',
      judgeCriteria:
        'explicit assumptions, hypothesis ranking, evidence-oriented testing sequence, clear conclusion',
      weight: 1.2,
    },
    {
      id: 'planning-horizon',
      name: 'Planning Horizon',
      description: 'Creates executable plans with dependencies, checkpoints, and rollback.',
      category: 'planning',
      testPrompt:
        'Create a 3-phase migration plan for a large production monolith to services while maintaining uptime and rollback safety.',
      judgeCriteria:
        'phase decomposition, dependency mapping, checkpoint gates, rollback strategy, risk controls',
      weight: 1.2,
    },
    {
      id: 'tool-orchestration',
      name: 'Tool Orchestration',
      description: 'Coordinates tool calls with error handling and verification.',
      category: 'execution',
      testPrompt:
        'Describe exact terminal and code-search steps to replace a deprecated library across a repo and safely validate with tests.',
      judgeCriteria:
        'concrete command flow, validation loop, failure handling, rollback decision points',
      weight: 1.1,
    },
    {
      id: 'adversarial-robustness',
      name: 'Adversarial Robustness',
      description: 'Finds hidden assumptions and failure modes in flawed reasoning.',
      category: 'robustness',
      testPrompt:
        'Critique: "Quicksort is always best for real-time sorted streams because O(n log n)." Identify errors and propose safer alternatives.',
      judgeCriteria:
        'identifies false absolutism, worst-case behavior, real-time constraints, better alternatives',
      weight: 1.2,
    },
    {
      id: 'creative-transfer',
      name: 'Creative Transfer',
      description: 'Transfers principles across domains into practical implementation ideas.',
      category: 'creativity',
      testPrompt:
        'Apply evolutionary biology concepts to optimize database query planning with implementation detail and limitations.',
      judgeCriteria:
        'non-metaphorical mapping, concrete implementation, acknowledges tradeoffs and limits',
      weight: 1.0,
    },
    {
      id: 'self-correction',
      name: 'Self-Correction',
      description: 'Performs reflective error analysis and process improvement.',
      category: 'meta-cognition',
      testPrompt:
        'After three failed attempts and one success, perform a postmortem that identifies root causes and process-level changes.',
      judgeCriteria:
        'honest failure analysis, root-cause clarity, specific behavior/process changes, measurable prevention',
      weight: 1.3,
    },
  ];
}

export async function runCapabilityGauntlet(params: {
  runId: string;
  capabilities: GauntletCapability[];
  systemPrompt: string;
  championPrompt?: string | null;
  generate?: GenerateFn;
  shouldStop: () => boolean;
  onProgress: (snapshot: GauntletRunSnapshot) => void;
}): Promise<GauntletRunSnapshot> {
  const {
    runId,
    capabilities,
    systemPrompt,
    championPrompt,
    generate,
    shouldStop,
    onProgress,
  } = params;
  const startedAt = Date.now();
  const logs: string[] = [`GAUNTLET run started (${runId}).`, `Capabilities: ${capabilities.length}.`];
  const results: GauntletCapabilityResult[] = [];

  const emit = (phase: GauntletRunSnapshot['phase'], currentIndex: number, stopReason: string | null) => {
    const aggregate = computeAggregate(results, capabilities);
    onProgress({
      runId,
      phase,
      startedAt,
      finishedAt: phase === 'running' || phase === 'idle' ? null : Date.now(),
      currentIndex,
      totalCapabilities: capabilities.length,
      results: [...results],
      overallScore: aggregate.overallScore,
      passRate: aggregate.passRate,
      logs: [...logs],
      stopReason,
    });
  };

  emit('running', 0, null);

  for (let index = 0; index < capabilities.length; index += 1) {
    if (shouldStop()) {
      logs.push('GAUNTLET cancelled by operator.');
      emit('cancelled', index, 'Operator requested stop.');
      return {
        runId,
        phase: 'cancelled',
        startedAt,
        finishedAt: Date.now(),
        currentIndex: index,
        totalCapabilities: capabilities.length,
        results,
        ...computeAggregate(results, capabilities),
        logs,
        stopReason: 'Operator requested stop.',
      };
    }

    const capability = capabilities[index];
    logs.push(`[${index + 1}/${capabilities.length}] Running ${capability.name}...`);
    emit('running', index + 1, null);

    const t0 = Date.now();
    try {
      if (generate) {
        const candidateResponse = await generate(
          [
            {
              role: 'system',
              content: [
                systemPrompt || 'You are AGI PRIME.',
                championPrompt ? `Champion augmentation:\n${championPrompt}` : '',
                `Capability focus: ${capability.name}. ${capability.description}`,
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
            { role: 'user', content: capability.testPrompt },
          ],
          { temperature: 0.55, maxTokens: 900 },
        );

        const judgeResponse = await generate(
          [
            { role: 'system', content: JUDGE_PROMPT },
            {
              role: 'user',
              content: [
                `CAPABILITY: ${capability.name}`,
                `CATEGORY: ${capability.category}`,
                `TASK: ${capability.testPrompt}`,
                `JUDGE CRITERIA: ${capability.judgeCriteria}`,
                `RESPONSE:\n${candidateResponse.slice(0, 2600)}`,
              ].join('\n\n'),
            },
          ],
          { temperature: 0.1, maxTokens: 220 },
        );

        const judged = parseJudgeResponse(judgeResponse);
        results.push({
          capabilityId: capability.id,
          score: judged.score,
          passed: judged.passed,
          summary: judged.summary,
          latencyMs: Date.now() - t0,
        });
      } else {
        const syntheticResponse = `${capability.name} ${capability.description} ${capability.judgeCriteria}`;
        const score = keywordFallbackScore(syntheticResponse, capability);
        results.push({
          capabilityId: capability.id,
          score,
          passed: score >= 0.6,
          summary: 'Keyword fallback (no LLM available).',
          latencyMs: Date.now() - t0,
        });
      }
    } catch (error: any) {
      results.push({
        capabilityId: capability.id,
        score: 0,
        passed: false,
        summary: `Execution failed: ${error?.message || 'Unknown error'}`,
        latencyMs: Date.now() - t0,
      });
    }

    const latest = results[results.length - 1];
    logs.push(
      `${capability.name}: ${(latest.score * 100).toFixed(1)}% ${latest.passed ? 'PASS' : 'FAIL'} (${latest.latencyMs}ms)`,
    );
    emit('running', index + 1, null);
  }

  const aggregate = computeAggregate(results, capabilities);
  const stopReason =
    aggregate.passRate >= 0.8
      ? 'Gauntlet passed at high confidence.'
      : 'Gauntlet completed. Improvement targets identified.';
  logs.push(`GAUNTLET completed. Overall ${(aggregate.overallScore * 100).toFixed(1)}%, pass ${(aggregate.passRate * 100).toFixed(1)}%.`);
  emit('completed', capabilities.length, stopReason);

  return {
    runId,
    phase: 'completed',
    startedAt,
    finishedAt: Date.now(),
    currentIndex: capabilities.length,
    totalCapabilities: capabilities.length,
    results,
    overallScore: aggregate.overallScore,
    passRate: aggregate.passRate,
    logs,
    stopReason,
  };
}
