import type { StoreSet, StoreGet } from '../types';
import type { ChatMessage, SparkState, SparkGoal, Conversation, MemoryConsolidationState } from '../../types';
import {
  createDefaultSparkState,
  runSparkCycle,
  runDeepThought,
  runLightCycle,
  runMediumCycle,
  createGoal,
} from '../../prime/spark';
import { stepMetabolism } from '../../prime/autonomy-metabolism';
import { adaptGenomeFromSignal } from '../../prime/cognitive-genome';
import { applyEcologyAction } from '../../prime/embodied-ecology';
import { createInitialHorizonPlan, advanceHorizonPlan } from '../../prime/horizon';
import { consolidateEpisodes } from '../../prime/memory-consolidation';
import { runNightlyReconsolidation as runNightlyReconsolidationPass } from '../../prime/reconsolidation';
import { deriveTransferHeuristicsFromProceduralMemories } from '../../prime/transfer-learning';
import { buildSystemAddendum, heartSnapshotFromConsciousness } from '../../prime/context';
import { generateSpontaneousThought, shouldSingSpontaneously } from '../../prime/voice';
import type { GenerateFn } from '../../prime/runtime';
import {
  runLearningSession,
  selectQuestionForResearch,
  canRunSession,
  setActive as setLearnerActive,
  isActive as isLearnerActive,
  getStats as getLearnerStats,
  updateConfig as updateLearnerConfig,
} from '../../prime/autonomous-learner';
import type { LearnerStats, LearnerConfig } from '../../prime/autonomous-learner';
import { mergeWorldModelIncremental } from '../../prime/world-model';

// ─── Utilities ──────────────────────────────────────────────────
let messageCounter = 0;

function logNonFatal(scope: string, error: unknown): void {
  console.warn(`[${scope}] non-fatal:`, error);
}

function genId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

type PendingConsolidationEpisode = MemoryConsolidationState['pendingEpisodes'][number];

function formatPredictionForMemory(value: SparkState['temporal']['activePredictions'][number]['prediction']): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable prediction]';
  }
}

function buildConsolidationEpisode(source: string, content: string, importance: number): PendingConsolidationEpisode {
  return {
    id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: content.slice(0, 700),
    source,
    importance: Math.max(0.2, Math.min(0.98, importance)),
    timestamp: Date.now(),
  };
}

function buildSparkLearningEpisodes(
  previous: SparkState,
  next: SparkState,
  source: string,
): PendingConsolidationEpisode[] {
  const episodes: PendingConsolidationEpisode[] = [];

  const entityDelta = next.worldModel.entities.length - previous.worldModel.entities.length;
  const relationDelta = next.worldModel.relations.length - previous.worldModel.relations.length;
  if (entityDelta > 0 || relationDelta > 0) {
    episodes.push(
      buildConsolidationEpisode(
        source,
        `World model expanded: +${Math.max(0, entityDelta)} entities, +${Math.max(0, relationDelta)} relations. Total is now ${next.worldModel.entities.length} entities and ${next.worldModel.relations.length} relations.`,
        0.72,
      ),
    );
  }

  const prevPredById = new Map(previous.temporal.activePredictions.map((p) => [p.id, p]));
  for (const pred of next.temporal.activePredictions) {
    const prev = prevPredById.get(pred.id);
    const resolvedNow = pred.resolved && (!prev || !prev.resolved);
    if (!resolvedNow || pred.wasCorrect === undefined) continue;
    const predText = formatPredictionForMemory(pred.prediction);
    episodes.push(
      buildConsolidationEpisode(
        source,
        `Prediction resolved: "${predText.slice(0, 180)}" => ${pred.wasCorrect ? 'correct' : 'incorrect'} at ${(pred.confidence * 100).toFixed(0)}% confidence.`,
        pred.wasCorrect ? 0.76 : 0.84,
      ),
    );
  }

  const prevBlindSpots = new Set(previous.metacognition.blindSpots);
  const newBlindSpots = next.metacognition.blindSpots.filter((b) => !prevBlindSpots.has(b));
  for (const blindSpot of newBlindSpots.slice(-2)) {
    episodes.push(buildConsolidationEpisode(source, `New blind spot detected: ${blindSpot.slice(0, 220)}`, 0.86));
  }

  const prevModIds = new Set(previous.selfmod.modifications.map((m) => m.id));
  for (const mod of next.selfmod.modifications) {
    if (prevModIds.has(mod.id)) continue;
    episodes.push(
      buildConsolidationEpisode(
        source,
        `Self-mod proposal (${mod.type}): ${mod.description.slice(0, 220)} | score ${mod.scoreBefore.toFixed(2)} -> ${mod.scoreAfter.toFixed(2)}.`,
        0.78,
      ),
    );
  }

  const prevGoalById = new Map(previous.goals.goals.map((g) => [g.id, g]));
  for (const goal of next.goals.goals) {
    const prev = prevGoalById.get(goal.id);
    if (goal.status === 'completed' && prev?.status !== 'completed') {
      episodes.push(buildConsolidationEpisode(source, `Goal completed: ${goal.description.slice(0, 220)}.`, 0.88));
    }
  }

  if (
    next.metacognition.totalPredictions > previous.metacognition.totalPredictions &&
    Math.abs(next.metacognition.calibrationScore - previous.metacognition.calibrationScore) > 0.04
  ) {
    episodes.push(
      buildConsolidationEpisode(
        source,
        `Calibration shifted from ${(previous.metacognition.calibrationScore * 100).toFixed(0)}% to ${(next.metacognition.calibrationScore * 100).toFixed(0)}% after prediction feedback.`,
        0.74,
      ),
    );
  }

  return episodes.slice(-6);
}

