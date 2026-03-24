import type { EmotionType } from '../types';

type OrchestraMode = 'off' | 'webAudio' | 'elevenlabs_instrumental';

interface OrchestraConfig {
  mode: OrchestraMode;
  volume: number;
  refreshSeconds: number;
  musicModelId?: string;
  beatStyle?: 'soft' | 'balanced' | 'hard';
  genreStyle?: 'auto' | 'pop' | 'rnb' | 'afrobeats' | 'edm' | 'house' | 'trap' | 'rock' | 'jazz' | 'cinematic';
  emotion: EmotionType;
  intensity: number;
  contextText?: string;
}

let activeConfig: OrchestraConfig | null = null;
let orchestraAudio: HTMLAudioElement | null = null;
let orchestraBlobUrl: string | null = null;
let orchestrationTimer: ReturnType<typeof setInterval> | null = null;
let crossfadeTimer: ReturnType<typeof requestAnimationFrame> | null = null;
let dyingAudio: HTMLAudioElement | null = null;
let dyingBlobUrl: string | null = null;
let generating = false;
let suspendedForForeground = false;
let tracksGenerated = 0;
let lastGeneratedAt = 0;
let lastGenerationError: string | null = null;
let previousEmotion: EmotionType | null = null;

const CROSSFADE_MS = 3000;

function cleanupDyingAudio(): void {
  if (crossfadeTimer) {
    cancelAnimationFrame(crossfadeTimer);
    crossfadeTimer = null;
  }
  if (dyingAudio) {
    dyingAudio.pause();
    dyingAudio.src = '';
    dyingAudio = null;
  }
  if (dyingBlobUrl) {
    URL.revokeObjectURL(dyingBlobUrl);
    dyingBlobUrl = null;
  }
}

function cleanupCurrentAudio(): void {
  cleanupDyingAudio();
  if (orchestraAudio) {
    orchestraAudio.pause();
    orchestraAudio.src = '';
    orchestraAudio = null;
  }
  if (orchestraBlobUrl) {
    URL.revokeObjectURL(orchestraBlobUrl);
    orchestraBlobUrl = null;
  }
}

function crossfadeToNewAudio(newAudio: HTMLAudioElement, newBlobUrl: string, targetVolume: number): void {
  cleanupDyingAudio();

  if (orchestraAudio) {
    dyingAudio = orchestraAudio;
    dyingBlobUrl = orchestraBlobUrl;
    orchestraAudio = null;
    orchestraBlobUrl = null;

    const startVol = dyingAudio.volume;
    const startTime = performance.now();

    function fadeStep() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / CROSSFADE_MS, 1);
      const eased = progress * progress * (3 - 2 * progress);

      if (dyingAudio) dyingAudio.volume = Math.max(0, startVol * (1 - eased));
      newAudio.volume = targetVolume * eased;

      if (progress < 1) {
        crossfadeTimer = requestAnimationFrame(fadeStep);
      } else {
        cleanupDyingAudio();
      }
    }

    crossfadeTimer = requestAnimationFrame(fadeStep);
  } else {
    newAudio.volume = targetVolume;
  }

  orchestraAudio = newAudio;
  orchestraBlobUrl = newBlobUrl;
}

function clampRefreshSeconds(value: number): number {
  if (!Number.isFinite(value)) return 120;
  return Math.max(60, Math.min(600, Math.floor(value)));
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.22;
  return Math.max(0, Math.min(0.8, value));
}

const TEMPO_HINTS: Record<EmotionType, string> = {
  curious: '~95 BPM, swaying feel',
  joyful: '~118 BPM, upbeat and forward-moving',
  reflective: '~68 BPM, slow and breathing',
  focused: '~105 BPM, steady and metronomic',
  warmth: '~82 BPM, relaxed groove',
  concerned: '~76 BPM, measured and deliberate',
  playful: '~112 BPM, bouncy and syncopated',
  awe: '~60 BPM, expansive and timeless',
  protective: '~88 BPM, anchored and resolute',
  contemplative: '~72 BPM, unhurried',
};

