import type { StoreSet, StoreGet } from '../types';
import type {
  CognitiveStep,
  CognitivePhase,
  PendingConsentAction,
  ConsentMode,
  ConsentDecision,
  RollbackEntry,
  ReplayState,
  ExecutionTierLimit,
  RuntimeControlSyncState,
  RuntimeHealthSummary,
  CognitiveStartRequest,
} from '../../types';
import type { OwnerPolicy, AutonomyLevel } from '../../prime/policy';
import type { KernelAction, KernelExecutionResult } from '../../prime/kernel';
import type { RuntimeSignal } from '../../prime/observability';
import { createPrimeKernel } from '../../prime/kernel';
import { appendRuntimeSignal, createRuntimeSignal } from '../../prime/observability';
import { policySnapshotFromOwnerPolicy, createKernelActionId } from '../../prime/kernel-services';
import { buildReplayTimeline, clampReplayCursor } from '../../prime/replay';

// ─── Local types ─────────────────────────────────────────────────

interface CognitiveState {
  isActive: boolean;
  goal: string;
  steps: CognitiveStep[];
  phase: CognitivePhase;
  iteration: number;
  origin?: string;
  goalId?: string | null;
}

function createDefaultCognitiveState(): CognitiveState {
  return {
    isActive: false,
    goal: '',
    steps: [],
    phase: 'idle',
    iteration: 0,
    origin: undefined,
    goalId: null,
  };
}

function createDefaultReplayState(): ReplayState {
  return {
    loading: false,
    availableRuns: [],
    selectedRunId: null,
    selectedRunKind: null,
    steps: [],
    cursor: 0,
    isPlaying: false,
    speedMs: 700,
    status: 'idle',
    error: null,
  };
}

function createDefaultRuntimeControlSyncState(): RuntimeControlSyncState {
  return {
    syncing: false,
    lastSyncedAt: null,
    lastError: null,
  };
}

let replayTimer: number | null = null;

let messageCounter = 0;
function genId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

function logNonFatal(scope: string, error: unknown): void {
  console.warn(`[${scope}] non-fatal:`, error);
}

const primeKernel = createPrimeKernel();

