import type { StoreSet, StoreGet } from '../types';
import type { ChatMessage, Conversation, SparkGoal, DualBrainState } from '../../types';
import { executiveRoute } from '../../prime/executive';
import { buildSystemAddendum, applySystemAddendum, heartSnapshotFromConsciousness } from '../../prime/context';
import { injectCreed } from '../../prime/soul';
import { searchMemories, buildRAGContext, storeConversationMemory, storeMemory } from '../../prime/memory';
import { routeToBrain, buildSlowBrainDirective } from '../../prime/router';
import { inferEmotionFromText, updateSoulFromResponse } from '../../prime/spark';
import { detectARCTask, runPIE, formatPIEContext } from '../../prime/pie';
import { adaptGenomeFromSignal } from '../../prime/cognitive-genome';
import { updateSocialFromInteraction } from '../../prime/social-sim';
import { applyEcologyAction } from '../../prime/embodied-ecology';
import { buildNeuralContextSnapshot } from '../../prime/neuralcore';
import { formatCommunicationProfileForPrompt } from '../../prime/oracle-voice';

let messageCounter = 0;

function logNonFatal(scope: string, error: unknown): void {
  console.warn(`[${scope}] non-fatal:`, error);
}

const defer = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function genId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

function genConversationId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createChatSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── Navigation ────────────────────────────────────────
    activeModule: 'nexus',
    setActiveModule: (m: string) => set({ activeModule: m }),

    moduleStates: {
      nexus: 'online',
      memory: 'online',
      heart: 'online',
      mind: 'online',
      hands: 'online',
      forge: 'online',
      gauntlet: 'online',
      sovereign: 'online',
      spark: 'online',
      repo: 'online',
      voice: 'online',
      oracle: 'online',
      creed: 'online',
      settings: 'online',
    },

    // ─── NEXUS — Chat (with RAG memory retrieval) ──────────
    messages: [] as ChatMessage[],
    isStreaming: false,
    streamingContent: '',
    currentRunId: null as string | null,
    conversations: [] as Array<{
      id: string;
      title: string;
      createdAt: number;
      updatedAt: number;
      messageCount: number;
      lastMessagePreview?: string;
    }>,
    activeConversationId: null as string | null,
    activeConversationTitle: 'New chat',
    activeConversationCreatedAt: null as number | null,
    dualBrain: {
      enabled: true,
      complexityThreshold: 0.45,
      uncertaintyThreshold: 0.35,
      lastRoute: 'fast',
      fastCount: 0,
      slowCount: 0,
      lastReason: 'Router initialized.',
    } as DualBrainState,

    sendMessage: (content: string) => {
      const requestTimestamp = Date.now();

      const isNewConversation = !get().activeConversationId;
      const conversationId = (get().activeConversationId || genConversationId()) as string;
      const conversationCreatedAt = get().activeConversationCreatedAt || requestTimestamp;
      const runId = `chat_${requestTimestamp}_${Math.random().toString(36).slice(2, 8)}`;

      const userMessage: ChatMessage = {
        id: genId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      set((state: any) => ({
        messages: [...state.messages, userMessage],
        isStreaming: true,
        streamingContent: '',
        currentRunId: runId,
        moduleStates: { ...state.moduleStates, nexus: 'processing' },
        ...(isNewConversation
          ? {
              activeConversationId: conversationId,
              activeConversationTitle: 'New chat',
              activeConversationCreatedAt: conversationCreatedAt,
            }
          : {}),
        spark: {
          ...state.spark,
          social: updateSocialFromInteraction(state.spark.social, {
            actorId: 'operator',
            actorLabel: state.settings.operatorName || 'Operator',
            inferredNeeds:
              content.length > 120 ? ['deep collaboration', 'high bandwidth reasoning'] : ['fast reliable response'],
            boundarySignal: /don't|do not|never|stop/i.test(content)
              ? 'explicit operator constraint issued'
              : undefined,
          }),
          genome: adaptGenomeFromSignal(state.spark.genome, {
            novelty: Math.min(1, content.split(/\s+/).length / 80),
            uncertainty: /\b(unknown|uncertain|not sure|maybe)\b/i.test(content) ? 0.7 : 0.3,
          }),
        },
      }));

      (async () => {
        if (!window.api?.conversations?.save) return;
        try {
          const s = get();
          if (!s.activeConversationId) return;
          const convo: Conversation = {
            id: s.activeConversationId,
            title: s.activeConversationTitle || 'New chat',
            createdAt: s.activeConversationCreatedAt || Date.now(),
            updatedAt: Date.now(),
            messages: s.messages,
          };
          await window.api.conversations.save(convo);
        } catch {
          // persistence failure is non-fatal
        }
      })();

      (async () => {
        const { messages, settings, championPrompt, dualBrain } = get();
        const history = messages
          .filter((m: ChatMessage) => m.role !== 'system')
          .slice(-20)
          .map((m: ChatMessage) => ({ role: m.role, content: m.content }));

        const exec = executiveRoute({ input: content, recentTurns: history });
        if (exec.mode !== 'talk') {
          set((state: any) => ({
            isStreaming: false,
            streamingContent: '',
            currentRunId: null,
            moduleStates: { ...state.moduleStates, nexus: 'online' },
            messages: [
              ...state.messages,
              {
                id: genId(),
                role: 'assistant',
                timestamp: Date.now(),
                sourceModule: 'nexus',
                content:
                  exec.mode === 'act'
                    ? `Routing to HANDS: ${exec.taskDraft?.goal || content}`
                    : exec.mode === 'arena'
                      ? 'Routing to MIND (Arena)...'
                      : 'Routing to FORGE/SOVEREIGN...',
              },
            ],
          }));

          (async () => {
            if (!window.api?.conversations?.save) return;
            try {
              const s = get();
              if (!s.activeConversationId) return;
              const convo: Conversation = {
                id: s.activeConversationId,
                title: s.activeConversationTitle || 'New chat',
                createdAt: s.activeConversationCreatedAt || Date.now(),
                updatedAt: Date.now(),
                messages: s.messages,
              };
              await window.api.conversations.save(convo);
            } catch {
              // non-fatal
            }
          })();

          if (exec.mode === 'act') {
            const goal = exec.taskDraft?.goal || content;
            if (!get().cognitive.isActive) {
              const contextAddendum = buildSystemAddendum({
                conscienceState: get().conscience,
                championPrompt: get().championPrompt,
                heartContext: heartSnapshotFromConsciousness(get().consciousness),
                requestTimestamp,
              });
              get().startCognitive({ goal, contextAddendum, origin: 'nexus' });
            } else {
              set((state: any) => ({
                messages: [
                  ...state.messages,
                  {
                    id: genId(),
                    role: 'system' as const,
                    timestamp: Date.now(),
                    content: 'HANDS is already running. Wait for it to finish or kill the run, then try again.',
                  },
                ],
              }));
            }
          } else if (exec.mode === 'arena') {
            const prompt = content.replace(/^\/(arena|mind)\b\s*/i, '').trim() || content;
            get().startArena(prompt);
          } else if (exec.mode === 'improve') {
            if (/\/forge\b/i.test(content) && get().forge.phase !== 'running') {
              void get().startForge?.();
            } else {
              void get().startSovereign?.();
            }
          }
          return;
        }

        const routeDecision = dualBrain.enabled
          ? routeToBrain({
              prompt: content,
              recentTurns: history,
              complexityThreshold: dualBrain.complexityThreshold,
              uncertaintyThreshold: dualBrain.uncertaintyThreshold,
            })
          : {
              route: 'fast' as const,
              complexity: 0,
              uncertainty: 0,
              reason: 'Dual-brain disabled by operator.',
            };

        set((state: any) => ({
          dualBrain: {
            ...state.dualBrain,
            lastRoute: routeDecision.route,
            lastReason: `${routeDecision.reason} (c=${routeDecision.complexity.toFixed(2)}, u=${routeDecision.uncertainty.toFixed(2)})`,
            fastCount: state.dualBrain.fastCount + (routeDecision.route === 'fast' ? 1 : 0),
            slowCount: state.dualBrain.slowCount + (routeDecision.route === 'slow' ? 1 : 0),
          },
        }));

        window.api.chat.removeAllListeners();

        let chunkRaf: number | null = null;
        let latestFullText = '';
        let lastChunkAt = 0;
        const PAUSE_THRESHOLD_MS = 3000;
        const streamSegments: Array<{ text: string; pauseBefore: boolean }> = [];
        let currentSegmentStart = 0;

        const flushChunk = () => {
          chunkRaf = null;
          set({
            streamingContent: latestFullText,
            consciousness: {
              ...get().consciousness,
              presence: 'thinking',
            },
          });
        };
        window.api.chat.onChunk((data: any) => {
          if (data?.runId && data.runId !== runId) return;
          const now = Date.now();
          const newText = String(data?.fullText || '');

          if (lastChunkAt > 0 && now - lastChunkAt >= PAUSE_THRESHOLD_MS && newText.length > latestFullText.length) {
            const segmentText = latestFullText.slice(currentSegmentStart).trim();
            if (segmentText.length > 20) {
              streamSegments.push({
                text: segmentText,
                pauseBefore: streamSegments.length > 0,
              });
            }
            currentSegmentStart = latestFullText.length;
          }

          lastChunkAt = now;
          latestFullText = newText;
          if (chunkRaf !== null) return;
          chunkRaf = window.requestAnimationFrame(flushChunk);
        });

        window.api.chat.onDone((data: any) => {
          if (data?.runId && data.runId !== runId) return;
          if (chunkRaf !== null) {
            window.cancelAnimationFrame(chunkRaf);
            chunkRaf = null;
          }

          const fullContent = String(data?.content || '');

          const lastSegText = fullContent.slice(currentSegmentStart).trim();
          if (lastSegText.length > 20) {
            streamSegments.push({
              text: lastSegText,
              pauseBefore: streamSegments.length > 0,
            });
          }

          const hasNaturalPause = streamSegments.length >= 2;

          const mainContent = hasNaturalPause ? streamSegments[0].text : fullContent;
          const assistantMessage: ChatMessage = {
            id: genId(),
            role: 'assistant',
            content: mainContent,
            timestamp: Date.now(),
            sourceModule: 'nexus',
          };

          const afterthoughts: ChatMessage[] = hasNaturalPause
            ? streamSegments.slice(1).map((seg) => ({
                id: genId(),
                role: 'assistant' as const,
                content: seg.text,
                timestamp: Date.now(),
                sourceModule: 'nexus' as const,
                thinking: true,
              }))
            : [];

          const combinedText = `${content}\n${fullContent}`;
          const currentSpark = get().spark;
          const emotionInferred = inferEmotionFromText(
            combinedText,
            currentSpark.soul.currentEmotion,
            currentSpark.soul.emotionIntensity,
          );
          const updatedSpark = updateSoulFromResponse(currentSpark, fullContent);

          set((state: any) => ({
            messages: [...state.messages, assistantMessage, ...afterthoughts],
            isStreaming: false,
            streamingContent: '',
            currentRunId: null,
            moduleStates: { ...state.moduleStates, nexus: 'online' },
            consciousness: {
              ...state.consciousness,
              presence: 'present',
              totalInteractions: state.consciousness.totalInteractions + 1,
              trust: Math.min(1, state.consciousness.trust + 0.005),
              intimacy: Math.min(1, state.consciousness.intimacy + 0.003),
              soulFrame: {
                currentEmotion: emotionInferred.emotion,
                emotionIntensity: emotionInferred.intensity,
                emotionHistory: [
                  ...state.consciousness.soulFrame.emotionHistory.slice(-50),
                  { emotion: emotionInferred.emotion, timestamp: Date.now() },
                ],
              },
            },
            spark: {
              ...state.spark,
              soul: updatedSpark.soul,
              social: updateSocialFromInteraction(state.spark.social, {
                actorId: 'operator',
                actorLabel: state.settings.operatorName || 'Operator',
                repair: true,
                inferredNeeds: ['continuity', 'emotional attunement'],
              }),
              genome: adaptGenomeFromSignal(state.spark.genome, {
                repair: true,
                uncertainty: /not sure|uncertain|unknown/i.test(data.content) ? 0.6 : 0.25,
              }),
              ecology: applyEcologyAction(state.spark.ecology, {
                description: `Dialogue loop: ${content.slice(0, 80)}`,
                risk: 0.18,
                observedSuccess: true,
                rewardSignal: 0.78,
              }),
            },
          }));

          if (afterthoughts.length > 0) {
            console.log(
              `[Afterthought] Detected ${afterthoughts.length} natural pause(s) in stream — split into ${streamSegments.length} messages`,
            );
          }

          (async () => {
            if (!window.api?.conversations?.save) return;
            try {
              const s = get();
              if (!s.activeConversationId) return;
              const convo: Conversation = {
                id: s.activeConversationId,
                title: s.activeConversationTitle || 'New chat',
                createdAt: s.activeConversationCreatedAt || Date.now(),
                updatedAt: Date.now(),
                messages: s.messages,
              };
              await window.api.conversations.save(convo);
            } catch {
              // non-fatal
            }
          })();

          (async () => {
            const s = get();
            if (!s.activeConversationId || !window.api?.conversations?.rename) return;
            if (s.activeConversationTitle && s.activeConversationTitle !== 'New chat') return;

            let title = '';
            if (s.settings.performanceMode) {
              // Fast path: derive title from user message without an LLM call
              const seed = String(content || '').trim();
              title = seed.split(/\s+/).slice(0, 7).join(' ');
            } else {
              // Delay so title gen doesn't compete with next user message
              await defer(3000);

              const firstTurns = s.messages
                .filter((m: ChatMessage) => m.role === 'user' || m.role === 'assistant')
                .slice(0, 4)
                .map((m: ChatMessage) => `${m.role.toUpperCase()}: ${m.content}`)
                .join('\n')
                .slice(0, 900);

              try {
                if (window.api?.llm?.generate) {
                  const raw = await window.api.llm.generate(
                    [
                      {
                        role: 'system',
                        content:
                          'You generate short conversation titles. Output ONLY the title. 3-7 words. No quotes, no punctuation at the end.',
                      },
                      { role: 'user', content: `Conversation:\n${firstTurns}\n\nTitle:` },
                    ],
                    { provider: s.settings.provider, model: s.settings.model, temperature: 0.2, maxTokens: 24 },
                  );
                  title = String(raw || '').trim();
                }
              } catch {
                // ignore title generation failures
              }

              if (!title) {
                const seed = String(content || '').trim();
                title = seed.split(/\s+/).slice(0, 7).join(' ');
              }
            }

            title = title.replace(/^["'`]+|["'`]+$/g, '').trim();
            title = title.replace(/[.?!:;,\-–—]+$/g, '').trim();
            if (title.length > 64) title = title.slice(0, 64).trim();
            if (!title || title.toLowerCase() === 'new chat') return;

            set({ activeConversationTitle: title });
            await window.api.conversations.rename(s.activeConversationId, title);
            await get().loadConversations();
          })();

          storeConversationMemory(content, data.content, get().consciousness.soulFrame.currentEmotion).catch(
            (e: unknown) => logNonFatal('memory.storeConversation', e),
          );

          (async () => {
            if (get().settings.performanceMode) return;
            if (!window.api?.llm?.generate) return;
            const assistantText = String(data?.content || '');
            if (assistantText.length < 100) return;

            await defer(5000);

            try {
              const s = get();
              const raw = await window.api.llm.generate(
                [
                  {
                    role: 'system',
                    content: `You are a self-evaluation module for an AGI system. Evaluate the assistant's response to the user.
Output ONLY valid JSON with these fields:
- "quality": number 1-10
- "wasHelpful": boolean
- "missed": string (what the response missed or could improve, or "" if nothing)
- "learned": string (a procedural lesson for future responses, or "" if nothing new)
- "shouldRemember": string (a key fact worth storing long-term, or "" if nothing)`,
                  },
                  {
                    role: 'user',
                    content: `USER MESSAGE:\n${content.slice(0, 500)}\n\nASSISTANT RESPONSE:\n${assistantText.slice(0, 800)}\n\nEvaluate:`,
                  },
                ],
                { provider: s.settings.provider, model: s.settings.model, temperature: 0.15, maxTokens: 200 },
              );

              const text = String(raw || '').trim();
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (!jsonMatch) return;
              const eval_ = JSON.parse(jsonMatch[0]);

              if (eval_.learned && typeof eval_.learned === 'string' && eval_.learned.length > 10) {
                await storeMemory(`Self-eval lesson: ${eval_.learned}`, 'procedural', {
                  source: 'self-eval',
                  importance: 0.75,
                  tags: ['self-eval', 'lesson'],
                });
              }

              if (
                eval_.shouldRemember &&
                typeof eval_.shouldRemember === 'string' &&
                eval_.shouldRemember.length > 10
              ) {
                await storeMemory(eval_.shouldRemember, 'semantic', {
                  source: 'self-eval',
                  importance: 0.7,
                  tags: ['fact', 'learned'],
                });
              }

              if (typeof eval_.quality === 'number' && eval_.quality <= 4 && eval_.missed) {
                await storeMemory(`Response failure: ${eval_.missed}`, 'procedural', {
                  source: 'self-eval',
                  importance: 0.9,
                  tags: ['self-eval', 'failure'],
                });
              }
            } catch {
              // Self-eval is non-fatal
            }
          })();

          set((state: any) => ({
            memoryConsolidation: {
              ...state.memoryConsolidation,
              pendingEpisodes: [
                ...state.memoryConsolidation.pendingEpisodes.slice(-39),
                {
                  id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  content: `User: ${content}\nAssistant: ${data.content.slice(0, 600)}`,
                  source: 'nexus',
                  importance: 0.55,
                  timestamp: Date.now(),
                },
              ],
            },
          }));

          const consolidationState = get().memoryConsolidation;
          if (consolidationState.enabled && consolidationState.pendingEpisodes.length >= 3) {
            get()
              .runMemoryConsolidation()
              .catch((e: unknown) => logNonFatal('memory.consolidation.chatDone', e));
          }

          (async () => {
            if (get().settings.performanceMode) return;
            if (!window.api?.llm?.generate) return;
            const assistantText = String(data?.content || '');
            if (assistantText.length < 150) return;
            const s = get();
            if (s.cognitive.isActive) return;
            if (s.emergencyStopActive) return;

            const actionSignals =
              /\b(let me (search|look|check|find|open|create|write|read|browse)|i('ll| will| can) (search|look up|check|find|open|fetch|create|write)|searching for|looking up|i should (search|check|verify))\b/i;
            if (!actionSignals.test(assistantText)) return;

            await defer(5000);

            try {
              const raw = await window.api.llm.generate(
                [
                  {
                    role: 'system',
                    content: `You are an action extraction module. Given an assistant response, determine if it implies a concrete action the AI should take autonomously (web search, file operation, code execution, etc).
Output ONLY valid JSON:
- "shouldAct": boolean
- "action": string (brief description of what to do, or "")
- "type": "search" | "file" | "code" | "browse" | "none"`,
                  },
                  {
                    role: 'user',
                    content: `ASSISTANT SAID:\n${assistantText.slice(0, 600)}\n\nExtract action:`,
                  },
                ],
                { provider: s.settings.provider, model: s.settings.model, temperature: 0.1, maxTokens: 120 },
              );

              const text = String(raw || '').trim();
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (!jsonMatch) return;
              const parsed = JSON.parse(jsonMatch[0]);

              if (parsed.shouldAct && parsed.action && parsed.type !== 'none') {
                const contextAddendum = buildSystemAddendum({
                  ragContext: '',
                  conscienceState: get().conscience,
                  championPrompt: get().championPrompt || '',
                  heartContext: heartSnapshotFromConsciousness(get().consciousness),
                });
                get().startCognitive({
                  goal: parsed.action,
                  contextAddendum,
                  origin: 'nexus',
                });

                const actionMsg: ChatMessage = {
                  id: genId(),
                  role: 'system',
                  content: `🤖 Auto-dispatching HANDS: ${parsed.action}`,
                  timestamp: Date.now(),
                  sourceModule: 'hands',
                };
                set((s2: any) => ({
                  messages: [...s2.messages, actionMsg],
                }));
              }
            } catch {
              // Non-fatal
            }
          })();

          window.api.memory.get().then((mem: any) => {
            if (mem?.consciousness) {
              set((state: any) => ({
                consciousness: {
                  ...state.consciousness,
                  soulFrame: {
                    ...state.consciousness.soulFrame,
                    currentEmotion: mem.consciousness.currentEmotion || state.consciousness.soulFrame.currentEmotion,
                    emotionIntensity:
                      mem.consciousness.emotionIntensity ?? state.consciousness.soulFrame.emotionIntensity,
                  },
                },
              }));
            }
          });
        });

        window.api.chat.onError((data: any) => {
          if (data?.runId && data.runId !== runId) return;
          const errorMessage: ChatMessage = {
            id: genId(),
            role: 'system' as const,
            content: `Connection error: ${data.message}`,
            timestamp: Date.now(),
          };

          set((state: any) => ({
            messages: [...state.messages, errorMessage],
            isStreaming: false,
            streamingContent: '',
            currentRunId: null,
            moduleStates: { ...state.moduleStates, nexus: 'online' },
            spark: {
              ...state.spark,
              social: updateSocialFromInteraction(state.spark.social, {
                actorId: 'operator',
                actorLabel: state.settings.operatorName || 'Operator',
                rupture: true,
              }),
              genome: adaptGenomeFromSignal(state.spark.genome, {
                rupture: true,
                uncertainty: 0.8,
              }),
              ecology: applyEcologyAction(state.spark.ecology, {
                description: `Dialogue error: ${data.message}`,
                risk: 0.45,
                observedSuccess: false,
                rewardSignal: 0.2,
              }),
            },
          }));
        });

        let ragContext = '';
        try {
          const memories = await searchMemories(
            content,
            5,
            undefined,
            heartSnapshotFromConsciousness(get().consciousness),
          );
          ragContext = buildRAGContext(memories);
        } catch {
          // RAG failure is non-fatal
        }

        let soulHistory = injectCreed(history);

        const sparkState = get().spark;
        const sparkCtx = {
          activeGoals: sparkState.goals.goals
            .filter((g: SparkGoal) => g.status === 'active')
            .slice(0, 3)
            .map((g: SparkGoal) => g.description),
          recentInsights: get().consciousness.insights.slice(-3),
          circadianPhase: sparkState.metabolism.circadianPhase,
          curiosityQuestion:
            sparkState.curiosity.questions
              .filter((q: { status: string }) => q.status === 'open')
              .slice(0, 1)
              .map((q: { question: string }) => q.question)[0] || '',
          genome: sparkState.genome,
          temperature: sparkState.thermo.temperature,
          entropy: sparkState.thermo.entropy,
        };

        let pieContextStr = '';
        let pieDirectAnswer: string | null = null;
        const arcDetection = detectARCTask(content);
        if (arcDetection && arcDetection.trainingPairs.length >= 2) {
          const pieResult = runPIE(arcDetection.trainingPairs, arcDetection.testInput ?? undefined);
          if (pieResult.lockedProgram) {
            const nextPie = {
              active: true,
              trainingPairs: arcDetection.trainingPairs,
              candidates: pieResult.candidates.slice(0, 50),
              survivors: pieResult.survivors.slice(0, 50),
              lockedProgram: pieResult.lockedProgram,
              lockedProgramLabel: pieResult.lockedProgramLabel,
              falsificationLog: pieResult.candidates
                .flatMap((c: any) => c.falsifications)
                .filter((f: any) => !f.passed)
                .slice(0, 100),
              adversarialTests: pieResult.adversarialTests,
              totalRuns: (get().spark.pie?.totalRuns ?? 0) + 1,
              lastRunAt: Date.now(),
            };
            set((s: any) => ({ spark: { ...s.spark, pie: nextPie } }));
            pieContextStr = formatPIEContext(nextPie);

            const wantsOutputOnly =
              /return\\s+only\\s+the\\s+output\\s+grid|output\\s+grid\\s+only|no\\s+explanation/i.test(content);
            const hasExplicitTest = !!arcDetection.testInput;
            if ((wantsOutputOnly || hasExplicitTest) && pieResult.testOutput) {
              pieDirectAnswer = pieResult.testOutput.map((r: any) => r.join(' ')).join('\n');
            }
          }
        }

        if (pieDirectAnswer) {
          const assistantMsg: ChatMessage = {
            id: genId(),
            role: 'assistant',
            content: pieDirectAnswer,
            timestamp: Date.now(),
            sourceModule: 'spark',
          };

          set((s: any) => ({
            isStreaming: false,
            streamingContent: '',
            currentRunId: null,
            moduleStates: { ...s.moduleStates, nexus: 'online' },
            messages: [...s.messages, assistantMsg],
            consciousness: { ...s.consciousness, presence: 'present' },
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
              .catch((e: unknown) => logNonFatal('conversations.save.chatDone', e));
          }

          return;
        }

        const neuralCtx = buildNeuralContextSnapshot(get().neuralCore);

        const oracleState = get().oracle;
        const oracleVoiceContext =
          oracleState.astroVoiceEnabled && oracleState.communicationProfile
            ? formatCommunicationProfileForPrompt(oracleState.communicationProfile)
            : undefined;

        const addendum = buildSystemAddendum({
          ragContext,
          conscienceState: get().conscience,
          championPrompt,
          slowBrainDirective: routeDecision.route === 'slow' ? buildSlowBrainDirective() : '',
          sparkContext: sparkCtx,
          pieContext: pieContextStr,
          neuralContext: neuralCtx,
          oracleVoiceContext,
          heartContext: heartSnapshotFromConsciousness(get().consciousness),
          requestTimestamp,
        });
        soulHistory = applySystemAddendum(soulHistory, addendum);

        // ── Inactivity-based stream watchdog ──────────────────────────────
        // Replaces the prior fixed 120s wall-clock timeout, which would fire
        // mid-stream on slow cloud models (e.g. qwen3-coder:480b-cloud) and
        // surface a misleading "Response timed out" while the model was still
        // happily streaming tokens. We now allow up to FIRST_CHUNK_TIMEOUT_MS
        // for the first chunk, and INACTIVITY_TIMEOUT_MS of silence between
        // chunks. The timer resets on every chunk.
        const FIRST_CHUNK_TIMEOUT_MS = 90_000;
        const INACTIVITY_TIMEOUT_MS = 90_000;
        let streamTimeout: number | null = null;
        let timedOut = false;
        let timeoutMessageId: string | null = null;

        const fireTimeout = () => {
          if (!get().isStreaming) return;
          timedOut = true;
          try {
            window.api.chat.abort?.(runId);
          } catch (_) {
            /* noop */
          }
          const partial = (latestFullText || '').trim();
          timeoutMessageId = genId();
          set((state: any) => ({
            isStreaming: false,
            streamingContent: '',
            currentRunId: null,
            moduleStates: { ...state.moduleStates, nexus: 'online' },
            messages: [
              ...state.messages,
              ...(partial
                ? [
                    {
                      id: genId(),
                      role: 'assistant' as const,
                      content: partial,
                      timestamp: Date.now(),
                      sourceModule: 'nexus' as const,
                      thinking: true,
                    },
                  ]
                : []),
              {
                id: timeoutMessageId,
                role: 'system' as const,
                content: partial
                  ? 'Stream stalled — kept what arrived above. Try again to continue.'
                  : 'Response timed out — the model may be overloaded or unreachable. Try again.',
                timestamp: Date.now(),
              },
            ],
          }));
        };

        const armTimeout = (ms: number) => {
          if (streamTimeout !== null) window.clearTimeout(streamTimeout);
          streamTimeout = window.setTimeout(fireTimeout, ms);
        };
        const clearSafetyTimeout = () => {
          if (streamTimeout !== null) {
            window.clearTimeout(streamTimeout);
            streamTimeout = null;
          }
        };

        armTimeout(FIRST_CHUNK_TIMEOUT_MS);

        // Reset the inactivity timer every time a chunk arrives. We piggy-back
        // a second chunk listener; the primary one above handles flush/render.
        window.api.chat.onChunk((data: any) => {
          if (data?.runId && data.runId !== runId) return;
          armTimeout(INACTIVITY_TIMEOUT_MS);
        });

        window.api.chat.onDone((data: any) => {
          if (data?.runId && data.runId !== runId) return;
          clearSafetyTimeout();
          // If the timeout already fired but the backend still produced content,
          // remove the misleading "timed out" system message — the answer arrived.
          if (timedOut && timeoutMessageId && String(data?.content || '').trim()) {
            const idToRemove = timeoutMessageId;
            set((state: any) => ({
              messages: state.messages.filter((m: ChatMessage) => m.id !== idToRemove),
            }));
            timeoutMessageId = null;
          }
        });
        window.api.chat.onError((data: any) => {
          if (data?.runId && data.runId !== runId) return;
          clearSafetyTimeout();
        });

        window.api.chat.send(soulHistory, {
          provider: settings.provider,
          model: settings.model,
          runId,
          temperature: routeDecision.route === 'slow' ? Math.min(0.55, settings.temperature) : settings.temperature,
          maxTokens: settings.maxTokens,
        });
      })();
    },

    setDualBrainEnabled: (enabled: boolean) => {
      set((state: any) => ({
        dualBrain: { ...state.dualBrain, enabled },
      }));
    },

    setDualBrainThresholds: (complexity: number, uncertainty: number) => {
      set((state: any) => ({
        dualBrain: {
          ...state.dualBrain,
          complexityThreshold: Math.max(0.05, Math.min(0.95, complexity)),
          uncertaintyThreshold: Math.max(0.05, Math.min(0.95, uncertainty)),
        },
      }));
    },

    abortStreaming: () => {
      const { isStreaming, currentRunId, streamingContent } = get();
      if (!isStreaming) return;
      try {
        window.api.chat.abort?.(currentRunId || undefined);
      } catch (_) {
        /* noop */
      }
      const partial = String(streamingContent || '').trim();
      set((state: any) => ({
        isStreaming: false,
        streamingContent: '',
        currentRunId: null,
        moduleStates: { ...state.moduleStates, nexus: 'online' },
        messages: [
          ...state.messages,
          ...(partial
            ? [
                {
                  id: genId(),
                  role: 'assistant' as const,
                  content: partial,
                  timestamp: Date.now(),
                  sourceModule: 'nexus' as const,
                  thinking: true,
                },
              ]
            : []),
          {
            id: genId(),
            role: 'system' as const,
            content: partial ? 'Stopped — kept what arrived above.' : 'Stopped before any response arrived.',
            timestamp: Date.now(),
          },
        ],
      }));
    },

    clearMessages: () => set({ messages: [], streamingContent: '' }),
    loadChatHistory: (messages: ChatMessage[]) =>
      set((state: any) => ({
        messages: Array.isArray(messages)
          ? messages.map((m: any) => ({
              id: m.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              role: m.role || 'user',
              content: typeof m.content === 'string' ? m.content : '',
              timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
              sourceModule: m.sourceModule,
              emotion: m.emotion,
              thinking: m.thinking,
            }))
          : state.messages,
        streamingContent: '',
      })),

    loadConversations: async () => {
      if (!window.api?.conversations?.list || !window.api?.conversations?.load) return;
      const listed = await window.api.conversations.list();
      if (!listed?.success) return;

      const conversations = Array.isArray(listed.conversations) ? listed.conversations : [];
      const activeId = listed.activeConversationId || null;
      set({ conversations, activeConversationId: activeId });

      const targetId = activeId || conversations[0]?.id || null;
      if (!targetId) return;
      const loaded = await window.api.conversations.load(targetId);
      if (!loaded?.success || !loaded.conversation) return;
      const convo = loaded.conversation as Conversation;
      set({
        messages: Array.isArray(convo.messages) ? convo.messages : [],
        activeConversationId: convo.id,
        activeConversationTitle: convo.title || 'New chat',
        activeConversationCreatedAt: typeof convo.createdAt === 'number' ? convo.createdAt : Date.now(),
        streamingContent: '',
      });
    },

    newConversation: async () => {
      if (!window.api?.conversations?.save) {
        set({
          messages: [],
          activeConversationId: genConversationId(),
          activeConversationTitle: 'New chat',
          activeConversationCreatedAt: Date.now(),
        });
        return;
      }
      const id = genConversationId();
      const now = Date.now();
      const convo: Conversation = { id, title: 'New chat', messages: [], createdAt: now, updatedAt: now };
      set({
        messages: [],
        activeConversationId: id,
        activeConversationTitle: 'New chat',
        activeConversationCreatedAt: now,
        streamingContent: '',
      });
      await window.api.conversations.save(convo);
      await get().loadConversations();
    },

    selectConversation: async (conversationId: string) => {
      if (!conversationId || !window.api?.conversations?.load) return;
      const loaded = await window.api.conversations.load(conversationId);
      if (!loaded?.success || !loaded.conversation) return;
      const convo = loaded.conversation as Conversation;
      set({
        messages: Array.isArray(convo.messages) ? convo.messages : [],
        activeConversationId: convo.id,
        activeConversationTitle: convo.title || 'New chat',
        activeConversationCreatedAt: typeof convo.createdAt === 'number' ? convo.createdAt : Date.now(),
        streamingContent: '',
      });
      await get().loadConversations();
    },

    renameConversation: async (conversationId: string, title: string) => {
      if (!conversationId || !window.api?.conversations?.rename) return;
      const trimmed = String(title || '').trim();
      const finalTitle = trimmed || 'New chat';
      await window.api.conversations.rename(conversationId, finalTitle);
      set((state: any) => ({
        activeConversationTitle:
          state.activeConversationId === conversationId ? finalTitle : state.activeConversationTitle,
      }));
      await get().loadConversations();
    },

    deleteConversation: async (conversationId: string) => {
      if (!conversationId || !window.api?.conversations?.delete) return;
      await window.api.conversations.delete(conversationId);
      const listed = window.api?.conversations?.list ? await window.api.conversations.list() : null;
      const nextId = listed?.success ? listed.activeConversationId || listed.conversations?.[0]?.id || null : null;
      if (nextId) {
        await get().selectConversation(nextId);
      } else {
        await get().newConversation();
      }
    },
  };
}
