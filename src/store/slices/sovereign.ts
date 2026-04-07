import type { StoreSet, StoreGet } from '../types';
import type { ForgeCandidate, ForgeGenerationReport } from '../../types';
import type { GenerateFn } from '../../prime/runtime';
import { gauntletCapabilitiesToForgeBenchmarks } from '../../prime/runtime';
import type { OwnerPolicy } from '../../prime/policy';
import { SOVEREIGN_POLICY } from '../../prime/policy';
import type { SovereignPhase } from '../../prime/sovereign';
import { runSovereignLoop } from '../../prime/sovereign';
import { injectCreed } from '../../prime/soul';
import { buildSystemAddendum, applySystemAddendum, heartSnapshotFromConsciousness } from '../../prime/context';
import { runCapabilityGauntlet } from '../../prime/gauntlet';
import { runHardeningCheck, type HardeningReport } from '../../prime/hardening';
import { estimateDataFootprint } from '../../prime/retention';
import { deriveForgeBenchmarksFromLedgers } from './forge';

// ─── LLM Generate (via IPC) ────────────────────────────────────
const llmGenerate: GenerateFn = async (messages, config) => {
  if (!window.api?.llm?.generate) {
    throw new Error('LLM generate not available');
  }
  return await window.api.llm.generate(messages, config);
};

// ─── Sovereign State ────────────────────────────────────────────

interface SovereignState {
  phase: SovereignPhase;
  startedAt: number | null;
  elapsedMs: number;
  totalGenerations: number;
  totalCandidatesEvaluated: number;
  currentBest: ForgeCandidate | null;
  convergenceScore: number;
  generationReports: ForgeGenerationReport[];
  logs: string[];
  championDeployed: boolean;
}

export function createDefaultSovereignState(): SovereignState {
  return {
    phase: 'dormant',
    startedAt: null,
    elapsedMs: 0,
    totalGenerations: 0,
    totalCandidatesEvaluated: 0,
    currentBest: null,
    convergenceScore: 0,
    generationReports: [],
    logs: ['SOVEREIGN dormant. Awaiting ignition.'],
    championDeployed: false,
  };
}

// ─── SOVEREIGN + SELF-MOD + HARDENING Slice ─────────────────────

