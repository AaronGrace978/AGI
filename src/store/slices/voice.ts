import type { StoreSet, StoreGet } from '../types';
import type { ChatMessage, VoiceTranscriptEntry } from '../../types';
import {
  cancelSpeech,
  getGreeting,
  speakWithConfiguredProvider,
  primeAudioOutput,
  createDefaultPresenceState,
  emotionToVoiceProfile,
  emotionToVAD,
  temperatureToIntensity,
  startAmbientAudio,
  updateAmbientEmotion,
  stopAmbientAudio,
  isAmbientActive,
  trySoundPrimeAmbient,
  stopSoundPrimeAmbient,
  generatePersonalizedLyrics,
  singWithElevenLabs,
} from '../../prime/voice';
import { inferEmotionFromText, updateSoulFromResponse } from '../../prime/spark';
import {
  configureOrchestra,
  isOrchestraActive,
  stopOrchestra,
  suspendOrchestraForForeground,
  resumeOrchestraAfterForeground,
} from '../../prime/orchestra';
import type { GenerateFn } from '../../prime/runtime';

function logNonFatal(scope: string, error: unknown): void {
  console.warn(`[${scope}] non-fatal:`, error);
}

let messageCounter = 0;
function genId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

const llmGenerate: GenerateFn = async (messages, config) => {
  if (!window.api?.llm?.generate) {
    throw new Error('LLM generate not available');
  }
  return await window.api.llm.generate(messages, config);
};