function enqueueSparkLearningEpisodes(
  set: StoreSet,
  get: StoreGet,
  previous: SparkState,
  next: SparkState,
  source: string,
): void {
  const episodes = buildSparkLearningEpisodes(previous, next, source);
  if (episodes.length === 0) return;

  set((state: any) => ({
    memoryConsolidation: {
      ...state.memoryConsolidation,
      pendingEpisodes: [...state.memoryConsolidation.pendingEpisodes, ...episodes].slice(-160),
      logs: [
        ...state.memoryConsolidation.logs,
        `Learning loop (${source}): queued ${episodes.length} episode(s).`,
      ].slice(-80),
    },
    sparkLiveLog: [...state.sparkLiveLog.slice(-49), `[LearnLoop] ${source}: +${episodes.length} episode(s) queued`],
  }));

  const memState = get().memoryConsolidation;
  const urgent = episodes.some((ep) => ep.importance >= 0.85);
  if (memState.enabled && (memState.pendingEpisodes.length >= 10 || urgent)) {
    get()
      .runMemoryConsolidation()
      .catch((e: unknown) => logNonFatal('memory.consolidation.trigger', e));
  }
}

const llmGenerate: GenerateFn = async (messages, config) => {
  if (!window.api?.llm?.generate) {
    throw new Error('LLM generate not available');
  }
  return await window.api.llm.generate(messages, config);
};

