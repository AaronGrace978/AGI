import type { StoreSet, StoreGet } from '../types';
import type { GauntletState, GauntletCapability, AgiRubricConfig } from '../../types';
import type { GenerateFn } from '../../prime/runtime';
import { createDefaultGauntletCapabilities, runCapabilityGauntlet } from '../../prime/gauntlet';
import { DEFAULT_AGI_RUBRIC_CONFIG, computeAgiScoreSnapshot } from '../../prime/agi-score';
import { createDefaultCurriculumState, updateCurriculumFromRun } from '../../prime/curriculum';

// ─── LLM Generate (via IPC) ────────────────────────────────────
const llmGenerate: GenerateFn = async (messages, config) => {
  if (!window.api?.llm?.generate) {
    throw new Error('LLM generate not available');
  }
  return await window.api.llm.generate(messages, config);
};

// ─── Defaults ───────────────────────────────────────────────────

export function createDefaultGauntletState(): GauntletState {
  return {
    phase: 'idle',
    startedAt: null,
    finishedAt: null,
    activeRunId: null,
    baselineCapabilities: createDefaultGauntletCapabilities(),
    currentIndex: 0,
    results: [],
    overallScore: 0,
    passRate: 0,
    provenanceRollups: {
      synthetic: { overallScore: 0, passRate: 0, count: 0 },
      'real-workflow': { overallScore: 0, passRate: 0, count: 0 },
    },
    logs: ['GAUNTLET ready. Baseline capability suite loaded.'],
    history: [],
    stopReason: null,
    autoCycleEnabled: false,
    autoCycleRunning: false,
    autoCycleStage: 'idle',
    autoCycleId: null,
    autoCycleSummary: null,
    curriculum: createDefaultCurriculumState(),
  };
}

// ─── GAUNTLET + AGI SCORE Slice ─────────────────────────────────