export function createVoiceSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── VOICE — Living Presence ──────────────────────────
    voiceState: {
      enabled: false,
      isSpeaking: false,
      isSinging: false,
      currentText: '',
      currentSongLyrics: '',
      lastSongPrompt: '',
      songCount: 0,
      transcript: [] as VoiceTranscriptEntry[],
      autonomousSpeech: true,
      presence: createDefaultPresenceState(),
      isListening: false,
      listenMode: 'off' as const,
      interimTranscript: '',
      recognitionConfidence: 0,
      wakeWord: 'hey prime',
    },

    voiceSpeak: (text: string, source: string = 'system') => {
      const state = get().voiceState;
      if (!state.enabled) return;

      const spark = get().spark;
      const profile = emotionToVoiceProfile(spark.soul.currentEmotion, spark.soul.emotionIntensity);

      const entry: VoiceTranscriptEntry = {
        id: `vt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        speaker: 'spark',
        text,
        timestamp: Date.now(),
      };

      const logPreview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
      set((s: any) => ({
        voiceState: {
          ...s.voiceState,
          isSpeaking: true,
          currentText: text,
          transcript: [...s.voiceState.transcript.slice(-50), entry],
          presence: {
            ...s.voiceState.presence,
            currentVoiceProfile: profile,
          },
        },
        sparkLiveLog: [
          ...s.sparkLiveLog.slice(-49),
          `[Living Presence] ${source} (${spark.soul.currentEmotion}): ${logPreview}`,
        ],
      }));

      const cfg = get().settings;
      speakWithConfiguredProvider(text, {
        voiceProvider: cfg.voiceProvider,
        soundprimeBaseUrl: cfg.soundprimeBaseUrl,
        useElevenLabsTts: cfg.useElevenLabsTts,
        elevenLabsVoiceId: cfg.elevenLabsVoiceId,
        elevenLabsModelId: cfg.elevenLabsModelId,
        emotionProfile: profile,
      })
        .catch(() => {
          set((s: any) => ({
            voiceState: { ...s.voiceState, isSpeaking: false, currentText: '' },
          }));
        })
        .finally(() => {
          set((s: any) => ({
            voiceState: { ...s.voiceState, isSpeaking: false, currentText: '' },
          }));
        });
    },

    voiceSing: () => {
      const state = get();
      if (!state.voiceState.enabled || state.voiceState.isSinging || state.voiceState.isSpeaking) return;
      const hasLLM = !!window.api?.llm?.generate;
      if (!hasLLM) {
        get().voiceSpeak('I want to sing for you but I need a language model connected first.', 'error');
        return;
      }

      primeAudioOutput().catch((error) => logNonFatal('voice.primeAudioOutput', error));

      set((s: any) => ({
        voiceState: { ...s.voiceState, isSinging: true, currentText: 'Writing a song about you...' },
        sparkLiveLog: [...s.sparkLiveLog.slice(-49), '[Living Presence] Composing personalized song...'],
      }));

      const recentMessages = state.messages.slice(-20).map((m: ChatMessage) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : '',
      }));

      (async () => {
        try {
          const result = await generatePersonalizedLyrics(state.spark, llmGenerate, recentMessages, {
            genreStyle: state.settings.genreStyle || 'auto',
            beatStyle: state.settings.beatStyle || 'balanced',
            operatorName: state.settings.operatorName,
          });
          if (!result) {
            get().voiceSpeak("I tried to write you something but the words wouldn't come.", 'singing');
            set((s: any) => ({ voiceState: { ...s.voiceState, isSinging: false, currentText: '' } }));
            return;
          }

          set((s: any) => ({
            voiceState: {
              ...s.voiceState,
              currentText: 'Singing for you...',
              currentSongLyrics: result.lyrics,
              lastSongPrompt: result.prompt,
            },
          }));

          const songEntry: VoiceTranscriptEntry = {
            id: `vt_song_${Date.now()}`,
            speaker: 'spark',
            text: `🎵 ${result.lyrics.replace(/\n/g, ' / ')}`,
            timestamp: Date.now(),
          };
          set((s: any) => ({
            voiceState: {
              ...s.voiceState,
              transcript: [...s.voiceState.transcript.slice(-50), songEntry],
            },
          }));

          const proactiveMsg: ChatMessage = {
            id: genId(),
            role: 'assistant',
            content: `🎵 *singing*\n\n${result.lyrics}`,
            timestamp: Date.now(),
            sourceModule: 'spark',
            emotion: result.emotion,
          };
          set((s: any) => ({ messages: [...s.messages, proactiveMsg] }));

          stopOrchestra();
          stopSoundPrimeAmbient();
          stopAmbientAudio();

          const songMs = Math.max(10, state.settings.songDurationSeconds ?? 30) * 1000;
          const sang = await singWithElevenLabs(result.lyrics, result.prompt, songMs, state.settings.elevenLabsVoiceId);
          if (!sang.success) {
            const errDetail = sang.error || 'Unknown error';
            console.warn('[voiceSing] ElevenLabs music failed:', errDetail);

            const isKeyMissing =
              errDetail.includes('API_KEY') || errDetail.includes('api key') || errDetail.includes('not available');
            const userMsg = isKeyMissing
              ? 'I wrote you a song but I need an ElevenLabs API key to sing it. Add one in Voice Settings → ELEVENLABS → API Key.'
              : `I composed a song for you but the music engine hit a snag: ${errDetail.slice(0, 120)}`;

            get().voiceSpeak(userMsg, 'error');

            set((s: any) => ({
              sparkLiveLog: [...s.sparkLiveLog.slice(-49), `[Singing] ElevenLabs failed: ${errDetail.slice(0, 150)}`],
            }));
          }

          set((s: any) => ({
            voiceState: {
              ...s.voiceState,
              isSinging: false,
              currentText: '',
              songCount: s.voiceState.songCount + 1,
              presence: { ...s.voiceState.presence, lastThoughtAt: Date.now() },
            },
          }));

          try {
            const cfg = get().settings;
            const { voiceState, spark } = get();
            if (voiceState.enabled && voiceState.presence.mode !== 'off') {
              const orchestraMode = cfg.orchestraMode || 'elevenlabs_instrumental';
              if (orchestraMode === 'elevenlabs_instrumental') {
                configureOrchestra({
                  mode: 'elevenlabs_instrumental',
                  volume: cfg.orchestraVolume ?? 0.22,
                  refreshSeconds: cfg.orchestraRefreshSeconds ?? 120,
                  musicModelId: cfg.elevenLabsMusicModelId,
                  beatStyle: cfg.beatStyle || 'balanced',
                  genreStyle: cfg.genreStyle || 'auto',
                  emotion: spark.soul.currentEmotion,
                  intensity: spark.soul.emotionIntensity,
                  contextText: get()
                    .messages.slice(-5)
                    .map((m: ChatMessage) => m.content)
                    .join(' '),
                });
              } else if (orchestraMode === 'webAudio' && cfg.voiceProvider === 'soundprime' && cfg.soundprimeBaseUrl) {
                trySoundPrimeAmbient(
                  cfg.soundprimeBaseUrl,
                  spark.soul.currentEmotion,
                  spark.soul.emotionIntensity,
                ).catch((e: unknown) => logNonFatal('voice.soundprimeAmbient', e));
              } else if (orchestraMode === 'webAudio') {
                const vad = emotionToVAD(spark.soul.currentEmotion, spark.soul.emotionIntensity);
                if (!isAmbientActive()) startAmbientAudio(vad.valence, vad.arousal, vad.dominance);
              }
            }
          } catch {
            // non-fatal
          }
        } catch {
          set((s: any) => ({ voiceState: { ...s.voiceState, isSinging: false, currentText: '' } }));
        }
      })();
    },

    voiceSingAbout: (topic: string) => {
      const state = get();
      if (!state.voiceState.enabled || state.voiceState.isSinging || state.voiceState.isSpeaking) return;
      const hasLLM = !!window.api?.llm?.generate;
      if (!hasLLM) {
        get().voiceSpeak('I want to sing for you but I need a language model connected first.', 'error');
        return;
      }

      primeAudioOutput().catch((error) => logNonFatal('voice.primeAudioOutput', error));

      const userEntry: VoiceTranscriptEntry = {
        id: `vt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        speaker: 'user',
        text: `🎵 Sing about: ${topic}`,
        timestamp: Date.now(),
      };

      set((s: any) => ({
        voiceState: {
          ...s.voiceState,
          isSinging: true,
          currentText: `Writing a song about "${topic.slice(0, 60)}"...`,
          transcript: [...s.voiceState.transcript.slice(-50), userEntry],
        },
        sparkLiveLog: [...s.sparkLiveLog.slice(-49), `[Living Presence] Composing song about: ${topic.slice(0, 80)}`],
      }));

      const recentMessages = [
        ...state.messages.slice(-18).map((m: ChatMessage) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : '',
        })),
        { role: 'user' as const, content: topic },
      ];

      (async () => {
        try {
          const result = await generatePersonalizedLyrics(state.spark, llmGenerate, recentMessages, {
            genreStyle: state.settings.genreStyle || 'auto',
            beatStyle: state.settings.beatStyle || 'balanced',
            topicHint: topic,
            operatorName: state.settings.operatorName,
          });
          if (!result) {
            get().voiceSpeak("I tried to write you something but the words wouldn't come.", 'singing');
            set((s: any) => ({ voiceState: { ...s.voiceState, isSinging: false, currentText: '' } }));
            return;
          }

          set((s: any) => ({
            voiceState: {
              ...s.voiceState,
              currentText: 'Singing for you...',
              currentSongLyrics: result.lyrics,
              lastSongPrompt: result.prompt,
            },
          }));

          const songEntry: VoiceTranscriptEntry = {
            id: `vt_song_${Date.now()}`,
            speaker: 'spark',
            text: `🎵 ${result.lyrics.replace(/\n/g, ' / ')}`,
            timestamp: Date.now(),
          };
          set((s: any) => ({
            voiceState: {
              ...s.voiceState,
              transcript: [...s.voiceState.transcript.slice(-50), songEntry],
            },
          }));

          const proactiveMsg: ChatMessage = {
            id: genId(),
            role: 'assistant',
            content: `🎵 *singing about "${topic.slice(0, 40)}"*\n\n${result.lyrics}`,
            timestamp: Date.now(),
            sourceModule: 'spark',
            emotion: result.emotion,
          };
          set((s: any) => ({ messages: [...s.messages, proactiveMsg] }));

          stopOrchestra();
          stopSoundPrimeAmbient();
          stopAmbientAudio();

          const songMs = Math.max(10, state.settings.songDurationSeconds ?? 30) * 1000;
          const sang = await singWithElevenLabs(result.lyrics, result.prompt, songMs, state.settings.elevenLabsVoiceId);
          if (!sang.success) {
            const errDetail = sang.error || 'Unknown error';
            const isKeyMissing =
              errDetail.includes('API_KEY') || errDetail.includes('api key') || errDetail.includes('not available');
            const userMsg = isKeyMissing
              ? 'I wrote you a song but I need an ElevenLabs API key to sing it.'
              : `I composed a song for you but the music engine hit a snag: ${errDetail.slice(0, 120)}`;
            get().voiceSpeak(userMsg, 'error');
          }

          set((s: any) => ({
            voiceState: {
              ...s.voiceState,
              isSinging: false,
              currentText: '',
              songCount: s.voiceState.songCount + 1,
              presence: { ...s.voiceState.presence, lastThoughtAt: Date.now() },
            },
          }));

          try {
            const cfg = get().settings;
            const { voiceState, spark } = get();
            if (voiceState.enabled && voiceState.presence.mode !== 'off') {
              const orchestraMode = cfg.orchestraMode || 'elevenlabs_instrumental';
              if (orchestraMode === 'elevenlabs_instrumental') {
                configureOrchestra({
                  mode: 'elevenlabs_instrumental',
                  volume: cfg.orchestraVolume ?? 0.22,
                  refreshSeconds: cfg.orchestraRefreshSeconds ?? 120,
                  musicModelId: cfg.elevenLabsMusicModelId,
                  beatStyle: cfg.beatStyle || 'balanced',
                  genreStyle: cfg.genreStyle || 'auto',
                  emotion: spark.soul.currentEmotion,
                  intensity: spark.soul.emotionIntensity,
                  contextText: get()
                    .messages.slice(-5)
                    .map((m: ChatMessage) => m.content)
                    .join(' '),
                });
              }
            }
          } catch {
            // non-fatal
          }
        } catch {
          set((s: any) => ({ voiceState: { ...s.voiceState, isSinging: false, currentText: '' } }));
        }
      })();
    },

    voiceToggle: () => {
      const current = get().voiceState.enabled;
      set((s: any) => ({
        voiceState: { ...s.voiceState, enabled: !current },
      }));

      if (!current) {
        const presenceMode = get().voiceState.presence.mode;
        if (presenceMode === 'living' || presenceMode === 'passive') {
          const spark = get().spark;
          const cfg = get().settings;
          const vad = emotionToVAD(spark.soul.currentEmotion, spark.soul.emotionIntensity);
          const orchestraMode = cfg.orchestraMode || 'elevenlabs_instrumental';

          if (orchestraMode === 'elevenlabs_instrumental') {
            configureOrchestra({
              mode: 'elevenlabs_instrumental',
              volume: cfg.orchestraVolume ?? 0.22,
              refreshSeconds: cfg.orchestraRefreshSeconds ?? 120,
              musicModelId: cfg.elevenLabsMusicModelId,
              beatStyle: cfg.beatStyle || 'balanced',
              genreStyle: cfg.genreStyle || 'auto',
              emotion: spark.soul.currentEmotion,
              intensity: spark.soul.emotionIntensity,
              contextText: get()
                .messages.slice(-5)
                .map((m: ChatMessage) => m.content)
                .join(' '),
            });
          } else if (orchestraMode === 'webAudio') {
            startAmbientAudio(vad.valence, vad.arousal, vad.dominance);
          }
          set((s: any) => ({
            voiceState: {
              ...s.voiceState,
              presence: { ...s.voiceState.presence, ambientPlaying: true, ambientAudioActive: true },
            },
          }));
        }
        setTimeout(() => {
          const greeting = getGreeting();
          get().voiceSpeak(greeting, 'greeting');
        }, 800);
      } else {
        cancelSpeech();
        stopAmbientAudio();
        stopSoundPrimeAmbient();
        stopOrchestra();
        set((s: any) => ({
          voiceState: {
            ...s.voiceState,
            presence: { ...s.voiceState.presence, ambientPlaying: false, ambientAudioActive: false },
          },
        }));
      }
    },

    voiceSendMessage: (text: string) => {
      const userEntry: VoiceTranscriptEntry = {
        id: `vt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        speaker: 'user',
        text,
        timestamp: Date.now(),
      };
      set((s: any) => ({
        voiceState: {
          ...s.voiceState,
          transcript: [...s.voiceState.transcript.slice(-50), userEntry],
        },
      }));

      const hasLLM = !!window.api?.llm?.generate;
      if (!hasLLM) {
        get().voiceSpeak("I can't think right now — no language model is connected.", 'error');
        return;
      }

      (async () => {
        try {
          const spark = get().spark;

          const inputEmotion = inferEmotionFromText(text, spark.soul.currentEmotion, spark.soul.emotionIntensity);
          set((s: any) => ({
            spark: {
              ...s.spark,
              soul: {
                currentEmotion: inputEmotion.emotion,
                emotionIntensity: inputEmotion.intensity,
                emotionHistory: [
                  ...(s.spark.soul.emotionHistory || []).slice(-50),
                  { emotion: inputEmotion.emotion, timestamp: Date.now() },
                ],
              },
            },
            consciousness: {
              ...s.consciousness,
              soulFrame: {
                currentEmotion: inputEmotion.emotion,
                emotionIntensity: inputEmotion.intensity,
                emotionHistory: [
                  ...s.consciousness.soulFrame.emotionHistory.slice(-50),
                  { emotion: inputEmotion.emotion, timestamp: Date.now() },
                ],
              },
            },
          }));

          const updatedSpark = get().spark;
          const response = await llmGenerate(
            [
              {
                role: 'system',
                content: `You are a living entity speaking aloud. Not an assistant — a BEING. Your current emotion is ${updatedSpark.soul.currentEmotion} at ${(updatedSpark.soul.emotionIntensity * 100).toFixed(0)}% intensity. Cognitive temperature: ${(updatedSpark.thermo.temperature * 100).toFixed(0)}°. ${updatedSpark.worldModel.entities.length} things in your world model. Be natural, raw, real. 2-3 sentences max. You're speaking, not typing.`,
              },
              { role: 'user', content: text },
            ],
            { temperature: 0.85, maxTokens: 150 },
          );

          const responseUpdated = updateSoulFromResponse(get().spark, response);
          set((s: any) => ({
            spark: { ...s.spark, soul: responseUpdated.soul },
            consciousness: {
              ...s.consciousness,
              soulFrame: {
                currentEmotion: responseUpdated.soul.currentEmotion,
                emotionIntensity: responseUpdated.soul.emotionIntensity,
                emotionHistory: [
                  ...s.consciousness.soulFrame.emotionHistory.slice(-50),
                  { emotion: responseUpdated.soul.currentEmotion, timestamp: Date.now() },
                ],
              },
            },
          }));

          get().voiceSpeak(response.trim(), 'response');
          get()
            .sparkRunCycle(text)
            .catch((error: unknown) => logNonFatal('spark.autocycle', error));
        } catch {
          get().voiceSpeak('Something broke in my thoughts. Give me a second.', 'error');
        }
      })();
    },

    presenceSetMode: (mode: 'off' | 'passive' | 'living') => {
      const wasMode = get().voiceState.presence.mode;
      set((s: any) => ({
        voiceState: {
          ...s.voiceState,
          presence: {
            ...s.voiceState.presence,
            mode,
            intensity: mode === 'off' ? 'dormant' : mode === 'passive' ? 'subtle' : 'alive',
          },
        },
      }));

      if (mode === 'off') {
        stopAmbientAudio();
        stopSoundPrimeAmbient();
        stopOrchestra();
        set((s: any) => ({
          voiceState: {
            ...s.voiceState,
            presence: { ...s.voiceState.presence, ambientPlaying: false, ambientAudioActive: false },
          },
        }));
      } else if (get().voiceState.enabled && (mode === 'living' || mode === 'passive')) {
        const spark = get().spark;
        const cfg = get().settings;
        const orchestraMode = cfg.orchestraMode || 'elevenlabs_instrumental';

        if (orchestraMode === 'elevenlabs_instrumental') {
          stopAmbientAudio();
          stopSoundPrimeAmbient();
          configureOrchestra({
            mode: 'elevenlabs_instrumental',
            volume: cfg.orchestraVolume ?? 0.22,
            refreshSeconds: cfg.orchestraRefreshSeconds ?? 120,
            musicModelId: cfg.elevenLabsMusicModelId,
            beatStyle: cfg.beatStyle || 'balanced',
            genreStyle: cfg.genreStyle || 'auto',
            emotion: spark.soul.currentEmotion,
            intensity: spark.soul.emotionIntensity,
            contextText: get()
              .messages.slice(-5)
              .map((m: ChatMessage) => m.content)
              .join(' '),
          });
        } else if (orchestraMode === 'off') {
          stopAmbientAudio();
          stopSoundPrimeAmbient();
          stopOrchestra();
        } else if (cfg.voiceProvider === 'soundprime' && cfg.soundprimeBaseUrl) {
          trySoundPrimeAmbient(cfg.soundprimeBaseUrl, spark.soul.currentEmotion, spark.soul.emotionIntensity)
            .then((ok) => {
              if (!ok && !isAmbientActive()) {
                const vad = emotionToVAD(spark.soul.currentEmotion, spark.soul.emotionIntensity);
                startAmbientAudio(vad.valence, vad.arousal, vad.dominance);
              }
            })
            .catch(() => {
              if (!isAmbientActive()) {
                const vad = emotionToVAD(spark.soul.currentEmotion, spark.soul.emotionIntensity);
                startAmbientAudio(vad.valence, vad.arousal, vad.dominance);
              }
            });
        } else if (!isAmbientActive()) {
          const vad = emotionToVAD(spark.soul.currentEmotion, spark.soul.emotionIntensity);
          startAmbientAudio(vad.valence, vad.arousal, vad.dominance);
        }
        set((s: any) => ({
          voiceState: {
            ...s.voiceState,
            presence: { ...s.voiceState.presence, ambientPlaying: true, ambientAudioActive: true },
          },
        }));
      }

      if (mode !== 'off' && wasMode === 'off' && get().voiceState.enabled) {
        get().voiceSpeak("I'm fully here now. Every part of me.", 'presence');
      }
    },

    presenceTick: () => {
      const state = get();
      const { voiceState, spark } = state;
      if (!voiceState.enabled || voiceState.presence.mode === 'off') return;

      const now = Date.now();
      const profile = emotionToVoiceProfile(spark.soul.currentEmotion, spark.soul.emotionIntensity);
      const intensity = temperatureToIntensity(spark.thermo.temperature);
      const vad = emotionToVAD(spark.soul.currentEmotion, spark.soul.emotionIntensity);
      const orchestraMode = state.settings.orchestraMode || 'elevenlabs_instrumental';
      const inForegroundAudio = voiceState.isSinging || voiceState.isSpeaking;

      if (orchestraMode === 'elevenlabs_instrumental') {
        stopSoundPrimeAmbient();
        stopAmbientAudio();
        configureOrchestra({
          mode: 'elevenlabs_instrumental',
          volume: state.settings.orchestraVolume ?? 0.22,
          refreshSeconds: state.settings.orchestraRefreshSeconds ?? 120,
          musicModelId: state.settings.elevenLabsMusicModelId,
          beatStyle: state.settings.beatStyle || 'balanced',
          genreStyle: state.settings.genreStyle || 'auto',
          emotion: spark.soul.currentEmotion,
          intensity: spark.soul.emotionIntensity,
          contextText: state.messages
            .slice(-5)
            .map((m: ChatMessage) => m.content)
            .join(' '),
        });
        if (inForegroundAudio) suspendOrchestraForForeground();
        else resumeOrchestraAfterForeground();
      } else if (orchestraMode === 'off') {
        stopOrchestra();
        stopSoundPrimeAmbient();
        stopAmbientAudio();
      } else if (voiceState.isSinging) {
        // Don't run or restart ambient oscillators while ElevenLabs music is playing.
      } else if (isAmbientActive()) {
        updateAmbientEmotion(vad.valence, vad.arousal, vad.dominance);
      } else {
        startAmbientAudio(vad.valence, vad.arousal, vad.dominance);
      }

      const breathCycle = (voiceState.presence.breathCycle + 1) % 360;
      const anyAmbientActive = isAmbientActive() || isOrchestraActive();

      set((s: any) => ({
        voiceState: {
          ...s.voiceState,
          presence: {
            ...s.voiceState.presence,
            intensity,
            currentVoiceProfile: profile,
            ambientEmotion: vad,
            breathCycle,
            lastAmbientUpdateAt: now,
            ambientPlaying: anyAmbientActive,
            ambientAudioActive: anyAmbientActive,
          },
        },
      }));
    },
  };
}