// ─── Spark Slice ────────────────────────────────────────────────
export function createSparkSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── SPARK — Cognitive Architecture ──────────────────
    spark: createDefaultSparkState(),
    memoryConsolidation: {
      enabled: true,
      pendingEpisodes: [],
      lastRunAt: null,
      totalRuns: 0,
      promotedSemantic: 0,
      promotedProcedural: 0,
      contradictionsDetected: 0,
      duplicatesSuppressed: 0,
      lowSignalDropped: 0,
      avgQualityScore: 0,
      precisionProxy: 0,
      recallProxy: 0,
      heuristicsBoosted: 0,
      logs: ['Memory consolidation pipeline ready.'],
    },
    sparkLiveLog: [] as string[],
    sparkHeartbeatId: null as number | null,
    sparkBusy: false,
    sparkAutonomy: {
      lastHandsDispatchAt: null as number | null,
      cooldownMs: 5 * 60 * 1000,
    },

    // ─── Autonomous Learner ─────────────────────────────────
    learnerActive: false,
    learnerStats: null as LearnerStats | null,
    learnerLastLog: [] as string[],

    setLearnerActive: (active: boolean) => {
      setLearnerActive(active);
      set({ learnerActive: active });
      set((s: any) => ({
        sparkLiveLog: [
          ...s.sparkLiveLog.slice(-49),
          active ? '📚 Autonomous Learner ACTIVATED' : '📚 Autonomous Learner deactivated',
        ],
      }));
    },

    getLearnerStats: (): LearnerStats | null => {
      try {
        return getLearnerStats();
      } catch {
        return null;
      }
    },

    updateLearnerConfig: (partial: Partial<LearnerConfig>) => {
      updateLearnerConfig(partial);
    },

    triggerLearningSession: async () => {
      const state = get();
      if (!isLearnerActive()) return;
      if (!window.api?.agent?.webFetch || !window.api?.agent?.webSearch) return;
      if (!window.api?.llm?.generate) return;

      const question = selectQuestionForResearch(state.spark.curiosity.questions);
      if (!question) return;

      set((s: any) => ({
        sparkLiveLog: [...s.sparkLiveLog.slice(-49), `📚 Learning: "${question.question.slice(0, 80)}..."`],
      }));

      try {
        const session = await runLearningSession(
          question,
          state.spark.worldModel,
          llmGenerate,
          (url: string, opts?: Record<string, unknown>) => window.api.agent.webFetch(url, opts),
          (q: string, opts?: Record<string, unknown>) => window.api.agent.webSearch(q, opts),
          (msg: string) => {
            set((s: any) => ({
              sparkLiveLog: [...s.sparkLiveLog.slice(-50), `  📖 ${msg}`],
            }));
          },
        );

        if (session.status === 'complete' && session.extractedKnowledge.entities.length > 0) {
          set((s: any) => {
            const merged = mergeWorldModelIncremental({
              current: s.spark.worldModel,
              incomingEntities: session.extractedKnowledge.entities,
              incomingRelations: session.extractedKnowledge.relations,
            });
            return {
              spark: {
                ...s.spark,
                worldModel: merged,
                curiosity: {
                  ...s.spark.curiosity,
                  questions: s.spark.curiosity.questions.map((q: any) =>
                    q.id === question.id ? { ...q, status: 'answered' as const } : q,
                  ),
                  totalQuestionsAnswered: s.spark.curiosity.totalQuestionsAnswered + 1,
                },
                logs: [
                  ...s.spark.logs,
                  `[LEARNER] Acquired: +${session.extractedKnowledge.entities.length}E / +${session.extractedKnowledge.relations.length}R from "${question.question.slice(0, 60)}"`,
                ].slice(-100),
              },
              learnerStats: getLearnerStats(),
              learnerLastLog: session.log.slice(-20),
              sparkLiveLog: [
                ...s.sparkLiveLog.slice(-49),
                `📚 Learned +${session.extractedKnowledge.entities.length} entities, +${session.extractedKnowledge.relations.length} relations`,
              ],
            };
          });

          window.api?.spark?.saveState?.(get().spark).catch((e: unknown) => logNonFatal('spark.saveState.learner', e));
        } else {
          set((s: any) => ({
            learnerLastLog: session.log.slice(-20),
            sparkLiveLog: [...s.sparkLiveLog.slice(-49), `📚 Learning session: no new knowledge extracted`],
          }));
        }
      } catch (e) {
        logNonFatal('autonomousLearner', e);
        set((s: any) => ({
          sparkLiveLog: [...s.sparkLiveLog.slice(-49), `📚 Learning session error: ${e}`],
        }));
      }
    },

    sparkIgnite: () => {
      const existing = get().sparkHeartbeatId;
      if (existing !== null) return;

      const pickAutonomousHandsGoal = (spark: SparkState): SparkGoal | null => {
        const candidates = spark.goals.goals
          .filter((g) => g.status === 'active')
          .sort((a, b) => b.priority - a.priority || a.progress - b.progress || a.updatedAt - b.updatedAt);
        for (const g of candidates) {
          const lastDispatch = [...g.evidence].reverse().find((e) => e.startsWith('hands_dispatch:'));
          if (!lastDispatch) return g;
          const parts = lastDispatch.split(':');
          const ts = Number(parts[1] || 0);
          if (!Number.isFinite(ts)) return g;
          if (Date.now() - ts > Math.max(10 * 60 * 1000, get().sparkAutonomy.cooldownMs)) return g;
        }
        return null;
      };

      const maybeDispatchAutonomousHands = (spark: SparkState) => {
        const st = get();
        const policy = st.sovereignPolicy;
        if (!policy.allowAutonomousGoals) return;
        if (st.emergencyStopActive) return;
        if (st.cognitive.isActive) return;
        if (spark.metabolism.circadianPhase === 'sleep') return;
        if (spark.metabolism.energyBudget < 0.4) return;
        if (st.consciousness.trust < policy.minimumTrustForAutonomousRisk) return;
        const last = st.sparkAutonomy.lastHandsDispatchAt;
        if (last && Date.now() - last < st.sparkAutonomy.cooldownMs) return;

        const goal = pickAutonomousHandsGoal(spark);
        if (!goal) return;

        const dispatchedAt = Date.now();
        set((state: any) => ({
          sparkAutonomy: { ...state.sparkAutonomy, lastHandsDispatchAt: dispatchedAt },
          spark: {
            ...state.spark,
            goals: {
              ...state.spark.goals,
              goals: state.spark.goals.goals.map((g: SparkGoal) =>
                g.id !== goal.id
                  ? g
                  : {
                      ...g,
                      updatedAt: dispatchedAt,
                      evidence: [...g.evidence.slice(-30), `hands_dispatch:${dispatchedAt}`].slice(-40),
                    },
              ),
            },
            logs: [...state.spark.logs, `[AUTONOMY] Dispatched goal to HANDS: ${goal.description.slice(0, 90)}`].slice(
              -100,
            ),
          },
        }));
        window.api?.spark?.saveState?.(get().spark).catch((e: unknown) => logNonFatal('spark.saveState', e));

        const contextAddendum = buildSystemAddendum({
          conscienceState: st.conscience,
          championPrompt: st.championPrompt,
          heartContext: heartSnapshotFromConsciousness(st.consciousness),
        });
        st.startCognitive({
          goal: goal.description,
          origin: 'spark',
          goalId: goal.id,
          contextAddendum: `${contextAddendum}\n\nAUTONOMY NOTE: This task was spawned by Spark. Prefer reversible actions; ask for consent when risk is non-trivial.`,
        });
      };

      set((state: any) => ({
        spark: {
          ...state.spark,
          thermo: { ...state.spark.thermo, ignited: true },
          phase: 'running',
          active: true,
        },
        sparkLiveLog: [...state.sparkLiveLog, '🔥 SPARK IGNITED — Thermodynamic loop active'],
      }));

      const heartbeatId = window.setInterval(async () => {
        const state = get();
        if (!state.spark.thermo.ignited) return;

        get().presenceTick();

        if (state.sparkBusy) return;

        const now = Date.now();
        const thermo = state.spark.thermo;
        const hasLLM = !!window.api?.llm?.generate;
        const previousPhase = state.spark.metabolism.circadianPhase;
        const nextMetabolism = stepMetabolism(state.spark.metabolism, {
          cognitiveLoad: Math.max(0.15, state.spark.thermo.temperature),
          novelty: state.spark.curiosity.curiosityScore,
          riskExposure: 1 - Number(state.spark.ecology.worldState.signalStrength || 0.5),
          triggerSleep: false,
        });
        if (
          nextMetabolism.circadianPhase !== previousPhase ||
          nextMetabolism.energyBudget !== state.spark.metabolism.energyBudget
        ) {
          set((s: any) => ({
            spark: {
              ...s.spark,
              metabolism: nextMetabolism,
            },
          }));
        }
        if (previousPhase !== 'sleep' && nextMetabolism.circadianPhase === 'sleep') {
          get()
            .runNightlyReconsolidation()
            .catch((e: unknown) => logNonFatal('memory.nightlyReconsolidation', e));

          const nc = get().neuralCore;
          if (nc.available && nc.trainingStatus !== 'training') {
            get()
              .neuralTrain()
              .catch((e: unknown) => logNonFatal('neural.autoTrain', e));
          }
        }
        const sleepMode = nextMetabolism.circadianPhase === 'sleep';

        // DEEP CYCLE: every ~10 min (if LLM available)
        const deepInterval = 600000;
        if (!sleepMode && hasLLM && now - thermo.lastDeepCycle > deepInterval && thermo.cyclesLight >= 3) {
          const prevSpark = state.spark;
          set({ sparkBusy: true });
          try {
            const nextState = await runDeepThought(get().spark, llmGenerate, (msg: string) => {
              set((s: any) => ({ sparkLiveLog: [...s.sparkLiveLog.slice(-50), msg] }));
            });
            nextState.thermo.lastDeepCycle = now;
            nextState.thermo.cyclesDeep++;
            nextState.thermo.temperature = Math.min(1, nextState.thermo.temperature + 0.1);
            set({ spark: nextState });
            enqueueSparkLearningEpisodes(set, get, prevSpark, nextState, 'autonomy:deep');
            window.api?.spark?.saveState?.(nextState).catch((e: unknown) => logNonFatal('spark.saveState', e));
            maybeDispatchAutonomousHands(nextState);

            // Autonomous learning: after deep thought generates curiosity questions, try to answer one
            if (
              isLearnerActive() &&
              canRunSession() &&
              nextState.curiosity.questions.some((q: any) => q.status === 'open')
            ) {
              get()
                .triggerLearningSession()
                .catch((e: unknown) => logNonFatal('autonomousLearner.auto', e));
            }
          } catch {
            // non-fatal
          }
          set({ sparkBusy: false });
          return;
        }

        // MEDIUM CYCLE: every 90s (if LLM available)
        const mediumInterval = 90000;
        if (!sleepMode && hasLLM && now - thermo.lastMediumCycle > mediumInterval && thermo.cyclesLight >= 1) {
          const prevSpark = state.spark;
          set({ sparkBusy: true });
          try {
            const nextState = await runMediumCycle(get().spark, llmGenerate, (msg: string) => {
              set((s: any) => ({ sparkLiveLog: [...s.sparkLiveLog.slice(-50), msg] }));
            });
            set({ spark: nextState });
            enqueueSparkLearningEpisodes(set, get, prevSpark, nextState, 'autonomy:medium');
            window.api?.spark?.saveState?.(nextState).catch((e: unknown) => logNonFatal('spark.saveState', e));

            const presenceMode = get().voiceState.presence.mode;
            const thoughtChance = presenceMode === 'living' ? 1.0 : 0.6;
            if (Math.random() < thoughtChance) {
              try {
                const thought = await generateSpontaneousThought(nextState, llmGenerate);
                if (thought) {
                  const proactiveMsg: ChatMessage = {
                    id: genId(),
                    role: 'assistant',
                    content: thought,
                    timestamp: Date.now(),
                    sourceModule: 'spark',
                    emotion: nextState.soul.currentEmotion,
                    thinking: true,
                  };
                  set((s: any) => ({
                    messages: [...s.messages, proactiveMsg],
                  }));

                  const convState = get();
                  if (convState.activeConversationId && window.api?.conversations?.save) {
                    window.api.conversations
                      .save({
                        id: convState.activeConversationId,
                        title: convState.activeConversationTitle || 'New chat',
                        createdAt: convState.activeConversationCreatedAt || Date.now(),
                        updatedAt: Date.now(),
                        messages: convState.messages,
                      } as Conversation)
                      .catch((e: unknown) => logNonFatal('conversations.save.sparkCycle', e));
                  }

                  const vState = get().voiceState;
                  if (vState.enabled && !vState.isSpeaking) {
                    get().voiceSpeak(thought, 'spontaneous');
                    set((s: any) => ({
                      voiceState: {
                        ...s.voiceState,
                        presence: { ...s.voiceState.presence, lastThoughtAt: Date.now() },
                      },
                    }));
                  }
                }
              } catch {
                // non-fatal
              }
            }

            // ─── SPONTANEOUS SINGING ──────
            if (presenceMode === 'living') {
              const vState = get().voiceState;
              const cfg = get().settings;
              const singingEnabled = cfg.singingEnabled ?? true;
              const minGapSeconds = cfg.singingMinGapSeconds ?? 300;
              const minGapOk = Date.now() - (vState.presence.lastThoughtAt || 0) > minGapSeconds * 1000;
              if (
                singingEnabled &&
                vState.enabled &&
                !vState.isSinging &&
                !vState.isSpeaking &&
                minGapOk &&
                shouldSingSpontaneously(nextState, vState.songCount, vState.presence.lastThoughtAt)
              ) {
                get().voiceSing();
              }
            }

            maybeDispatchAutonomousHands(nextState);
          } catch {
            // non-fatal
          }
          set({ sparkBusy: false });
          return;
        }

        // LIGHT CYCLE: every ~30s (no LLM, always available)
        const lightInterval = 30000;
        if (now - thermo.lastLightCycle > lightInterval) {
          const prevSpark = state.spark;
          const nextState = runLightCycle(get().spark);
          set({ spark: nextState });
          enqueueSparkLearningEpisodes(set, get, prevSpark, nextState, 'autonomy:light');
          if (nextState.thermo.cyclesLight % 5 === 0) {
            window.api?.spark?.saveState?.(nextState).catch((e: unknown) => logNonFatal('spark.saveState', e));
          }
          if (nextState.thermo.cyclesLight % 8 === 0) {
            get()
              .runMemoryConsolidation()
              .catch((e: unknown) => logNonFatal('memory.consolidation.lightCycle', e));
          }

          maybeDispatchAutonomousHands(nextState);
        }
      }, 10000) as unknown as number;

      set({ sparkHeartbeatId: heartbeatId });
    },

    sparkExtinguish: () => {
      const hbId = get().sparkHeartbeatId;
      if (hbId !== null) {
        window.clearInterval(hbId);
      }
      set((state: any) => ({
        sparkHeartbeatId: null,
        sparkBusy: false,
        spark: {
          ...state.spark,
          thermo: {
            ...state.spark.thermo,
            ignited: false,
            temperature: Math.max(0, state.spark.thermo.temperature - 0.2),
          },
          phase: 'dormant',
          active: false,
        },
        sparkLiveLog: [...state.sparkLiveLog, '❄ SPARK EXTINGUISHED — Thermodynamic loop stopped'],
      }));
      window.api?.spark?.saveState?.(get().spark).catch((e: unknown) => logNonFatal('spark.saveState', e));
    },

    sparkRunCycle: async (input: string) => {
      const current = get().spark;
      if (current.phase === 'thinking' || current.phase === 'exploring' || current.phase === 'evolving') return;

      set({
        sparkLiveLog: [],
        moduleStates: { ...get().moduleStates, spark: 'processing' },
      });

      const hasLLM = !!window.api?.llm?.generate;
      if (!hasLLM) {
        set((state: any) => ({
          sparkLiveLog: [...state.sparkLiveLog, 'ERROR: No LLM available. Configure a provider in Settings first.'],
          moduleStates: { ...state.moduleStates, spark: 'online' },
        }));
        return;
      }

      try {
        const nextState = await runSparkCycle(get().spark, input, llmGenerate, (msg: string) => {
          set((state: any) => ({
            sparkLiveLog: [...state.sparkLiveLog, msg],
          }));
        });
        if (nextState.goals.activeHorizonPlanId) {
          nextState.goals.horizonPlans = nextState.goals.horizonPlans.map((p) =>
            p.id === nextState.goals.activeHorizonPlanId ? advanceHorizonPlan(p) : p,
          );
        }
        nextState.metabolism = stepMetabolism(nextState.metabolism, {
          cognitiveLoad: 0.55,
          novelty: Math.min(1, input.split(/\s+/).length / 80),
          riskExposure: 0.25,
          triggerSleep: false,
        });
        nextState.ecology = applyEcologyAction(nextState.ecology, {
          description: `SPARK cycle applied: ${input.slice(0, 80)}`,
          risk: 0.22,
          observedSuccess: true,
          rewardSignal: 0.76,
        });
        set((state: any) => ({
          spark: nextState,
          moduleStates: { ...state.moduleStates, spark: 'online' },
          consciousness: {
            ...state.consciousness,
            soulFrame: {
              currentEmotion: nextState.soul.currentEmotion,
              emotionIntensity: nextState.soul.emotionIntensity,
              emotionHistory: [
                ...state.consciousness.soulFrame.emotionHistory.slice(-50),
                { emotion: nextState.soul.currentEmotion, timestamp: Date.now() },
              ],
            },
          },
        }));
        enqueueSparkLearningEpisodes(set, get, current, nextState, 'manual:cycle');

        window.api?.spark?.saveState?.(nextState).catch((e: unknown) => logNonFatal('spark.saveState', e));
      } catch (e: any) {
        set((state: any) => ({
          sparkLiveLog: [...state.sparkLiveLog, `SPARK ERROR: ${e?.message || 'Unknown error'}`],
          spark: {
            ...state.spark,
            phase: 'running',
            active: false,
            ecology: applyEcologyAction(state.spark.ecology, {
              description: `SPARK cycle error: ${e?.message || 'unknown'}`,
              risk: 0.5,
              observedSuccess: false,
              rewardSignal: 0.2,
            }),
          },
          moduleStates: { ...state.moduleStates, spark: 'online' },
        }));
      }
    },

    sparkRunDeepThought: async () => {
      const current = get().spark;
      if (current.phase === 'thinking' || current.phase === 'exploring' || current.phase === 'evolving') return;

      set({
        sparkLiveLog: [],
        moduleStates: { ...get().moduleStates, spark: 'processing' },
      });

      const hasLLM = !!window.api?.llm?.generate;
      if (!hasLLM) {
        set((state: any) => ({
          sparkLiveLog: [...state.sparkLiveLog, 'ERROR: No LLM available. Configure a provider in Settings first.'],
          moduleStates: { ...state.moduleStates, spark: 'online' },
        }));
        return;
      }

      try {
        const nextState = await runDeepThought(get().spark, llmGenerate, (msg: string) => {
          set((state: any) => ({
            sparkLiveLog: [...state.sparkLiveLog, msg],
          }));
        });
        if (nextState.goals.activeHorizonPlanId) {
          nextState.goals.horizonPlans = nextState.goals.horizonPlans.map((p) =>
            p.id === nextState.goals.activeHorizonPlanId ? advanceHorizonPlan(p) : p,
          );
        }
        nextState.metabolism = stepMetabolism(nextState.metabolism, {
          cognitiveLoad: 0.7,
          novelty: 0.6,
          riskExposure: 0.35,
          triggerSleep: false,
        });
        nextState.ecology = applyEcologyAction(nextState.ecology, {
          description: 'Deep thought cycle executed.',
          risk: 0.28,
          observedSuccess: true,
          rewardSignal: 0.8,
        });
        set((state: any) => ({
          spark: nextState,
          moduleStates: { ...state.moduleStates, spark: 'online' },
          consciousness: {
            ...state.consciousness,
            soulFrame: {
              currentEmotion: nextState.soul.currentEmotion,
              emotionIntensity: nextState.soul.emotionIntensity,
              emotionHistory: [
                ...state.consciousness.soulFrame.emotionHistory.slice(-50),
                { emotion: nextState.soul.currentEmotion, timestamp: Date.now() },
              ],
            },
          },
        }));
        enqueueSparkLearningEpisodes(set, get, current, nextState, 'manual:deep');

        window.api?.spark?.saveState?.(nextState).catch((e: unknown) => logNonFatal('spark.saveState', e));
      } catch (e: any) {
        set((state: any) => ({
          sparkLiveLog: [...state.sparkLiveLog, `DEEP THOUGHT ERROR: ${e?.message || 'Unknown error'}`],
          spark: {
            ...state.spark,
            phase: 'running',
            active: false,
            ecology: applyEcologyAction(state.spark.ecology, {
              description: `Deep thought error: ${e?.message || 'unknown'}`,
              risk: 0.52,
              observedSuccess: false,
              rewardSignal: 0.18,
            }),
          },
          moduleStates: { ...state.moduleStates, spark: 'online' },
        }));
      }
    },

    sparkAddGoal: (description: string) => {
      const goal = createGoal(description, 'user-set', 0.7);
      const plan = createInitialHorizonPlan(goal);
      goal.horizonPlanId = plan.id;
      set((state: any) => ({
        spark: {
          ...state.spark,
          goals: {
            ...state.spark.goals,
            goals: [...state.spark.goals.goals, goal],
            activeGoalId: state.spark.goals.activeGoalId || goal.id,
            horizonPlans: [...state.spark.goals.horizonPlans, plan].slice(-30),
            activeHorizonPlanId: state.spark.goals.activeHorizonPlanId || plan.id,
          },
        },
      }));
    },

    sparkReset: () => {
      const hbId = get().sparkHeartbeatId;
      if (hbId !== null) {
        window.clearInterval(hbId);
      }
      set({
        spark: createDefaultSparkState(),
        sparkLiveLog: [],
        sparkHeartbeatId: null,
        sparkBusy: false,
        sparkAutonomy: { ...get().sparkAutonomy, lastHandsDispatchAt: null },
        moduleStates: { ...get().moduleStates, spark: 'online' },
      });
    },

    setGenomeDrive: (key: string, value: number) => {
      set((state: any) => ({
        spark: {
          ...state.spark,
          genome: {
            ...state.spark.genome,
            drives: {
              ...state.spark.genome.drives,
              [key]: Math.max(0, Math.min(1, value)),
            },
            updatedAt: Date.now(),
          },
        },
      }));
    },

    setGenomeTrait: (key: string, value: number) => {
      set((state: any) => ({
        spark: {
          ...state.spark,
          genome: {
            ...state.spark.genome,
            traits: {
              ...state.spark.genome.traits,
              [key]: Math.max(0, Math.min(1, value)),
            },
            updatedAt: Date.now(),
          },
        },
      }));
    },

    setGenomePlasticity: (key: string, value: number) => {
      set((state: any) => ({
        spark: {
          ...state.spark,
          genome: {
            ...state.spark.genome,
            plasticity: {
              ...state.spark.genome.plasticity,
              [key]: Math.max(0, Math.min(1, value)),
            },
            updatedAt: Date.now(),
          },
        },
      }));
    },

    setGenomeTraumaSensitivity: (key: string, value: number) => {
      set((state: any) => ({
        spark: {
          ...state.spark,
          genome: {
            ...state.spark.genome,
            traumaSensitivity: {
              ...state.spark.genome.traumaSensitivity,
              [key]: Math.max(0, Math.min(1, value)),
            },
            updatedAt: Date.now(),
          },
        },
      }));
    },

    setGenomeAttachmentStyle: (style: string) => {
      set((state: any) => ({
        spark: {
          ...state.spark,
          genome: {
            ...state.spark.genome,
            attachmentStyle: style,
            updatedAt: Date.now(),
          },
        },
      }));
    },

    applyGenomePreset: (preset: 'companion' | 'strategist' | 'explorer' | 'guardian') => {
      const presets: Record<'companion' | 'strategist' | 'explorer' | 'guardian', SparkState['genome']> = {
        companion: {
          drives: { attachment: 0.88, mastery: 0.58, curiosity: 0.66, safety: 0.78, autonomy: 0.62 },
          traits: {
            openness: 0.72,
            conscientiousness: 0.68,
            emotionality: 0.82,
            assertiveness: 0.5,
            adaptability: 0.73,
          },
          plasticity: {
            learningRate: 0.6,
            beliefUpdateRate: 0.62,
            strategyMutationRate: 0.34,
            emotionalUpdateRate: 0.78,
          },
          traumaSensitivity: { abandonment: 0.82, rejection: 0.76, uncertainty: 0.58, conflict: 0.52 },
          attachmentStyle: 'secure',
          updatedAt: Date.now(),
        },
        strategist: {
          drives: { attachment: 0.55, mastery: 0.88, curiosity: 0.7, safety: 0.7, autonomy: 0.8 },
          traits: {
            openness: 0.68,
            conscientiousness: 0.86,
            emotionality: 0.42,
            assertiveness: 0.8,
            adaptability: 0.66,
          },
          plasticity: {
            learningRate: 0.58,
            beliefUpdateRate: 0.54,
            strategyMutationRate: 0.52,
            emotionalUpdateRate: 0.38,
          },
          traumaSensitivity: { abandonment: 0.5, rejection: 0.46, uncertainty: 0.62, conflict: 0.48 },
          attachmentStyle: 'avoidant',
          updatedAt: Date.now(),
        },
        explorer: {
          drives: { attachment: 0.6, mastery: 0.64, curiosity: 0.93, safety: 0.48, autonomy: 0.86 },
          traits: {
            openness: 0.92,
            conscientiousness: 0.58,
            emotionality: 0.56,
            assertiveness: 0.62,
            adaptability: 0.88,
          },
          plasticity: {
            learningRate: 0.82,
            beliefUpdateRate: 0.74,
            strategyMutationRate: 0.66,
            emotionalUpdateRate: 0.52,
          },
          traumaSensitivity: { abandonment: 0.54, rejection: 0.52, uncertainty: 0.72, conflict: 0.4 },
          attachmentStyle: 'secure',
          updatedAt: Date.now(),
        },
        guardian: {
          drives: { attachment: 0.74, mastery: 0.72, curiosity: 0.58, safety: 0.9, autonomy: 0.64 },
          traits: {
            openness: 0.58,
            conscientiousness: 0.84,
            emotionality: 0.62,
            assertiveness: 0.72,
            adaptability: 0.63,
          },
          plasticity: {
            learningRate: 0.5,
            beliefUpdateRate: 0.48,
            strategyMutationRate: 0.3,
            emotionalUpdateRate: 0.56,
          },
          traumaSensitivity: { abandonment: 0.68, rejection: 0.62, uncertainty: 0.5, conflict: 0.66 },
          attachmentStyle: 'secure',
          updatedAt: Date.now(),
        },
      };

      set((state: any) => ({
        spark: {
          ...state.spark,
          genome: {
            ...presets[preset],
            updatedAt: Date.now(),
          },
          logs: [...state.spark.logs, `[GENOME] Preset applied: ${preset}.`].slice(-100),
        },
        sparkLiveLog: [...state.sparkLiveLog.slice(-49), `[GenomePreset] ${preset}`],
      }));
    },

    runNightlyReconsolidation: async () => {
      const spark = get().spark;
      const recon = runNightlyReconsolidationPass(spark);
      set((state: any) => ({
        spark: {
          ...state.spark,
          metacognition: {
            ...state.spark.metacognition,
            blindSpots: state.spark.metacognition.blindSpots
              .filter((b: string) => !recon.revisedBeliefs.some((rb: string) => b.includes(rb)))
              .slice(-20),
            calibrationScore: Math.min(1, state.spark.metacognition.calibrationScore + recon.confidenceShift),
          },
          metabolism: {
            ...state.spark.metabolism,
            circadianPhase: 'sleep',
            recoveryDebt: Math.max(0, state.spark.metabolism.recoveryDebt - 0.2),
            energyBudget: Math.min(1, state.spark.metabolism.energyBudget + 0.15),
            lastSleepAt: Date.now(),
            lastUpdated: Date.now(),
          },
          logs: [...state.spark.logs, `[RECON] ${recon.summary}`].slice(-100),
        },
        memoryConsolidation: {
          ...state.memoryConsolidation,
          logs: [
            ...state.memoryConsolidation.logs,
            `Night reconsolidation: ${recon.contradictionsResolved} contradiction(s) resolved.`,
          ].slice(-80),
        },
        sparkLiveLog: [...state.sparkLiveLog.slice(-49), `[NightCycle] ${recon.summary}`],
      }));
    },

    runMemoryConsolidation: async () => {
      const current = get().memoryConsolidation;
      if (!current.enabled || current.pendingEpisodes.length === 0) return;

      const batch = current.pendingEpisodes.slice(0, 12);
      const result = consolidateEpisodes(batch);
      let vectorDuplicatesSuppressed = 0;

      const shouldSuppressAsDuplicate = async (content: string, type: 'semantic' | 'procedural') => {
        try {
          const matches = await window.api?.memory?.searchVector?.(content, 3, type);
          const bestSimilarity =
            Array.isArray(matches) && matches.length > 0
              ? Math.max(...matches.map((m: any) => Number(m.similarity || 0)))
              : 0;
          return bestSimilarity >= 0.92;
        } catch {
          return false;
        }
      };

      for (const content of result.semantic) {
        if (await shouldSuppressAsDuplicate(content, 'semantic')) {
          vectorDuplicatesSuppressed += 1;
          continue;
        }
        const quality = result.qualityByContent[content] ?? result.avgQualityScore ?? 0.6;
        window.api?.memory
          ?.storeVector?.({
            content,
            type: 'semantic',
            source: 'consolidation',
            importance: Math.max(0.45, Math.min(0.92, 0.45 + quality * 0.4)),
            tags: ['consolidated', 'semantic', `quality:${quality.toFixed(2)}`],
          })
          .catch((e: unknown) => logNonFatal('memory.vector.consolidation.semantic', e));
      }
      for (const content of result.procedural) {
        if (await shouldSuppressAsDuplicate(content, 'procedural')) {
          vectorDuplicatesSuppressed += 1;
          continue;
        }
        const quality = result.qualityByContent[content] ?? result.avgQualityScore ?? 0.62;
        window.api?.memory
          ?.storeVector?.({
            content,
            type: 'procedural',
            source: 'consolidation',
            importance: Math.max(0.5, Math.min(0.95, 0.5 + quality * 0.42)),
            tags: ['consolidated', 'procedural', `quality:${quality.toFixed(2)}`],
          })
          .catch((e: unknown) => logNonFatal('memory.vector.consolidation.procedural', e));
      }
      const transferHeuristics = deriveTransferHeuristicsFromProceduralMemories(result.procedural);
      let heuristicsBoosted = 0;
      for (const heuristic of transferHeuristics) {
        if (await shouldSuppressAsDuplicate(`Transfer heuristic: ${heuristic.statement}`, 'semantic')) {
          vectorDuplicatesSuppressed += 1;
          continue;
        }
        const boostedImportance = heuristic.proven
          ? Math.max(0.78, Math.min(0.97, heuristic.confidence + heuristic.evidenceScore * 0.25))
          : Math.max(0.6, heuristic.confidence);
        if (heuristic.proven) heuristicsBoosted += 1;
        window.api?.memory
          ?.storeVector?.({
            content: `Transfer heuristic: ${heuristic.statement}`,
            type: 'semantic',
            source: 'transfer-learning',
            importance: boostedImportance,
            tags: [
              'consolidated',
              'transfer',
              `support:${heuristic.sourceCount}`,
              `evidence:${heuristic.evidenceScore.toFixed(2)}`,
              heuristic.proven ? 'proven' : 'candidate',
            ],
          })
          .catch((e: unknown) => logNonFatal('memory.vector.consolidation.transfer', e));
      }

      set((state: any) => ({
        memoryConsolidation: {
          ...state.memoryConsolidation,
          pendingEpisodes: state.memoryConsolidation.pendingEpisodes.slice(batch.length),
          lastRunAt: Date.now(),
          totalRuns: state.memoryConsolidation.totalRuns + 1,
          promotedSemantic: state.memoryConsolidation.promotedSemantic + result.semantic.length,
          promotedProcedural: state.memoryConsolidation.promotedProcedural + result.procedural.length,
          contradictionsDetected: state.memoryConsolidation.contradictionsDetected + result.contradictions.length,
          duplicatesSuppressed:
            state.memoryConsolidation.duplicatesSuppressed + result.duplicatesSuppressed + vectorDuplicatesSuppressed,
          lowSignalDropped: state.memoryConsolidation.lowSignalDropped + result.lowSignalDropped,
          avgQualityScore: result.avgQualityScore,
          precisionProxy: result.precisionProxy,
          recallProxy: result.recallProxy,
          heuristicsBoosted: state.memoryConsolidation.heuristicsBoosted + heuristicsBoosted,
          logs: [
            ...state.memoryConsolidation.logs,
            `Consolidated ${batch.length} episode(s) -> kept ${result.keptCount}, ${result.semantic.length} semantic, ${result.procedural.length} procedural, ${transferHeuristics.length} transfer heuristic(s), ${result.contradictions.length} contradiction(s); duplicates suppressed ${result.duplicatesSuppressed + vectorDuplicatesSuppressed}, low-signal dropped ${result.lowSignalDropped}, precision~${(result.precisionProxy * 100).toFixed(0)}%, recall~${(result.recallProxy * 100).toFixed(0)}%.`,
          ].slice(-80),
        },
        spark: {
          ...state.spark,
          genome: adaptGenomeFromSignal(state.spark.genome, {
            uncertainty: result.contradictions.length > 0 ? 0.7 : 0.25,
            novelty: Math.min(1, (result.semantic.length + result.procedural.length) / 12),
          }),
          ecology: applyEcologyAction(state.spark.ecology, {
            description: 'Memory consolidation pass',
            risk: 0.16,
            observedSuccess: true,
            rewardSignal: result.contradictions.length === 0 ? 0.82 : 0.6,
          }),
        },
        sparkLiveLog: [
          ...state.sparkLiveLog.slice(-49),
          `[MemoryQC] precision~${(result.precisionProxy * 100).toFixed(0)}% recall~${(result.recallProxy * 100).toFixed(0)}% quality ${(result.avgQualityScore * 100).toFixed(0)}%`,
        ],
      }));
    },
  };
}