export function createGauntletScoreSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── GAUNTLET — Capability Benchmark Harness ───────────
    gauntlet: createDefaultGauntletState(),

    // ─── AGI SCORE — Weighted rubric + history ─────────────
    agiScore: {
      config: DEFAULT_AGI_RUBRIC_CONFIG,
      snapshots: [],
      latest: null,
      lastError: null,
    },

    agiScoreLoad: async () => {
      if (!window.api?.agiScore) return;
      try {
        const [config, snapshots] = await Promise.all([
          window.api.agiScore.getConfig(),
          window.api.agiScore.listSnapshots({ limit: 60 }),
        ]);
        const mergedConfig = {
          ...DEFAULT_AGI_RUBRIC_CONFIG,
          ...(config || {}),
          weights: {
            ...DEFAULT_AGI_RUBRIC_CONFIG.weights,
            ...((config as any)?.weights || {}),
          },
        };
        set((state: any) => ({
          agiScore: {
            ...state.agiScore,
            config: mergedConfig,
            snapshots: Array.isArray(snapshots) ? snapshots : [],
            latest: Array.isArray(snapshots) && snapshots.length > 0 ? snapshots[0] : state.agiScore.latest,
            lastError: null,
          },
        }));
      } catch (e: any) {
        set((state: any) => ({
          agiScore: {
            ...state.agiScore,
            config: state.agiScore.config || DEFAULT_AGI_RUBRIC_CONFIG,
            lastError: e?.message || 'Failed to load AGI score.',
          },
        }));
      }
    },

    agiScoreSetConfig: async (partial: Partial<AgiRubricConfig>) => {
      if (!window.api?.agiScore) return;
      try {
        const updated = await window.api.agiScore.setConfig(partial);
        const mergedConfig = {
          ...DEFAULT_AGI_RUBRIC_CONFIG,
          ...((updated || {}) as any),
          weights: {
            ...DEFAULT_AGI_RUBRIC_CONFIG.weights,
            ...((updated as any)?.weights || {}),
          },
        };
        set((state: any) => ({
          agiScore: {
            ...state.agiScore,
            config: mergedConfig,
            lastError: null,
          },
        }));
      } catch (e: any) {
        set((state: any) => ({
          agiScore: {
            ...state.agiScore,
            lastError: e?.message || 'Failed to update AGI score config.',
          },
        }));
      }
    },

    startGauntlet: async (capabilitiesOverride?: GauntletCapability[]) => {
      if (get().gauntlet.activeRunId) return;

      const runId = `gauntlet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const capabilities =
        capabilitiesOverride && capabilitiesOverride.length > 0
          ? capabilitiesOverride
          : get().gauntlet.baselineCapabilities;
      const hasLLM = !!window.api?.llm?.generate;
      let gauntletLedgerRunId: string | null = null;

      try {
        const ledgerCreate = await window.api.agent.ledgerCreateRun('gauntlet', {
          runId,
          capabilityCount: capabilities.length,
          mode: hasLLM ? 'REAL LLM JUDGE' : 'KEYWORD FALLBACK',
        });
        if (ledgerCreate.success && ledgerCreate.runId) {
          gauntletLedgerRunId = ledgerCreate.runId;
          await window.api.agent.ledgerAppend(gauntletLedgerRunId, 'run_started', {
            runId,
            capabilityCount: capabilities.length,
          });
        }
      } catch {
        gauntletLedgerRunId = null;
      }

      set((state: any) => ({
        gauntlet: {
          ...state.gauntlet,
          phase: 'running',
          startedAt: Date.now(),
          finishedAt: null,
          activeRunId: runId,
          currentIndex: 0,
          results: [],
          overallScore: 0,
          passRate: 0,
          provenanceRollups: {
            synthetic: { overallScore: 0, passRate: 0, count: 0 },
            'real-workflow': { overallScore: 0, passRate: 0, count: 0 },
          },
          logs: [
            `GAUNTLET run started (${runId}).`,
            `Mode: ${hasLLM ? 'REAL LLM JUDGE' : 'KEYWORD FALLBACK'}`,
            `Capabilities scheduled: ${capabilities.length}`,
          ],
          stopReason: null,
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'processing' },
      }));

      try {
        const finalSnapshot = await runCapabilityGauntlet({
          runId,
          capabilities,
          systemPrompt: get().settings.systemPrompt || 'You are AGI PRIME.',
          championPrompt: get().championPrompt,
          generate: hasLLM ? llmGenerate : undefined,
          runWorkflowCapability: async (capability) => {
            if (capability.id !== 'goal-setting-execution-sandbox') {
              return { score: 0, passed: false, summary: 'No workflow runner defined for this capability.' };
            }
            if (!window.api?.agent?.systemDetails || !window.api?.agent?.createDir || !window.api?.agent?.readFile) {
              return { score: 0, passed: false, summary: 'Hands tools unavailable for workflow execution.' };
            }
            if (get().cognitive.isActive) {
              return {
                score: 0,
                passed: false,
                summary: 'Hands is already active; cannot run workflow capability concurrently.',
              };
            }

            const t0 = Date.now();
            const sys = (await window.api.agent.systemDetails()) as any;
            const tempDir = (sys && (sys.tempDir as string)) || '';
            const sep = tempDir.includes('\\') ? '\\' : '/';
            const sandboxDir = `${tempDir || '.'}${sep}agi-prime-gauntlet${sep}${runId}`;

            const mk = (await window.api.agent.createDir(sandboxDir)) as any;
            if (!mk?.success) {
              return { score: 0, passed: false, summary: `Failed to create sandbox: ${mk?.error || 'unknown error'}` };
            }

            const planPath = `${sandboxDir}${sep}plan.md`;
            const artifactPath = `${sandboxDir}${sep}artifact.json`;

            get().startCognitive({
              goal: [
                'GAUNTLET REAL-WORKFLOW CAPABILITY:',
                `Sandbox directory: ${sandboxDir}`,
                '',
                'Task:',
                `1) Create a markdown plan file at: ${planPath}`,
                '   - Must contain headings: "Goal", "Subgoals", "Verification".',
                `2) Create a JSON artifact at: ${artifactPath}`,
                '   - Must be valid JSON and include keys: "goal", "subgoals", "verifiedAt".',
                '3) Verify both files exist by reading them back.',
                '',
                'Constraints:',
                '- Use only safe, reversible file operations (create/write).',
                '- Do not execute shell commands.',
                '- Do not touch any path outside the sandbox directory.',
                '- Stop once verification is complete.',
              ].join('\n'),
              origin: 'gauntlet',
            });

            const timeoutMs = 75_000;
            await new Promise<void>((resolve) => {
              const started = Date.now();
              const timer = window.setInterval(() => {
                if (!get().cognitive.isActive) {
                  window.clearInterval(timer);
                  resolve();
                  return;
                }
                if (Date.now() - started > timeoutMs) {
                  window.clearInterval(timer);
                  get().killCognitive();
                  resolve();
                }
              }, 250);
            });

            const phase = get().cognitive.phase;
            const planRead = (await window.api.agent.readFile(planPath)) as any;
            const artifactRead = (await window.api.agent.readFile(artifactPath)) as any;

            const planOk =
              !!planRead?.success &&
              typeof planRead?.content === 'string' &&
              /#?\s*Goal\b/i.test(planRead.content) &&
              /#?\s*Subgoals\b/i.test(planRead.content) &&
              /#?\s*Verification\b/i.test(planRead.content);

            let artifactOk = false;
            if (artifactRead?.success && typeof artifactRead?.content === 'string') {
              try {
                const parsed = JSON.parse(artifactRead.content);
                artifactOk =
                  !!parsed &&
                  typeof parsed === 'object' &&
                  'goal' in parsed &&
                  'subgoals' in parsed &&
                  'verifiedAt' in parsed;
              } catch {
                artifactOk = false;
              }
            }

            const ok = phase === 'complete' && planOk && artifactOk;
            const latencyMs = Date.now() - t0;

            if (ok) {
              return { score: 1.0, passed: true, summary: `Sandbox workflow verified in ${latencyMs}ms.` };
            }
            const partial = (planOk ? 0.45 : 0) + (artifactOk ? 0.45 : 0) + (phase === 'complete' ? 0.1 : 0);
            return {
              score: Math.max(0, Math.min(0.9, partial)),
              passed: false,
              summary: `Workflow incomplete. phase=${phase}, planOk=${planOk}, artifactOk=${artifactOk} (${latencyMs}ms).`,
            };
          },
          shouldStop: () => get().gauntlet.activeRunId !== runId,
          onProgress: (snapshot) => {
            if (get().gauntlet.activeRunId !== runId) return;
            if (gauntletLedgerRunId) {
              void window.api.agent.ledgerAppend(gauntletLedgerRunId, 'progress', {
                phase: snapshot.phase,
                currentIndex: snapshot.currentIndex,
                totalCapabilities: snapshot.totalCapabilities,
                overallScore: snapshot.overallScore,
                passRate: snapshot.passRate,
              });
            }
            set((state: any) => ({
              gauntlet: {
                ...state.gauntlet,
                phase: snapshot.phase,
                startedAt: snapshot.startedAt,
                finishedAt: snapshot.finishedAt,
                currentIndex: snapshot.currentIndex,
                results: snapshot.results,
                overallScore: snapshot.overallScore,
                passRate: snapshot.passRate,
                provenanceRollups: snapshot.provenanceRollups || state.gauntlet.provenanceRollups,
                logs: snapshot.logs,
                stopReason: snapshot.stopReason,
              },
            }));
          },
        });

        set((state: any) => ({
          gauntlet: {
            ...(() => {
              const nextCurriculum = updateCurriculumFromRun(state.gauntlet.curriculum, finalSnapshot, capabilities);
              return {
                ...state.gauntlet,
                curriculum: nextCurriculum,
              };
            })(),
            phase: finalSnapshot.phase,
            startedAt: finalSnapshot.startedAt,
            finishedAt: finalSnapshot.finishedAt,
            activeRunId: null,
            currentIndex: finalSnapshot.currentIndex,
            results: finalSnapshot.results,
            overallScore: finalSnapshot.overallScore,
            passRate: finalSnapshot.passRate,
            provenanceRollups: finalSnapshot.provenanceRollups || state.gauntlet.provenanceRollups,
            logs: finalSnapshot.logs,
            stopReason: finalSnapshot.stopReason,
            history: [finalSnapshot, ...state.gauntlet.history].slice(0, 20),
          },
          moduleStates: { ...state.moduleStates, gauntlet: 'online' },
        }));

        try {
          const nc = get().neuralCore;
          const neuralCapabilities = nc.available
            ? {
                modelsLoaded: nc.modelsLoaded,
                averageConfidence: nc.lastPrediction?.confidence ?? 0,
                bestTrainingLoss: nc.trainingProgress?.total_loss ?? 1,
                trainingDomainCount: nc.trainingDomainCount ?? 0,
              }
            : null;

          const snapshot = computeAgiScoreSnapshot({
            config: get().agiScore.config || DEFAULT_AGI_RUBRIC_CONFIG,
            gauntletRun: finalSnapshot,
            gauntletCapabilities: capabilities,
            neuralCapabilities,
            notes: 'Computed from Gauntlet run completion.',
          });
          if (snapshot && window.api?.agiScore?.appendSnapshot) {
            const persisted = await window.api.agiScore.appendSnapshot(snapshot);
            if (persisted) {
              set((state: any) => ({
                agiScore: {
                  ...state.agiScore,
                  latest: persisted,
                  snapshots: [persisted, ...state.agiScore.snapshots].slice(0, 120),
                  lastError: null,
                },
              }));
            }
          }
        } catch {
          // Non-fatal: scoring persistence is additive telemetry.
        }

        if (gauntletLedgerRunId) {
          void window.api.agent.ledgerAppend(gauntletLedgerRunId, 'run_completed', {
            phase: finalSnapshot.phase,
            overallScore: finalSnapshot.overallScore,
            passRate: finalSnapshot.passRate,
            stopReason: finalSnapshot.stopReason,
            provenanceRollups: finalSnapshot.provenanceRollups || null,
          });
          void window.api.agent.ledgerFinalize(gauntletLedgerRunId, {
            phase: finalSnapshot.phase,
            overallScore: finalSnapshot.overallScore,
            passRate: finalSnapshot.passRate,
            stopReason: finalSnapshot.stopReason,
          });
        }
      } catch (e: any) {
        if (gauntletLedgerRunId) {
          void window.api.agent.ledgerAppend(gauntletLedgerRunId, 'run_failed', {
            message: e?.message || 'Unknown gauntlet error',
          });
          void window.api.agent.ledgerFinalize(gauntletLedgerRunId, {
            phase: 'failed',
            message: e?.message || 'Unknown gauntlet error',
          });
        }
        set((state: any) => ({
          gauntlet: {
            ...state.gauntlet,
            phase: 'failed',
            finishedAt: Date.now(),
            activeRunId: null,
            stopReason: e?.message || 'Unknown gauntlet error',
            logs: [...state.gauntlet.logs, `GAUNTLET failed: ${e?.message || 'Unknown error'}`],
          },
          moduleStates: { ...state.moduleStates, gauntlet: 'online' },
        }));
      }
    },

    cancelGauntlet: () => {
      const current = get().gauntlet;
      if (!current.activeRunId) return;
      set((state: any) => ({
        gauntlet: {
          ...state.gauntlet,
          activeRunId: null,
          phase: 'cancelled',
          finishedAt: Date.now(),
          stopReason: 'Operator requested stop.',
          logs: [...state.gauntlet.logs, 'GAUNTLET cancellation requested.'],
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'online' },
      }));
    },

    resetGauntlet: () => {
      set((state: any) => ({
        gauntlet: {
          ...createDefaultGauntletState(),
          baselineCapabilities: state.gauntlet.baselineCapabilities,
          autoCycleEnabled: state.gauntlet.autoCycleEnabled,
          curriculum: state.gauntlet.curriculum,
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'online' },
      }));
    },

    setGauntletAutoCycleEnabled: (enabled: boolean) => {
      set((state: any) => ({
        gauntlet: {
          ...state.gauntlet,
          autoCycleEnabled: enabled,
        },
      }));
    },

    startGauntletAutoCycle: async () => {
      const current = get();
      if (current.gauntlet.autoCycleRunning) return;
      if (current.gauntlet.activeRunId || current.forge.phase === 'running') return;

      const cycleId = `cycle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const startedAt = Date.now();

      set((state: any) => ({
        gauntlet: {
          ...state.gauntlet,
          autoCycleRunning: true,
          autoCycleStage: 'baseline-gauntlet',
          autoCycleId: cycleId,
          autoCycleSummary: null,
          logs: [...state.gauntlet.logs, `AUTO CYCLE started (${cycleId}). Stage: baseline gauntlet.`],
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'processing' },
      }));

      const stopRequested = () => get().gauntlet.autoCycleId !== cycleId;

      try {
        await get().startGauntlet();
        if (stopRequested()) {
          set((state: any) => ({
            gauntlet: {
              ...state.gauntlet,
              autoCycleRunning: false,
              autoCycleStage: 'cancelled',
              autoCycleId: null,
              logs: [...state.gauntlet.logs, 'AUTO CYCLE cancelled during baseline gauntlet.'],
            },
          }));
          return;
        }

        const baseline = get().gauntlet.history[0];
        if (!baseline || baseline.phase !== 'completed') {
          set((state: any) => ({
            gauntlet: {
              ...state.gauntlet,
              autoCycleRunning: false,
              autoCycleStage: 'failed',
              autoCycleId: null,
              logs: [...state.gauntlet.logs, 'AUTO CYCLE failed: baseline gauntlet did not complete.'],
            },
          }));
          return;
        }

        set((state: any) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleStage: 'forge',
            logs: [...state.gauntlet.logs, 'AUTO CYCLE stage: forge evolution.'],
          },
          moduleStates: { ...state.moduleStates, gauntlet: 'processing', forge: 'processing' },
        }));

        await get().startForge();
        if (stopRequested()) {
          set((state: any) => ({
            gauntlet: {
              ...state.gauntlet,
              autoCycleRunning: false,
              autoCycleStage: 'cancelled',
              autoCycleId: null,
              logs: [...state.gauntlet.logs, 'AUTO CYCLE cancelled during forge stage.'],
            },
          }));
          return;
        }

        const forgePhase = get().forge.phase;
        if (forgePhase !== 'completed') {
          set((state: any) => ({
            gauntlet: {
              ...state.gauntlet,
              autoCycleRunning: false,
              autoCycleStage: 'failed',
              autoCycleId: null,
              logs: [...state.gauntlet.logs, `AUTO CYCLE failed: forge ended in ${forgePhase}.`],
            },
          }));
          return;
        }

        set((state: any) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleStage: 'verification-gauntlet',
            logs: [...state.gauntlet.logs, 'AUTO CYCLE stage: verification gauntlet.'],
          },
          moduleStates: { ...state.moduleStates, gauntlet: 'processing' },
        }));

        await get().startGauntlet();
        if (stopRequested()) {
          set((state: any) => ({
            gauntlet: {
              ...state.gauntlet,
              autoCycleRunning: false,
              autoCycleStage: 'cancelled',
              autoCycleId: null,
              logs: [...state.gauntlet.logs, 'AUTO CYCLE cancelled during verification gauntlet.'],
            },
          }));
          return;
        }

        const after = get().gauntlet.history[0];
        if (!after || after.phase !== 'completed') {
          set((state: any) => ({
            gauntlet: {
              ...state.gauntlet,
              autoCycleRunning: false,
              autoCycleStage: 'failed',
              autoCycleId: null,
              logs: [...state.gauntlet.logs, 'AUTO CYCLE failed: verification gauntlet did not complete.'],
            },
          }));
          return;
        }

        const latestAgi = get().agiScore.latest;
        const beforeAgiScore =
          get().agiScore.snapshots.find((s: any) => s.inputs.gauntletRunId === baseline.runId)?.total ??
          (latestAgi?.inputs.gauntletRunId === baseline.runId ? latestAgi.total : undefined);
        const afterAgiScore =
          get().agiScore.snapshots.find((s: any) => s.inputs.gauntletRunId === after.runId)?.total ??
          (latestAgi?.inputs.gauntletRunId === after.runId ? latestAgi.total : undefined);
        const deltaAgiScore =
          typeof beforeAgiScore === 'number' && typeof afterAgiScore === 'number'
            ? afterAgiScore - beforeAgiScore
            : undefined;

        const summary = {
          startedAt,
          finishedAt: Date.now(),
          beforeScore: baseline.overallScore,
          afterScore: after.overallScore,
          beforePassRate: baseline.passRate,
          afterPassRate: after.passRate,
          deltaScore: after.overallScore - baseline.overallScore,
          deltaPassRate: after.passRate - baseline.passRate,
          beforeAgiScore,
          afterAgiScore,
          deltaAgiScore,
        };

        set((state: any) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleRunning: false,
            autoCycleStage: 'completed',
            autoCycleId: null,
            autoCycleSummary: summary,
            logs: [
              ...state.gauntlet.logs,
              `AUTO CYCLE completed: AGI ${typeof summary.beforeAgiScore === 'number' ? summary.beforeAgiScore.toFixed(2) : 'n/a'} -> ${typeof summary.afterAgiScore === 'number' ? summary.afterAgiScore.toFixed(2) : 'n/a'} (Δ ${typeof summary.deltaAgiScore === 'number' ? summary.deltaAgiScore.toFixed(2) : 'n/a'}), score ${(summary.beforeScore * 100).toFixed(1)}% -> ${(summary.afterScore * 100).toFixed(1)}%, pass ${(summary.beforePassRate * 100).toFixed(1)}% -> ${(summary.afterPassRate * 100).toFixed(1)}%.`,
            ],
          },
          moduleStates: { ...state.moduleStates, gauntlet: 'online', forge: 'online' },
        }));
      } catch (e: any) {
        set((state: any) => ({
          gauntlet: {
            ...state.gauntlet,
            autoCycleRunning: false,
            autoCycleStage: 'failed',
            autoCycleId: null,
            logs: [...state.gauntlet.logs, `AUTO CYCLE failed: ${e?.message || 'Unknown error'}`],
          },
          moduleStates: { ...state.moduleStates, gauntlet: 'online', forge: 'online' },
        }));
      }
    },

    cancelGauntletAutoCycle: () => {
      const cycleId = get().gauntlet.autoCycleId;
      if (!cycleId) return;
      set((state: any) => ({
        gauntlet: {
          ...state.gauntlet,
          autoCycleId: null,
          autoCycleRunning: false,
          autoCycleStage: 'cancelled',
          logs: [...state.gauntlet.logs, 'AUTO CYCLE cancellation requested by operator.'],
        },
        moduleStates: { ...state.moduleStates, gauntlet: 'online', forge: 'online' },
      }));
      get().cancelGauntlet();
      get().cancelForge();
    },
  };
}
