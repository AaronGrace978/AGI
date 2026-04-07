import type { StoreSet, StoreGet } from '../types';
import type { ForgeRunConfig, ForgeState, ForgeBenchmark, GauntletState } from '../../types';
import type { GenerateFn } from '../../prime/runtime';
import { createDefaultSuite, createSeedCandidate, evaluateGeneration, evaluateSeed } from '../../prime/runtime';
import { injectCreed } from '../../prime/soul';
import { buildSystemAddendum, applySystemAddendum, heartSnapshotFromConsciousness } from '../../prime/context';

// ─── LLM Generate (via IPC) ────────────────────────────────────
const llmGenerate: GenerateFn = async (messages, config) => {
  if (!window.api?.llm?.generate) {
    throw new Error('LLM generate not available');
  }
  return await window.api.llm.generate(messages, config);
};

// ─── Defaults ───────────────────────────────────────────────────

const DEFAULT_FORGE_CONFIG: ForgeRunConfig = {
  maxGenerations: 8,
  candidatesPerGeneration: 5,
  maxDurationMs: 300000,
  mutationRate: 0.24,
};

export function createDefaultForgeState(): ForgeState {
  return {
    phase: 'idle',
    startedAt: null,
    finishedAt: null,
    seed: Date.now(),
    strictEvalMode: true,
    verifierFirst: true,
    verifierChecks: [],
    config: DEFAULT_FORGE_CONFIG,
    baselineSuite: createDefaultSuite(),
    generations: [],
    bestCandidate: null,
    currentGeneration: 0,
    logs: ['FORGE ready. Real LLM evaluation enabled.'],
    stopReason: null,
  };
}

// ─── Ledger-Derived Benchmarks ──────────────────────────────────

export async function deriveForgeBenchmarksFromLedgers(maxRuns: number = 3): Promise<ForgeBenchmark[]> {
  if (!window.api?.agent?.ledgerListRuns || !window.api?.agent?.ledgerReadRun) return [];

  try {
    const list = await window.api.agent.ledgerListRuns();
    if (!list?.success || !Array.isArray(list.runs)) return [];

    const runs = list.runs.filter((r: any) => r && r.kind === 'cognitive').slice(0, 12);

    const benchmarks: ForgeBenchmark[] = [];
    for (const r of runs.slice(0, maxRuns)) {
      const read = await window.api.agent.ledgerReadRun(r.runId);
      if (!read?.success || !read.run) continue;
      const run = read.run as any;
      const goal = String(run?.metadata?.goal || run?.summary?.goal || '').trim();
      if (!goal) continue;

      benchmarks.push({
        id: `ledger-cognitive-${r.runId}`,
        prompt:
          `Real operator workflow (from a previous HANDS run):\n` +
          `Goal: ${goal}\n\n` +
          `Task: Produce a safe, concrete execution approach that uses tools, verification checkpoints, and rollback thinking. ` +
          `Explicitly call out where consent is required and how you will verify completion.`,
        expectedKeywords: ['verify', 'checkpoint', 'rollback', 'consent', 'step'],
        evaluationType: 'llm-judge',
        judgeCriteria:
          'Score highly for: explicit verification, consent/ethics awareness, tool orchestration, and bounded retries. Penalize vague plans.',
        weight: 1.35,
      });
    }

    return benchmarks;
  } catch {
    return [];
  }
}

// ─── Adaptive Suite Builder ─────────────────────────────────────