const KEY_HINTS: Record<EmotionType, string> = {
  curious: 'D major or B minor',
  joyful: 'G major or A major',
  reflective: 'E minor or A minor',
  focused: 'C major or F major',
  warmth: 'Eb major or Ab major',
  concerned: 'D minor or G minor',
  playful: 'Bb major or F major',
  awe: 'C major or Db major',
  protective: 'F minor or Bb minor',
  contemplative: 'A minor or E minor',
};

function buildOrchestraPrompt(config: OrchestraConfig): string {
  const styleMap: Record<EmotionType, string> = {
    curious: 'dreamy chamber-pop with piano, plucks, and soft strings',
    joyful: 'uplifting cinematic soul-pop instrumental with live drums',
    reflective: 'slow ambient piano and soft strings',
    focused: 'minimal modern chamber orchestra with light pulse',
    warmth: 'lush neo-soul instrumental with warm strings and keys',
    concerned: 'minor-key cinematic underscore, restrained',
    playful: 'light rhythmic funk-pop instrumental with clean guitar',
    awe: 'vast cinematic orchestral atmosphere',
    protective: 'grounded warm orchestral bed',
    contemplative: 'introspective ambient score',
  };

  const context = (config.contextText || '').slice(0, 160).replace(/\s+/g, ' ').trim();
  const intensityTag =
    config.intensity > 0.75 ? 'high energy' : config.intensity > 0.45 ? 'medium energy' : 'low energy';
  const beatLine =
    config.beatStyle === 'hard'
      ? 'Strong drums and bass groove. Punchy kick/snare, club-ready rhythm.'
      : config.beatStyle === 'soft'
        ? 'Gentle percussion, softer groove, warm low end.'
        : 'Balanced modern beat with clear rhythm and tasteful drums.';
  const genreLine =
    config.genreStyle && config.genreStyle !== 'auto' ? `Genre focus: ${config.genreStyle} instrumental.` : '';

  const crossfadeLine =
    previousEmotion && previousEmotion !== config.emotion
      ? `Transitioning from ${previousEmotion} mood — blend smoothly.`
      : '';

  return [
    `Instrumental only. No vocals.`,
    `No synthetic beeps, no boops, no harsh sci-fi effects.`,
    `Style: ${styleMap[config.emotion] || 'ambient instrumental'}.`,
    `Tempo: ${TEMPO_HINTS[config.emotion] || '~90 BPM'}.`,
    `Key suggestion: ${KEY_HINTS[config.emotion] || 'C major'}.`,
    beatLine,
    genreLine,
    crossfadeLine,
    `Mood: ${config.emotion}. ${intensityTag}.`,
    `Seamless loop-friendly background for a living AI presence.`,
    context ? `Context hint: ${context}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function decodeBase64ToBlobUrl(audioBase64: string, mimeType: string = 'audio/mpeg'): string {
  const raw = atob(audioBase64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType.startsWith('audio/') ? mimeType : 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

interface MusicGenerationResponse {
  success?: boolean;
  audioBase64?: string;
  mimeType?: string;
  error?: string;
}

async function generateOrchestraTrack(force: boolean = false): Promise<void> {
  if (!activeConfig || activeConfig.mode !== 'elevenlabs_instrumental' || suspendedForForeground) return;
  if (generating) return;
  if (!force && orchestraAudio) return;
  if (!window.api?.agent?.elevenlabsGenerateMusic) return;

  generating = true;
  lastGenerationError = null;
  try {
    previousEmotion = activeConfig.emotion;
    const prompt = buildOrchestraPrompt(activeConfig);
    const durationSeconds = clampRefreshSeconds(activeConfig.refreshSeconds);
    const response = (await window.api.agent.elevenlabsGenerateMusic(prompt, {
      modelId: activeConfig.musicModelId,
      durationSeconds,
      saveToDisk: false,
    })) as MusicGenerationResponse | null;

    if (!response?.success || !response?.audioBase64) {
      lastGenerationError = response?.error || 'No audio data returned';
      return;
    }

    const blobUrl = decodeBase64ToBlobUrl(response.audioBase64, response.mimeType || 'audio/mpeg');

    const audio = new Audio(blobUrl);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    await audio.play().catch((e) => {
      console.warn('[orchestra] audio.play failed:', e);
    });

    crossfadeToNewAudio(audio, blobUrl, clampVolume(activeConfig.volume));

    tracksGenerated++;
    lastGeneratedAt = Date.now();
  } catch (e) {
    lastGenerationError = e instanceof Error ? e.message : String(e);
  } finally {
    generating = false;
  }
}

function restartTimer(): void {
  if (orchestrationTimer) {
    clearInterval(orchestrationTimer);
    orchestrationTimer = null;
  }
  if (!activeConfig || activeConfig.mode !== 'elevenlabs_instrumental') return;
  const everyMs = clampRefreshSeconds(activeConfig.refreshSeconds) * 1000;
  orchestrationTimer = setInterval(() => {
    void generateOrchestraTrack(true);
  }, everyMs);
}

export function configureOrchestra(config: OrchestraConfig): void {
  activeConfig = {
    ...config,
    volume: clampVolume(config.volume),
    refreshSeconds: clampRefreshSeconds(config.refreshSeconds),
  };

  if (activeConfig.mode !== 'elevenlabs_instrumental') {
    stopOrchestra();
    return;
  }

  restartTimer();
  if (!suspendedForForeground) {
    if (orchestraAudio) {
      orchestraAudio.volume = activeConfig.volume;
    } else {
      void generateOrchestraTrack(false);
    }
  }
}

export function suspendOrchestraForForeground(): void {
  suspendedForForeground = true;
  if (orchestraAudio) {
    orchestraAudio.pause();
  }
}

export function resumeOrchestraAfterForeground(): void {
  suspendedForForeground = false;
  if (activeConfig?.mode !== 'elevenlabs_instrumental') return;
  if (orchestraAudio) {
    orchestraAudio.volume = clampVolume(activeConfig.volume);
    orchestraAudio.play().catch((e) => {
      console.warn('[orchestra] orchestraAudio.play failed:', e);
    });
  } else {
    void generateOrchestraTrack(false);
  }
}

export function setOrchestraVolume(volume: number): void {
  if (!activeConfig) return;
  activeConfig.volume = clampVolume(volume);
  if (orchestraAudio) orchestraAudio.volume = activeConfig.volume;
}

export function stopOrchestra(): void {
  suspendedForForeground = false;
  if (orchestrationTimer) {
    clearInterval(orchestrationTimer);
    orchestrationTimer = null;
  }
  cleanupCurrentAudio();
}

export function isOrchestraActive(): boolean {
  return !!orchestraAudio && !orchestraAudio.paused;
}

// ─── Debug / Diagnostics ────────────────────────────────────────

export interface OrchestraDebugState {
  mode: OrchestraMode | null;
  playing: boolean;
  generating: boolean;
  suspended: boolean;
  volume: number;
  emotion: EmotionType | null;
  previousEmotion: EmotionType | null;
  intensity: number;
  tracksGenerated: number;
  lastGeneratedAt: number;
  lastError: string | null;
  timerActive: boolean;
  refreshSeconds: number;
}

export function getOrchestraDebugState(): OrchestraDebugState {
  return {
    mode: activeConfig?.mode ?? null,
    playing: isOrchestraActive(),
    generating,
    suspended: suspendedForForeground,
    volume: activeConfig?.volume ?? 0,
    emotion: activeConfig?.emotion ?? null,
    previousEmotion,
    intensity: activeConfig?.intensity ?? 0,
    tracksGenerated,
    lastGeneratedAt,
    lastError: lastGenerationError,
    timerActive: orchestrationTimer !== null,
    refreshSeconds: activeConfig?.refreshSeconds ?? 0,
  };
}