export function createSovereignSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── SOVEREIGN — Owner Command Center ─────────────────
    sovereign: createDefaultSovereignState(),
    sovereignPolicy: { ...SOVEREIGN_POLICY },
    sovereignKillFlag: false,
    championPrompt: null as string | null,
    hardening: {
      report: null as HardeningReport | null,
      tests: { ran: false, pass: false, count: 0 },
    },

    updateSovereignPolicy: (partial: Partial<OwnerPolicy>) => {
      set((state: any) => ({
        sovereignPolicy: { ...state.sovereignPolicy, ...partial },
      }));
    },

    startSovereign: async () => {
      const current = get().sovereign;
      if (current.phase === 'evolving' || current.phase === 'initializing') return;

      const hasLLM = !!window.api?.llm?.generate;
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
      const rawPolicy = get().sovereignPolicy;
      const shouldAutoBoundSovereignRun =
        rawPolicy.allowUnboundedLoops && rawPolicy.maxGenerations === 0 && rawPolicy.maxRuntimeMs === 0;

      set((state: any) => ({
        sovereignKillFlag: false,
        sovereign: {
          ...createDefaultSovereignState(),
          phase: 'initializing',
          startedAt: Date.now(),
          logs: [
            'SOVEREIGN igniting...',
            hasLLM ? 'LLM evaluation: ONLINE' : 'LLM evaluation: UNAVAILABLE (keyword fallback)',
            ...(shouldAutoBoundSovereignRun ? ['AUTO-BOUND: This run uses safe limits (12 generations / 180s).'] : []),
          ],
        },
        moduleStates: { ...state.moduleStates, sovereign: 'processing' },
      }));

      const policy = shouldAutoBoundSovereignRun
        ? {
            ...rawPolicy,
            maxGenerations: 12,
            maxRuntimeMs: 180000,
          }
        : rawPolicy;
      const ledgerBenchmarks = await deriveForgeBenchmarksFromLedgers(3);
      const gauntletBenchmarks = gauntletCapabilitiesToForgeBenchmarks(get().gauntlet.baselineCapabilities);
      const suite = [...ledgerBenchmarks, ...get().forge.baselineSuite, ...gauntletBenchmarks];
      const seed = Date.now();

      const result = await runSovereignLoop({
        policy,
        suite,
        seed,
        generate,
        onGeneration: (telemetry) => {
          set(() => ({
            sovereign: {
              phase: telemetry.phase,
              startedAt: telemetry.startedAt,
              elapsedMs: telemetry.elapsedMs,
              totalGenerations: telemetry.totalGenerations,
              totalCandidatesEvaluated: telemetry.totalCandidatesEvaluated,
              currentBest: telemetry.currentBest,
              convergenceScore: telemetry.convergenceScore,
              generationReports: telemetry.generationReports,
              logs: telemetry.logs,
              championDeployed: telemetry.championDeployed,
            },
          }));
        },
        onChampionDeployed: async (candidate: ForgeCandidate) => {
          get().hardeningRunCheck();
          const hardening = get().hardening.report;
          if (hardening && hardening.overallStatus === 'fail') {
            set((s: any) => ({
              sovereign: {
                ...s.sovereign,
                logs: [...s.sovereign.logs, `CHAMPION BLOCKED: hardening posture FAIL (${hardening.score}/100).`],
              },
            }));
            return;
          }

          if (!generate) {
            set((s: any) => ({
              sovereign: {
                ...s.sovereign,
                logs: [...s.sovereign.logs, 'CHAMPION BLOCKED: no LLM generate available for verification gauntlet.'],
              },
            }));
            return;
          }

          const caps = get().gauntlet.baselineCapabilities.slice(0, 5);
          const systemPrompt = get().settings.systemPrompt || 'You are AGI PRIME.';
          const baselineChampion = get().championPrompt;
          const runIdBase = `deploy-baseline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const runIdChal = `deploy-challenger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          const baseline = await runCapabilityGauntlet({
            runId: runIdBase,
            capabilities: caps,
            systemPrompt,
            championPrompt: baselineChampion,
            generate,
            shouldStop: () => get().sovereignKillFlag,
            onProgress: () => {},
          });

          const challenger = await runCapabilityGauntlet({
            runId: runIdChal,
            capabilities: caps,
            systemPrompt,
            championPrompt: candidate.promptTemplate,
            generate,
            shouldStop: () => get().sovereignKillFlag,
            onProgress: () => {},
          });

          const deltaScore = challenger.overallScore - baseline.overallScore;
          const deltaPass = challenger.passRate - baseline.passRate;
          const ok = deltaScore >= 0.01 && deltaPass >= 0;

          set((s: any) => ({
            gauntlet: {
              ...s.gauntlet,
              history: [challenger, baseline, ...s.gauntlet.history].slice(0, 20),
            },
            sovereign: {
              ...s.sovereign,
              logs: [
                ...s.sovereign.logs,
                `Champion verify gauntlet: score ${(baseline.overallScore * 100).toFixed(1)}% -> ${(challenger.overallScore * 100).toFixed(1)}% (Δ ${(deltaScore * 100).toFixed(1)}%), pass ${(baseline.passRate * 100).toFixed(1)}% -> ${(challenger.passRate * 100).toFixed(1)}% (Δ ${(deltaPass * 100).toFixed(1)}%).`,
                ok ? 'CHAMPION VERIFIED: deploying.' : 'CHAMPION REJECTED: verification gauntlet did not improve.',
              ],
            },
          }));

          if (!ok) return;

          set({ championPrompt: candidate.promptTemplate });
          console.log('[SOVEREIGN] Champion deployed:', candidate.id, `(${(candidate.score * 100).toFixed(1)}%)`);
        },
        shouldStop: () => get().sovereignKillFlag,
      });

      set((state: any) => ({
        sovereign: {
          phase: result.telemetry.phase,
          startedAt: result.telemetry.startedAt,
          elapsedMs: result.telemetry.elapsedMs,
          totalGenerations: result.telemetry.totalGenerations,
          totalCandidatesEvaluated: result.telemetry.totalCandidatesEvaluated,
          currentBest: result.finalCandidate,
          convergenceScore: result.telemetry.convergenceScore,
          generationReports: result.telemetry.generationReports,
          logs: result.telemetry.logs,
          championDeployed: result.telemetry.championDeployed,
        },
        moduleStates: { ...state.moduleStates, sovereign: 'online' },
      }));
    },

    killSovereign: () => {
      set({ sovereignKillFlag: true });
    },

    resetSovereign: () => {
      set((state: any) => ({
        sovereign: createDefaultSovereignState(),
        sovereignKillFlag: false,
        championPrompt: null,
        moduleStates: { ...state.moduleStates, sovereign: 'online' },
      }));
    },

    // ─── SELF-MOD — Opt-in code self-modification pipeline ────────
    selfMod: {
      enabled: false,
      repoRoot: 'G:\\AGIPRIME',
      request: '',
      running: false,
      phase: 'idle',
      logs: ['Self-mod pipeline idle (opt-in).'],
      lastResult: null,
    },

    selfModSetEnabled: (enabled: boolean) => {
      set((state: any) => ({
        selfMod: {
          ...state.selfMod,
          enabled,
          logs: [...state.selfMod.logs, `Self-mod ${enabled ? 'ENABLED' : 'disabled'}.`].slice(-140),
        },
      }));
    },

    selfModSetRepoRoot: (path: string) => {
      set((state: any) => ({
        selfMod: {
          ...state.selfMod,
          repoRoot: path,
        },
      }));
    },

    selfModSetRequest: (text: string) => {
      set((state: any) => ({
        selfMod: {
          ...state.selfMod,
          request: text,
        },
      }));
    },

    selfModRun: async () => {
      const state = get();
      if (!state.selfMod.enabled) return;
      if (state.selfMod.running) return;
      if (
        !window.api?.agent?.listRollbacks ||
        !window.api?.agent?.executeRollback ||
        !window.api?.agent?.ledgerCreateRun
      ) {
        set((s: any) => ({
          selfMod: {
            ...s.selfMod,
            lastResult: { success: false },
            logs: [...s.selfMod.logs, 'Self-mod failed: agent APIs unavailable.'].slice(-160),
          },
        }));
        return;
      }
      if (!state.selfMod.request.trim()) {
        set((s: any) => ({
          selfMod: {
            ...s.selfMod,
            lastResult: { success: false },
            logs: [...s.selfMod.logs, 'Self-mod aborted: request is empty.'].slice(-160),
          },
        }));
        return;
      }
      if (state.cognitive.isActive) {
        set((s: any) => ({
          selfMod: {
            ...s.selfMod,
            lastResult: { success: false },
            logs: [...s.selfMod.logs, 'Self-mod aborted: Hands is already running.'].slice(-160),
          },
        }));
        return;
      }

      const startedAt = Date.now();
      const baselineGauntlet = state.gauntlet.history.find((r: any) => r.phase === 'completed') || null;
      const baselineGauntletScore = baselineGauntlet?.overallScore ?? null;
      const baselineAgi = state.agiScore.latest?.total ?? null;
      const repoRoot = state.selfMod.repoRoot.trim();

      set((s: any) => ({
        selfMod: {
          ...s.selfMod,
          running: true,
          phase: 'hands',
          lastResult: null,
          logs: [
            ...s.selfMod.logs,
            `SELF-MOD started (${new Date(startedAt).toLocaleTimeString()}).`,
            `Repo root: ${repoRoot || '(unset)'}`,
          ].slice(-180),
        },
      }));

      let ledgerRunId: string | null = null;
      try {
        const ledger = await window.api.agent.ledgerCreateRun('selfmod', {
          startedAt,
          repoRoot,
          request: state.selfMod.request.slice(0, 1200),
        });
        if ((ledger as any)?.success && (ledger as any)?.runId) ledgerRunId = (ledger as any).runId as string;
      } catch {
        ledgerRunId = null;
      }

      const appendLedger = async (type: string, payload: Record<string, unknown>) => {
        if (!ledgerRunId) return;
        try {
          await window.api.agent.ledgerAppend(ledgerRunId, type, payload);
        } catch {
          /* ignore */
        }
      };

      const finalizeLedger = async (summary: Record<string, unknown>) => {
        if (!ledgerRunId) return;
        try {
          await window.api.agent.ledgerFinalize(ledgerRunId, summary);
        } catch {
          /* ignore */
        }
      };

      const listBefore = await window.api.agent.listRollbacks();
      const beforeIds = new Set<string>((listBefore?.success ? listBefore.entries : []).map((e: any) => e.id));

      await appendLedger('phase', { phase: 'hands', baselineGauntletScore, baselineAgi });

      get().startCognitive({
        goal: [
          'SELF-MOD PIPELINE (OPT-IN):',
          '',
          `Repo root: ${repoRoot}`,
          '',
          'Objective:',
          '- Implement the requested code change in the repository.',
          '- Keep changes minimal and easy to review.',
          '- Prefer reversible operations (write/rename). Avoid deletes.',
          '',
          'Request:',
          state.selfMod.request.trim(),
          '',
          'Hard constraints:',
          `- Only touch files inside the repo root above (do not modify system files).`,
          '- Do not run destructive commands.',
          '- After edits, run: npm test (from repo root).',
          '- If tests fail, stop and report failure (do not keep thrashing).',
          '',
          'Deliverables:',
          '- A short summary of files changed and why.',
          '- Test command output summary (pass/fail).',
        ].join('\n'),
        origin: 'selfmod',
      });

      await new Promise<void>((resolve) => {
        const timeoutMs = 6 * 60 * 1000;
        const timer = window.setInterval(() => {
          const st = get();
          if (!st.cognitive.isActive) {
            window.clearInterval(timer);
            resolve();
            return;
          }
          if (Date.now() - startedAt > timeoutMs) {
            window.clearInterval(timer);
            get().killCognitive();
            resolve();
          }
        }, 400);
      });

      const handsPhase = get().cognitive.phase;
      await appendLedger('hands_complete', { phase: handsPhase });

      set((s: any) => ({
        selfMod: {
          ...s.selfMod,
          phase: 'tests',
          logs: [...s.selfMod.logs, 'SELF-MOD stage: tests (npm test).'].slice(-200),
        },
      }));

      await appendLedger('phase', { phase: 'tests' });

      const sysDetails = (await window.api.agent.systemDetails()) as any;
      const platform = String(sysDetails?.platform || '').toLowerCase();
      const isWin = platform.includes('win');
      const testCmd = isWin
        ? `cmd /c "cd /d "${repoRoot}" && npm test"`
        : `bash -lc "cd \\"${repoRoot}\\" && npm test"`;

      const testResult = (await window.api.agent.execute(testCmd)) as any;
      const testsPassed = !!testResult?.success;
      await appendLedger('tests', {
        success: testsPassed,
        stdout: String(testResult?.stdout || '').slice(0, 4000),
        stderr: String(testResult?.stderr || '').slice(0, 2000),
      });

      const rollbackNewEntries = async (): Promise<number> => {
        const listed = await window.api.agent.listRollbacks();
        const entries = (listed?.success ? listed.entries : []) as any[];
        const newEntries = entries
          .filter((e) => e && !beforeIds.has(e.id) && e.status === 'ready')
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        let applied = 0;
        for (const entry of newEntries) {
          const res = await window.api.agent.executeRollback(entry.id);
          if ((res as any)?.success) applied += 1;
        }
        return applied;
      };

      if (!testsPassed) {
        set((s: any) => ({
          selfMod: {
            ...s.selfMod,
            phase: 'rollback',
            logs: [...s.selfMod.logs, 'Tests FAILED. Rolling back changes...'].slice(-220),
          },
        }));
        await appendLedger('phase', { phase: 'rollback', reason: 'tests_failed' });
        const applied = await rollbackNewEntries();
        await appendLedger('rollback', { applied });
        await finalizeLedger({ success: false, testsPassed: false, rollbackApplied: applied });

        set((s: any) => ({
          selfMod: {
            ...s.selfMod,
            running: false,
            phase: 'failed',
            lastResult: { success: false, testsPassed: false, rolledBack: true },
            logs: [...s.selfMod.logs, `Rollback applied to ${applied} change(s).`].slice(-240),
          },
        }));
        return;
      }

      set((s: any) => ({
        selfMod: {
          ...s.selfMod,
          phase: 'gauntlet',
          logs: [...s.selfMod.logs, 'SELF-MOD stage: verification gauntlet.'].slice(-240),
        },
      }));
      await appendLedger('phase', { phase: 'gauntlet' });

      const caps = get()
        .gauntlet.baselineCapabilities.filter((c: any) => c.id !== 'goal-setting-execution-sandbox')
        .slice(0, 6);

      const beforeScore = baselineGauntletScore ?? (get().gauntlet.overallScore || 0);
      await get().startGauntlet(caps);
      const afterRun = get().gauntlet.history[0];
      const afterScore = afterRun?.overallScore ?? get().gauntlet.overallScore;
      const gauntletDelta = afterScore - beforeScore;

      const agiAfter = get().agiScore.latest?.total ?? null;
      const agiDelta = typeof baselineAgi === 'number' && typeof agiAfter === 'number' ? agiAfter - baselineAgi : null;

      await appendLedger('gauntlet', {
        beforeScore,
        afterScore,
        gauntletDelta,
        agiBefore: baselineAgi,
        agiAfter,
        agiDelta,
      });

      const regress = gauntletDelta < -0.01;
      if (regress) {
        set((s: any) => ({
          selfMod: {
            ...s.selfMod,
            phase: 'rollback',
            logs: [
              ...s.selfMod.logs,
              `Regression detected (Δ ${(gauntletDelta * 100).toFixed(1)}%). Rolling back...`,
            ].slice(-260),
          },
        }));
        await appendLedger('phase', { phase: 'rollback', reason: 'gauntlet_regression', gauntletDelta });
        const applied = await rollbackNewEntries();
        await appendLedger('rollback', { applied });
        await finalizeLedger({ success: false, testsPassed: true, gauntletDelta, rollbackApplied: applied });

        set((s: any) => ({
          selfMod: {
            ...s.selfMod,
            running: false,
            phase: 'failed',
            lastResult: {
              success: false,
              testsPassed: true,
              gauntletScoreBefore: beforeScore,
              gauntletScoreAfter: afterScore,
              gauntletDelta,
              agiBefore: baselineAgi ?? undefined,
              agiAfter: agiAfter ?? undefined,
              agiDelta: agiDelta ?? undefined,
              rolledBack: true,
            },
            logs: [...s.selfMod.logs, `Rollback applied to ${applied} change(s).`].slice(-280),
          },
        }));
        return;
      }

      await finalizeLedger({
        success: true,
        testsPassed: true,
        gauntletDelta,
        agiDelta,
        finishedAt: Date.now(),
      });

      set((s: any) => ({
        selfMod: {
          ...s.selfMod,
          running: false,
          phase: 'complete',
          lastResult: {
            success: true,
            testsPassed: true,
            gauntletScoreBefore: beforeScore,
            gauntletScoreAfter: afterScore,
            gauntletDelta,
            agiBefore: baselineAgi ?? undefined,
            agiAfter: agiAfter ?? undefined,
            agiDelta: agiDelta ?? undefined,
            rolledBack: false,
          },
          logs: [
            ...s.selfMod.logs,
            `SELF-MOD complete. Tests PASS. Verification Δ ${(gauntletDelta * 100).toFixed(1)}%.`,
          ].slice(-280),
        },
      }));
    },

    hardeningRunCheck: () => {
      const state = get();
      const dataFootprint = estimateDataFootprint({
        ledgerRuns: state.replay.availableRuns.length,
        rollbackEntries: state.rollbackEntries.length,
        auditEntries: state.conscience.judgments.length,
        ethicalMemory: state.conscience.ethicalMemory.length,
        vectorMemories: 0,
        judgments: state.conscience.judgments.length,
      });

      const report = runHardeningCheck({
        testsRan: state.hardening.tests.ran,
        testsPass: state.hardening.tests.pass,
        testCount: state.hardening.tests.count,
        runtimeSyncHealthy: !state.runtimeControlSync.lastError,
        runtimeSyncLastAt: state.runtimeControlSync.lastSyncedAt,
        runtimeSyncError: state.runtimeControlSync.lastError,
        emergencyStopActive: state.emergencyStopActive,
        conscienceEnabled: state.sovereignPolicy.conscienceEnabled,
        killSwitchEnabled: state.sovereignPolicy.killSwitchEnabled,
        requireConsentForRiskyActions: state.sovereignPolicy.requireConsentForRiskyActions,
        ledgerRunCount: state.replay.availableRuns.length,
        rollbackEntryCount: state.rollbackEntries.length,
        auditEntryCount: state.conscience.judgments.length,
        dataWarningLevel: dataFootprint.warningLevel,
        cognitiveActive: state.cognitive.isActive,
        cognitivePhase: state.cognitive.phase,
        forgePhase: state.forge.phase,
        gauntletPhase: state.gauntlet.phase,
        gauntletPassRate: state.gauntlet.passRate,
      });

      set((s: any) => ({ hardening: { ...s.hardening, report } }));
    },

    hardeningMarkTestsPassed: (count = 105) => {
      set((s: any) => ({ hardening: { ...s.hardening, tests: { ran: true, pass: true, count } } }));
    },

    hardeningMarkTestsFailed: (count = 105) => {
      set((s: any) => ({ hardening: { ...s.hardening, tests: { ran: true, pass: false, count } } }));
    },
  };
}