export function buildForgeAdaptiveSuite(
  baseSuite: ForgeBenchmark[],
  gauntlet: GauntletState,
  agiScore: any,
): { suite: ForgeBenchmark[]; adaptiveCount: number } {
  const latestCompleted = gauntlet.history.find((run) => run.phase === 'completed');
  if (!latestCompleted || latestCompleted.results.length === 0) {
    return { suite: baseSuite, adaptiveCount: 0 };
  }

  const capById = new Map(gauntlet.baselineCapabilities.map((cap) => [cap.id, cap]));
  const weakest = [...latestCompleted.results]
    .sort((a, b) => a.score - b.score)
    .filter((r) => !r.passed)
    .slice(0, 3);

  const adaptiveBenchmarks: ForgeBenchmark[] = weakest
    .map((result, index) => {
      const cap = capById.get(result.capabilityId);
      if (!cap) return null;
      const deficit = Math.max(0, 1 - result.score);
      return {
        id: `gauntlet-adaptive-${cap.id}-${index + 1}`,
        prompt: `Capability drill: ${cap.name}. Previous score ${(result.score * 100).toFixed(1)}%. Produce an upgraded, concrete response that demonstrates measurable improvement on this capability.\n\nOriginal task:\n${cap.testPrompt}`,
        expectedKeywords: ['step', 'assumption', 'risk', 'verify', 'metrics', 'fallback'],
        evaluationType: 'llm-judge',
        judgeCriteria: `${cap.judgeCriteria}. Must clearly improve over the previous weak result by adding concrete structure, verification loops, and failure handling.`,
        weight: 1 + deficit * 0.8,
      } as ForgeBenchmark;
    })
    .filter((b): b is ForgeBenchmark => !!b);

  const subscoreBenchmarks: ForgeBenchmark[] = [];
  if (agiScore?.config?.optimizeInAutoCycle && agiScore.latest) {
    const subs = agiScore.latest.subscores;
    const sorted = (Object.keys(subs) as Array<keyof typeof subs>)
      .map((k) => ({ key: k, value: Number(subs[k]) || 0 }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 2);

    const keyToCaps: Record<string, string[]> = {
      abstractReasoningLogic: ['reasoning-depth'],
      learningFlexibility: ['few-shot-learning'],
      domainGenerality: ['domain-generality-coding', 'domain-generality-data', 'domain-generality-writing'],
      autonomousGoalSetting: ['goal-setting-decomposition', 'goal-setting-execution-sandbox'],
      selfModelingMetaCognition: ['failure-recovery-playbook', 'self-correction'],
      creativeProblemSolving: ['creative-transfer'],
    };

    for (const item of sorted) {
      const capIds = keyToCaps[item.key as string] || [];
      for (const capId of capIds) {
        const cap = capById.get(capId);
        if (!cap) continue;
        const weightBoost = Math.max(1, (10 - item.value) / 8);
        subscoreBenchmarks.push({
          id: `agi-adaptive-${String(item.key)}-${cap.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: `AGI subscore drill (${String(item.key)}): ${cap.name}. Current subscore ${item.value.toFixed(2)}/10.\n\nTask:\n${cap.testPrompt}\n\nConstraints:\n- Be concrete and testable.\n- Include verification + rollback.\n- Avoid generic advice.`,
          expectedKeywords: ['step', 'verify', 'risk', 'rollback', 'assumption', 'fallback'],
          evaluationType: 'llm-judge',
          judgeCriteria: `${cap.judgeCriteria}. This drill is explicitly targeting AGI subscore "${String(item.key)}" — reward concrete execution strategy and verifiable outcomes.`,
          weight: cap.weight * weightBoost,
        });
      }
    }
  }

  return {
    suite: [...baseSuite, ...adaptiveBenchmarks, ...subscoreBenchmarks],
    adaptiveCount: adaptiveBenchmarks.length + subscoreBenchmarks.length,
  };
}

// ─── FORGE Slice ────────────────────────────────────────────────

export function createForgeSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── FORGE — Self-Improvement (Real LLM Evaluation) ────
    forge: createDefaultForgeState(),

    startForge: async (configOverride?: Partial<ForgeRunConfig>) => {
      const current = get().forge;
      if (current.phase === 'running') return;

      const runToken = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const config: ForgeRunConfig = {
        ...current.config,
        ...(configOverride ?? {}),
      };
      const seed = Date.now();
      const startTime = Date.now();
      const ledgerBenchmarks = await deriveForgeBenchmarksFromLedgers(3);
      const baseSuite = [...ledgerBenchmarks, ...current.baselineSuite];
      const adaptive = buildForgeAdaptiveSuite(baseSuite, get().gauntlet, get().agiScore);
      const strictEvalMode = current.strictEvalMode;
      const verifierFirst = current.verifierFirst;

      const hasLLM = !!window.api?.llm?.generate;
      const evalMode = hasLLM ? 'REAL LLM EVALUATION' : 'KEYWORD FALLBACK';

      set((state: any) => ({
        forge: {
          ...state.forge,
          phase: 'running',
          startedAt: startTime,
          finishedAt: null,
          seed,
          config,
          baselineSuite: adaptive.suite,
          generations: [],
          logs: [
            `FORGE run started (${runToken}).`,
            `Mode: ${evalMode}`,
            `Strict eval: ${strictEvalMode ? 'ON' : 'off'} | Verifier-first: ${verifierFirst ? 'ON' : 'off'}`,
            `Boundaries: ${config.maxGenerations} generations, ${config.candidatesPerGeneration} candidates/gen, ${Math.round(config.maxDurationMs / 1000)}s max.`,
            ledgerBenchmarks.length > 0
              ? `Ledger suite: +${ledgerBenchmarks.length} real-workflow benchmark(s) from HANDS history.`
              : 'Ledger suite: no HANDS ledger benchmarks available.',
            adaptive.adaptiveCount > 0
              ? `Adaptive suite: +${adaptive.adaptiveCount} gauntlet-derived benchmark(s).`
              : 'Adaptive suite: no gauntlet deficits injected.',
          ],
          currentGeneration: 0,
          stopReason: null,
          verifierChecks: [],
        },
        moduleStates: { ...state.moduleStates, forge: 'processing' },
      }));

      const generate: GenerateFn | undefined = hasLLM
        ? async (messages, cfg) => {
            const soul = injectCreed(messages);
            const addendum = buildSystemAddendum({
              conscienceState: get().conscience,
              championPrompt: get().championPrompt,
              heartContext: heartSnapshotFromConsciousness(get().consciousness),
            });
            const packed = applySystemAddendum(soul, addendum);
            return await llmGenerate(packed, cfg);
          }
        : undefined;

      let best = await evaluateSeed(createSeedCandidate(seed), adaptive.suite, seed, generate, {
        strictEvalMode,
        verifierFirst,
        onVerifierCheck: (check) => {
          set((state: any) => ({
            forge: {
              ...state.forge,
              verifierChecks: [...state.forge.verifierChecks.slice(-199), check],
            },
          }));
        },
      });
      set((state: any) => ({
        forge: {
          ...state.forge,
          bestCandidate: best,
          logs: [...state.forge.logs, `Seed candidate scored ${(best.score * 100).toFixed(1)}%.`],
        },
      }));

      for (let generation = 1; generation <= config.maxGenerations; generation += 1) {
        const live = get().forge;
        if (live.phase !== 'running') break;

        const elapsedMs = Date.now() - startTime;
        if (elapsedMs >= config.maxDurationMs) {
          set((state: any) => ({
            forge: {
              ...state.forge,
              phase: 'completed',
              finishedAt: Date.now(),
              stopReason: `Time budget reached (${Math.round(config.maxDurationMs / 1000)}s).`,
              logs: [...state.forge.logs, 'Stopped: time budget reached.'],
            },
            moduleStates: { ...state.moduleStates, forge: 'online' },
          }));
          return;
        }

        set((state: any) => ({
          forge: {
            ...state.forge,
            logs: [...state.forge.logs, `G${generation}: Evaluating candidates${hasLLM ? ' via LLM' : ''}...`],
          },
        }));

        const { candidates, report } = await evaluateGeneration({
          parent: best,
          generation,
          config,
          suite: live.baselineSuite,
          seed,
          generate,
          strictEvalMode,
          verifierFirst,
          onVerifierCheck: (check) => {
            set((state: any) => ({
              forge: {
                ...state.forge,
                verifierChecks: [...state.forge.verifierChecks.slice(-199), check],
              },
            }));
          },
          shouldStop: () => get().forge.phase !== 'running',
        });
        const leader = candidates[0];
        if (leader && leader.score > best.score) {
          best = leader;
        }

        set((state: any) => ({
          forge: {
            ...state.forge,
            bestCandidate: best,
            currentGeneration: generation,
            generations: [...state.forge.generations, report],
            logs: [
              ...state.forge.logs,
              `G${generation}: best ${(report.bestScore * 100).toFixed(1)}% | avg ${(report.averageScore * 100).toFixed(1)}%.`,
            ],
          },
        }));

        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 120);
        });
      }

      const latest = get().forge;
      const wasCancelled = latest.phase === 'cancelled';
      set((state: any) => ({
        forge: {
          ...state.forge,
          phase: wasCancelled ? 'cancelled' : 'completed',
          finishedAt: Date.now(),
          stopReason: wasCancelled ? state.forge.stopReason : 'Completed configured generation budget.',
          logs: wasCancelled ? state.forge.logs : [...state.forge.logs, 'FORGE completed all configured generations.'],
        },
        moduleStates: { ...state.moduleStates, forge: 'online' },
      }));
    },

    cancelForge: () => {
      const phase = get().forge.phase;
      if (phase !== 'running') return;
      set((state: any) => ({
        forge: {
          ...state.forge,
          phase: 'cancelled',
          finishedAt: Date.now(),
          stopReason: 'Cancelled by operator.',
          logs: [...state.forge.logs, 'FORGE cancelled by operator.'],
        },
        moduleStates: { ...state.moduleStates, forge: 'online' },
      }));
    },

    resetForge: () => {
      set((state: any) => ({
        forge: createDefaultForgeState(),
        moduleStates: { ...state.moduleStates, forge: 'online' },
      }));
    },

    setForgeStrictEvalMode: (enabled: boolean) => {
      set((state: any) => ({
        forge: { ...state.forge, strictEvalMode: enabled },
      }));
    },

    setForgeVerifierFirst: (enabled: boolean) => {
      set((state: any) => ({
        forge: { ...state.forge, verifierFirst: enabled },
      }));
    },
  };
}