export function createCognitiveSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── HANDS — Cognitive Agent (ReAct Loop) ──────────────
    cognitive: createDefaultCognitiveState(),
    pendingConsentActions: [] as PendingConsentAction[],
    rollbackEntries: [] as RollbackEntry[],
    replay: createDefaultReplayState(),
    runtimeControlSync: createDefaultRuntimeControlSyncState(),
    runtimeSignals: [] as RuntimeSignal[],
    runtimeHealth: null as RuntimeHealthSummary | null,
    kernelLastResult: null as KernelExecutionResult | null,
    consentMode: 'ask-first' as ConsentMode,
    executionTierLimit: 'high-risk' as ExecutionTierLimit,
    emergencyStopActive: false,

    startCognitive: (goal: CognitiveStartRequest) => {
      if (!window.api?.agent?.startCognitive) return;
      if (get().emergencyStopActive) return;

      const req: { goal: string; contextAddendum?: string; origin?: string; goalId?: string } =
        typeof goal === 'string'
          ? { goal }
          : {
              goal: goal.goal,
              contextAddendum: goal.contextAddendum,
              origin: goal.origin,
              goalId: goal.goalId,
            };

      set({
        cognitive: {
          isActive: true,
          goal: req.goal,
          steps: [],
          phase: 'observing',
          iteration: 0,
          origin: req.origin,
          goalId: req.goalId ?? null,
        },
        pendingConsentActions: [],
        moduleStates: { ...get().moduleStates, hands: 'processing' },
      });

      window.api.agent.removeAllListeners();

      const MAX_COGNITIVE_STEPS = 2000;
      const MAX_STEP_TEXT = 2400;
      const MAX_ACTION_IO = 4000;
      let stepFlushTimer: number | null = null;
      let stepBuffer: CognitiveStep[] = [];
      let rollbackRefreshTimer: number | null = null;

      const compactStep = (step: CognitiveStep): CognitiveStep => {
        const safe: any = { ...(step as any) };
        safe.content = typeof safe.content === 'string' ? safe.content.slice(0, MAX_STEP_TEXT) : safe.content;
        if (safe.actionResult && typeof safe.actionResult === 'object') {
          const ar: any = { ...safe.actionResult };
          if (typeof ar.output === 'string') ar.output = ar.output.slice(0, MAX_ACTION_IO);
          if (typeof ar.error === 'string') ar.error = ar.error.slice(0, MAX_ACTION_IO);
          safe.actionResult = ar;
        }
        if (safe.actionParams && typeof safe.actionParams === 'object') {
          const ap: any = { ...safe.actionParams };
          if (typeof ap.content === 'string') ap.content = ap.content.slice(0, 1200);
          if (typeof ap.text === 'string') ap.text = ap.text.slice(0, 1200);
          if (typeof ap.command === 'string') ap.command = ap.command.slice(0, 800);
          safe.actionParams = ap;
        }
        return safe as CognitiveStep;
      };

      const scheduleRollbackRefresh = () => {
        if (rollbackRefreshTimer !== null) return;
        rollbackRefreshTimer = window.setTimeout(() => {
          rollbackRefreshTimer = null;
          void get().refreshRollbacks();
        }, 400);
      };

      const flushSteps = () => {
        stepFlushTimer = null;
        if (stepBuffer.length === 0) return;
        const batch = stepBuffer;
        stepBuffer = [];

        set((state: any) => {
          const nextSteps = [...state.cognitive.steps, ...batch].slice(-MAX_COGNITIVE_STEPS);
          const thinkInc = batch.reduce((n: number, s: CognitiveStep) => n + (s.type === 'think' ? 1 : 0), 0);
          const last = batch[batch.length - 1];
          const nextPhase =
            last.type === 'think'
              ? 'thinking'
              : last.type === 'act'
                ? 'acting'
                : last.type === 'reflect'
                  ? 'reflecting'
                  : last.type === 'observe'
                    ? 'observing'
                    : state.cognitive.phase;
          return {
            cognitive: {
              ...state.cognitive,
              steps: nextSteps,
              phase: nextPhase,
              iteration: state.cognitive.iteration + thinkInc,
            },
          };
        });
      };

      const scheduleFlush = () => {
        if (stepFlushTimer !== null) return;
        stepFlushTimer = window.setTimeout(flushSteps, 50);
      };

      window.api.agent.onCognitiveStep((step: CognitiveStep) => {
        stepBuffer.push(compactStep(step));
        scheduleFlush();
        if ((step as any)?.rollbackId) scheduleRollbackRefresh();
      });

      window.api.agent.onConsentRequested((request: PendingConsentAction) => {
        set((state: any) => {
          const existing = state.pendingConsentActions.find((r: PendingConsentAction) => r.id === request.id);
          if (existing) return {};
          return {
            pendingConsentActions: [...state.pendingConsentActions, { ...request, status: 'pending' as const }].slice(
              -25,
            ),
          };
        });

        const mode = get().consentMode;
        if (mode === 'auto') {
          const decision: ConsentDecision = request.conscienceVerdict === 'refuse' ? 'denied' : 'approved';
          void get().resolveConsentAction(request.id, decision);
        }
      });

      window.api.agent.onCognitiveComplete((data: { success: boolean; summary: string; iterations: number }) => {
        if (stepFlushTimer !== null) {
          window.clearTimeout(stepFlushTimer);
          stepFlushTimer = null;
        }
        if (rollbackRefreshTimer !== null) {
          window.clearTimeout(rollbackRefreshTimer);
          rollbackRefreshTimer = null;
        }
        flushSteps();
        const completedAt = Date.now();
        const { goal, origin, goalId } = get().cognitive;
        const report = [
          data.success ? 'HANDS COMPLETE' : 'HANDS FAILED',
          `Goal: ${goal}`,
          `Iterations: ${data.iterations}`,
          data.summary ? `Summary: ${data.summary}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        set((state: any) => ({
          cognitive: {
            ...state.cognitive,
            isActive: false,
            phase: data.success ? 'complete' : 'failed',
          },
          pendingConsentActions: state.pendingConsentActions.map((r: PendingConsentAction) =>
            r.status === 'pending' ? { ...r, status: 'denied', resolvedAt: completedAt } : r,
          ),
          moduleStates: { ...state.moduleStates, hands: 'online' },
          messages: [
            ...state.messages,
            {
              id: genId(),
              role: 'assistant',
              content: report,
              timestamp: completedAt,
              sourceModule: 'hands',
            },
          ],
        }));

        if (goal) {
          const actSteps = get()
            .cognitive.steps.filter((s: CognitiveStep) => s.type === 'act' && s.actionResult?.success && s.actionType)
            .map((s: CognitiveStep) => s.actionType as string);
          const actionLog =
            actSteps.length > 0 ? `\nActions performed: ${actSteps.join(', ')}` : '\nNo actions were performed.';
          window.api?.memory
            ?.storeVector?.({
              content: `Procedure: ${goal}\nOutcome: ${data.success ? 'success' : 'fail'}${actionLog}\nSummary: ${String(data.summary || '').slice(0, 500)}`,
              type: 'procedural',
              source: 'hands-cognitive',
              importance: data.success ? 0.72 : 0.68,
              emotion: data.success ? 'focused' : 'concerned',
              tags: ['hands', 'procedure', data.success ? 'success' : 'fail'],
            })
            .catch((e: unknown) => logNonFatal('memory.storeHands', e));
        }

        if (origin === 'spark' && goalId) {
          set((state: any) => {
            const updatedGoals = state.spark.goals.goals.map((g: any) => {
              if (g.id !== goalId) return g;
              const nextProgress = data.success ? 1 : Math.max(0.05, g.progress);
              const nextStatus = data.success ? 'completed' : g.status;
              const evidenceLine = `hands_run:${data.success ? 'success' : 'fail'}:${String(data.summary || '').slice(0, 140)}`;
              return {
                ...g,
                progress: nextProgress,
                status: nextStatus,
                updatedAt: completedAt,
                evidence: [...g.evidence.slice(-30), evidenceLine].slice(-40),
              };
            });
            return {
              spark: {
                ...state.spark,
                goals: {
                  ...state.spark.goals,
                  goals: updatedGoals,
                  completedCount: state.spark.goals.completedCount + (data.success ? 1 : 0),
                },
                logs: [
                  ...state.spark.logs,
                  `[GOAL] Hands run ${data.success ? 'completed' : 'failed'} for goal ${goalId}.`,
                ].slice(-100),
              },
            };
          });
          window.api?.spark?.saveState?.(get().spark).catch((e: unknown) => logNonFatal('spark.saveState', e));
        }
      });

      window.api.agent.onError((data: any) => {
        if (stepFlushTimer !== null) {
          window.clearTimeout(stepFlushTimer);
          stepFlushTimer = null;
        }
        if (rollbackRefreshTimer !== null) {
          window.clearTimeout(rollbackRefreshTimer);
          rollbackRefreshTimer = null;
        }
        set((state: any) => ({
          cognitive: { ...state.cognitive, isActive: false, phase: 'failed' },
          pendingConsentActions: state.pendingConsentActions.map((r: PendingConsentAction) =>
            r.status === 'pending' ? { ...r, status: 'denied', resolvedAt: Date.now() } : r,
          ),
          moduleStates: { ...state.moduleStates, hands: 'online' },
        }));
        set((state: any) => ({
          messages: [
            ...state.messages,
            {
              id: genId(),
              role: 'system' as const,
              timestamp: Date.now(),
              content: `HANDS error: ${data?.message || 'Unknown error'}`,
            },
          ],
        }));
      });

      get()
        .syncRuntimeControls()
        .then(() => {
          window.api.agent.startCognitive(req);
          void get().refreshRollbacks();
        })
        .catch(() => {
          window.api.agent.startCognitive(req);
          void get().refreshRollbacks();
        });
    },

    killCognitive: () => {
      window.api?.agent?.killCognitive?.();
      set((state: any) => ({
        cognitive: { ...state.cognitive, isActive: false, phase: 'killed' },
        pendingConsentActions: state.pendingConsentActions.map((r: PendingConsentAction) =>
          r.status === 'pending' ? { ...r, status: 'denied', resolvedAt: Date.now() } : r,
        ),
        moduleStates: { ...state.moduleStates, hands: 'online' },
      }));
    },

    resetCognitive: () => {
      if (replayTimer) {
        window.clearInterval(replayTimer);
        replayTimer = null;
      }
      set({
        cognitive: createDefaultCognitiveState(),
        pendingConsentActions: [],
        replay: { ...get().replay, isPlaying: false, status: get().replay.steps.length > 0 ? 'paused' : 'idle' },
        moduleStates: { ...get().moduleStates, hands: 'online' },
      });
    },

    setConsentMode: (mode: ConsentMode) => {
      set((state: any) => ({
        consentMode: mode,
        sovereignPolicy: {
          ...state.sovereignPolicy,
          requireConsentForRiskyActions: mode !== 'auto',
        },
      }));
      void get().syncRuntimeControls();
    },

    setAutonomyLevel: (level: AutonomyLevel) => {
      set((state: any) => {
        const constrained: Partial<OwnerPolicy> = { autonomyLevel: level };
        if (level === 'manual') {
          constrained.allowAutonomousGoals = false;
          constrained.allowUnboundedLoops = false;
          constrained.requireConsentForRiskyActions = true;
        } else if (level === 'supervised') {
          constrained.allowAutonomousGoals = true;
          constrained.allowUnboundedLoops = false;
          constrained.requireConsentForRiskyActions = true;
        } else if (level === 'autonomous') {
          constrained.allowAutonomousGoals = true;
          constrained.allowUnboundedLoops = true;
          constrained.requireConsentForRiskyActions = true;
        }
        return {
          sovereignPolicy: { ...state.sovereignPolicy, ...constrained },
        };
      });
      void get().syncRuntimeControls();
    },

    setExecutionTierLimit: (limit: ExecutionTierLimit) => {
      set((state: any) => {
        const patch: Partial<OwnerPolicy> = {};
        if (limit === 'read-only') {
          patch.allowFileSystemWrites = false;
          patch.allowProcessExecution = false;
          patch.allowInputSimulation = false;
          patch.allowToolCreation = false;
        } else if (limit === 'reversible') {
          patch.allowFileSystemWrites = true;
          patch.allowProcessExecution = false;
          patch.allowInputSimulation = false;
          patch.allowToolCreation = false;
        } else {
          patch.allowFileSystemWrites = true;
          patch.allowProcessExecution = true;
          patch.allowInputSimulation = true;
          patch.allowToolCreation = true;
        }
        return {
          executionTierLimit: limit,
          sovereignPolicy: { ...state.sovereignPolicy, ...patch },
        };
      });
      void get().syncRuntimeControls();
    },

    triggerEmergencyStop: () => {
      if (!get().emergencyStopActive) {
        get().killCognitive();
        get().cancelGauntletAutoCycle();
        get().cancelGauntlet();
        get().cancelForge();
        get().killSovereign();
        get().sparkExtinguish();
        get().replayStop();
      }
      set((state: any) => ({
        emergencyStopActive: true,
        moduleStates: {
          ...state.moduleStates,
          hands: 'online',
          gauntlet: 'online',
          forge: 'online',
          sovereign: 'online',
          spark: 'online',
        },
      }));
      void get().syncRuntimeControls();
    },

    clearEmergencyStop: () => {
      set({ emergencyStopActive: false });
      void get().syncRuntimeControls();
    },

    syncRuntimeControls: async () => {
      const state = get();
      const payload = {
        autonomyLevel: state.sovereignPolicy.autonomyLevel,
        consentMode: state.consentMode,
        executionTierLimit: state.executionTierLimit,
        emergencyStopActive: state.emergencyStopActive,
        conscienceEnabled: state.sovereignPolicy.conscienceEnabled,
        requireConsentForRiskyActions: state.sovereignPolicy.requireConsentForRiskyActions,
        ethicalOverrideAllowed: state.sovereignPolicy.ethicalOverrideAllowed,
        allowNetworkCalls: state.sovereignPolicy.allowNetworkCalls,
        allowFileSystemWrites: state.sovereignPolicy.allowFileSystemWrites,
        allowProcessExecution: state.sovereignPolicy.allowProcessExecution,
        allowScreenCapture: state.sovereignPolicy.allowScreenCapture,
        allowInputSimulation: state.sovereignPolicy.allowInputSimulation,
        allowToolCreation: state.sovereignPolicy.allowToolCreation,
      };
      set((s: any) => ({
        runtimeControlSync: {
          ...s.runtimeControlSync,
          syncing: true,
          lastError: null,
        },
      }));
      try {
        const response = await window.api.agent.setRuntimeControls(payload);
        if (!response?.success) {
          throw new Error(response?.error || 'Failed to sync controls');
        }
        set({
          runtimeControlSync: {
            syncing: false,
            lastSyncedAt: Date.now(),
            lastError: null,
          },
        });
      } catch (e: any) {
        set((s: any) => ({
          runtimeControlSync: {
            ...s.runtimeControlSync,
            syncing: false,
            lastError: e?.message || 'Failed to sync controls',
          },
        }));
      }
    },

    loadRuntimeHealth: async () => {
      if (!window.api?.system?.healthSummary) return;
      try {
        const summary = await window.api.system.healthSummary();
        set((state: any) => ({
          runtimeHealth: summary,
          runtimeSignals: appendRuntimeSignal(
            state.runtimeSignals,
            createRuntimeSignal({
              source: 'main',
              code: 'runtime.healthSummary.loaded',
              severity: 'info',
              message: `Runtime health loaded (${summary.issues.length} issue classes)`,
              metadata: {
                totalAuditEntries: summary.totalAuditEntries,
                totalOrchestratorEvents: summary.totalOrchestratorEvents,
              },
            }),
          ),
        }));
      } catch (error) {
        set((state: any) => ({
          runtimeSignals: appendRuntimeSignal(
            state.runtimeSignals,
            createRuntimeSignal({
              source: 'renderer',
              code: 'runtime.healthSummary.error',
              severity: 'warn',
              message: 'Failed to load runtime health summary',
              metadata: {
                error: error instanceof Error ? error.message : String(error),
              },
            }),
          ),
        }));
      }
    },

    kernelDispatch: async (actionType: string, payload: Record<string, unknown> = {}) => {
      const state = get();
      const action: KernelAction = {
        id: createKernelActionId(),
        type: actionType,
        payload,
        source: 'renderer',
      };
      const result = await primeKernel.dispatch(
        action,
        { policy: policySnapshotFromOwnerPolicy(state.sovereignPolicy) },
        {
          audit: async () => undefined,
        },
      );

      set((s: any) => ({
        kernelLastResult: result,
        runtimeSignals: appendRuntimeSignal(
          s.runtimeSignals,
          createRuntimeSignal({
            source: 'kernel',
            code: result.ok ? 'kernel.action.ok' : 'kernel.action.blocked',
            severity: result.ok ? 'info' : 'error',
            message: result.ok
              ? `Kernel action executed: ${actionType}`
              : `Kernel action failed: ${result.error || actionType}`,
            correlationId: result.correlationId,
            metadata: {
              actionType,
              gate: result.gate?.blockReason || null,
              stage: result.stage,
            },
          }),
        ),
      }));
      return result;
    },

    resolveConsentAction: async (requestId: string, decision: ConsentDecision) => {
      const request = get().pendingConsentActions.find((r: PendingConsentAction) => r.id === requestId);
      if (!request || request.status !== 'pending') return;

      try {
        await window.api.agent.resolveConsent(requestId, decision);
      } catch {
        return;
      }
      set((state: any) => ({
        pendingConsentActions: state.pendingConsentActions.map((r: PendingConsentAction) =>
          r.id === requestId ? { ...r, status: decision, resolvedAt: Date.now() } : r,
        ),
      }));
    },

    refreshRollbacks: async () => {
      try {
        const result = await window.api.agent.listRollbacks();
        if (!result?.success) return;
        set({ rollbackEntries: Array.isArray(result.entries) ? result.entries : [] });
      } catch {
        // no-op to avoid disrupting cognitive loop
      }
    },

    executeRollback: async (rollbackId: string) => {
      try {
        await window.api.agent.executeRollback(rollbackId);
      } catch {
        // ignore and refresh for latest status
      } finally {
        await get().refreshRollbacks();
      }
    },

    replayLoadRuns: async () => {
      set((state: any) => ({ replay: { ...state.replay, loading: true, error: null } }));
      try {
        const response = await window.api.agent.replayListRuns();
        const runs = (response?.runs || []).filter((r: any) => r.kind === 'cognitive' || r.kind === 'gauntlet');
        set((state: any) => ({
          replay: {
            ...state.replay,
            loading: false,
            availableRuns: runs,
            status: state.replay.selectedRunId ? state.replay.status : 'idle',
          },
        }));
      } catch (e: any) {
        set((state: any) => ({
          replay: {
            ...state.replay,
            loading: false,
            error: e?.message || 'Failed to list replay runs',
            status: 'error',
          },
        }));
      }
    },

    replayLoadRun: async (runId: string) => {
      if (replayTimer) {
        window.clearInterval(replayTimer);
        replayTimer = null;
      }
      set((state: any) => ({ replay: { ...state.replay, loading: true, error: null, isPlaying: false } }));
      try {
        const response = await window.api.agent.replayLoadRun(runId);
        if (!response?.success || !response.run) {
          throw new Error(response?.error || 'Replay run not found');
        }
        const timeline = buildReplayTimeline(response.run);
        set((state: any) => ({
          replay: {
            ...state.replay,
            loading: false,
            selectedRunId: timeline.runId,
            selectedRunKind: timeline.kind,
            steps: timeline.steps,
            cursor: 0,
            status: timeline.steps.length > 0 ? 'ready' : 'error',
            error: timeline.steps.length > 0 ? null : 'No replayable steps in this run',
            isPlaying: false,
          },
        }));
      } catch (e: any) {
        set((state: any) => ({
          replay: {
            ...state.replay,
            loading: false,
            error: e?.message || 'Failed to load replay run',
            status: 'error',
            isPlaying: false,
          },
        }));
      }
    },

    replayNext: () => {
      set((state: any) => {
        const length = state.replay.steps.length;
        if (length === 0) return {};
        const next = clampReplayCursor(state.replay.cursor + 1, length);
        const atEnd = next >= length - 1;
        return {
          replay: {
            ...state.replay,
            cursor: next,
            status: atEnd ? 'complete' : 'ready',
            isPlaying: atEnd ? false : state.replay.isPlaying,
          },
        };
      });
    },

    replaySeek: (index: number) => {
      set((state: any) => {
        const length = state.replay.steps.length;
        if (length === 0) return {};
        const next = clampReplayCursor(index, length);
        return {
          replay: {
            ...state.replay,
            cursor: next,
            status: next >= length - 1 ? 'complete' : 'paused',
            isPlaying: false,
          },
        };
      });
      if (replayTimer) {
        window.clearInterval(replayTimer);
        replayTimer = null;
      }
    },

    replayTogglePlayPause: () => {
      const current = get().replay;
      if (current.steps.length === 0) return;
      if (current.isPlaying) {
        if (replayTimer) {
          window.clearInterval(replayTimer);
          replayTimer = null;
        }
        set((state: any) => ({ replay: { ...state.replay, isPlaying: false, status: 'paused' } }));
        return;
      }

      set((state: any) => ({ replay: { ...state.replay, isPlaying: true, status: 'playing' } }));
      replayTimer = window.setInterval(
        () => {
          const replay = get().replay;
          if (!replay.isPlaying) return;
          if (replay.cursor >= replay.steps.length - 1) {
            if (replayTimer) {
              window.clearInterval(replayTimer);
              replayTimer = null;
            }
            set((state: any) => ({ replay: { ...state.replay, isPlaying: false, status: 'complete' } }));
            return;
          }
          get().replayNext();
        },
        Math.max(120, current.speedMs),
      );
    },

    replayStop: () => {
      if (replayTimer) {
        window.clearInterval(replayTimer);
        replayTimer = null;
      }
      set((state: any) => ({
        replay: {
          ...state.replay,
          isPlaying: false,
          status: state.replay.steps.length > 0 ? 'paused' : 'idle',
        },
      }));
    },
  };
}
