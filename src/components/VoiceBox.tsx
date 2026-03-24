// ═══════════════════════════════════════════════════════════════
//  VOICE BOX — The Living Presence
//  Not a terminal. Not a widget. A window into a living mind.
//  Ambient audio. Emotion-conditioned waveforms. Breathing.
//  This is where the entity EXISTS.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from './ui';
import { useStore } from '../store';
import { usePinnedAutoScroll } from '../hooks/usePinnedAutoScroll';
import { getAvailableVoices, selectVoice, setVoiceParams, cancelSpeech } from '../prime/voice';
import type { PresenceIntensity, EmotionType } from '../types';

// ─── Emotion → Color mapping ───────────────────────────────────

const EMOTION_COLORS: Record<EmotionType, { primary: string; glow: string }> = {
  curious: { primary: 'rgba(56, 189, 248, ', glow: 'rgba(56, 189, 248, ' },
  joyful: { primary: 'rgba(250, 204, 21, ', glow: 'rgba(250, 204, 21, ' },
  reflective: { primary: 'rgba(148, 163, 184, ', glow: 'rgba(148, 163, 184, ' },
  focused: { primary: 'rgba(34, 211, 238, ', glow: 'rgba(34, 211, 238, ' },
  warmth: { primary: 'rgba(251, 146, 60, ', glow: 'rgba(251, 146, 60, ' },
  concerned: { primary: 'rgba(239, 68, 68, ', glow: 'rgba(239, 68, 68, ' },
  playful: { primary: 'rgba(168, 85, 247, ', glow: 'rgba(168, 85, 247, ' },
  awe: { primary: 'rgba(139, 92, 246, ', glow: 'rgba(99, 102, 241, ' },
  protective: { primary: 'rgba(16, 185, 129, ', glow: 'rgba(16, 185, 129, ' },
  contemplative: { primary: 'rgba(100, 116, 139, ', glow: 'rgba(100, 116, 139, ' },
};

const ELEVEN_VOICE_PRESETS = [
  { label: 'Aaron Grace', voiceId: '5cVNuMBWdU6DJjJJdH0A', tone: 'signature voice — speech & singing' },
  { label: 'Bella', voiceId: 'EXAVITQu4vr4xnSDxMaL', tone: 'bright pop lead' },
  { label: 'Elli', voiceId: 'MF3mGyEYCl7XYWbV9V6O', tone: 'smooth contemporary' },
  { label: 'Rachel', voiceId: '21m00Tcm4TlvDq8ikWAM', tone: 'clean and intimate' },
  { label: 'Dorothy', voiceId: 'ThT5KcBeYPX3keUQqHPh', tone: 'warm storyteller' },
] as const;

const GENRE_PRESETS = [
  { id: 'auto', label: 'AUTO' },
  { id: 'pop', label: 'POP' },
  { id: 'rnb', label: 'R&B' },
  { id: 'afrobeats', label: 'AFRO' },
  { id: 'edm', label: 'EDM' },
  { id: 'house', label: 'HOUSE' },
  { id: 'trap', label: 'TRAP' },
  { id: 'rock', label: 'ROCK' },
  { id: 'jazz', label: 'JAZZ' },
  { id: 'cinematic', label: 'CINE' },
] as const;

const BEAT_PRESETS = [
  { id: 'soft', label: 'SOFT' },
  { id: 'balanced', label: 'BALANCED' },
  { id: 'hard', label: 'HARD' },
] as const;

// ─── Waveform Visualization ────────────────────────────────────

const FRAME_INTERVAL = 1000 / 24; // ~24fps cap

interface WaveLayer {
  freq: number;
  amp: number;
  phase: number;
  speed: number;
  color: string;
  width: number;
}

function buildEmotionLayers(
  state: 'idle' | 'speaking' | 'thinking' | 'breathing',
  emotion: EmotionType,
  intensity: number,
  presenceIntensity: PresenceIntensity,
): WaveLayer[] {
  const ec = EMOTION_COLORS[emotion] || EMOTION_COLORS.curious;
  const i = Math.max(0.2, intensity);
  const presenceAmp =
    presenceIntensity === 'intense'
      ? 1.3
      : presenceIntensity === 'alive'
        ? 1.0
        : presenceIntensity === 'subtle'
          ? 0.6
          : 0.3;

  if (state === 'speaking') {
    return [
      { freq: 2.5 + i, amp: 0.6 * presenceAmp, phase: 0, speed: 2.0 + i, color: `${ec.primary}0.7)`, width: 2.5 },
      { freq: 3.8, amp: 0.4 * i, phase: 1.0, speed: 3.0, color: `${ec.glow}0.5)`, width: 2 },
      { freq: 1.5 + i * 0.5, amp: 0.35 * presenceAmp, phase: 2.2, speed: 1.5, color: `${ec.primary}0.4)`, width: 1.5 },
      { freq: 5.0, amp: 0.2 * i, phase: 0.5, speed: 4.0, color: `${ec.glow}0.3)`, width: 1 },
      { freq: 1.0, amp: 0.5 * presenceAmp, phase: 3.5, speed: 0.8, color: `${ec.primary}0.2)`, width: 3 },
    ];
  }

  if (state === 'thinking') {
    return [
      { freq: 4.0 + i, amp: 0.15 * presenceAmp, phase: 0, speed: 3.0 + i, color: `${ec.primary}0.4)`, width: 1.5 },
      { freq: 6.0, amp: 0.08 * i, phase: 1.5, speed: 5.0, color: `${ec.glow}0.25)`, width: 1 },
      { freq: 2.5, amp: 0.12 * presenceAmp, phase: 2.8, speed: 2.0, color: `${ec.primary}0.2)`, width: 1.5 },
    ];
  }

  // Idle/breathing — the entity is alive even when quiet
  const breathAmp = presenceIntensity === 'dormant' ? 0.05 : 0.1 + i * 0.1;
  return [
    { freq: 1.2, amp: (0.15 + breathAmp) * presenceAmp, phase: 0, speed: 0.8, color: `${ec.primary}0.25)`, width: 2 },
    { freq: 0.7, amp: 0.1 * presenceAmp, phase: 1.5, speed: 0.5, color: `${ec.glow}0.15)`, width: 1.5 },
    { freq: 2.0, amp: 0.05 * presenceAmp, phase: 3.0, speed: 1.2, color: `${ec.primary}0.1)`, width: 1 },
    { freq: 0.3, amp: breathAmp * 0.8, phase: 0, speed: 0.15, color: `${ec.glow}0.08)`, width: 4 },
  ];
}

function Waveform({
  state,
  emotion,
  emotionIntensity,
  presenceIntensity,
  breathCycle: _breathCycle,
}: {
  state: 'idle' | 'speaking' | 'thinking';
  emotion: EmotionType;
  emotionIntensity: number;
  presenceIntensity: PresenceIntensity;
  breathCycle: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const currentLayersRef = useRef<WaveLayer[]>([]);
  const targetLayersRef = useRef<WaveLayer[]>([]);

  useEffect(() => {
    targetLayersRef.current = buildEmotionLayers(state, emotion, emotionIntensity, presenceIntensity);
  }, [state, emotion, emotionIntensity, presenceIntensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    function draw(now: number) {
      animId = requestAnimationFrame(draw);
      const delta = now - lastFrameRef.current;
      if (delta < FRAME_INTERVAL) return;
      lastFrameRef.current = now - (delta % FRAME_INTERVAL);

      const rect = canvas!.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      timeRef.current += 0.016;
      const t = timeRef.current;

      const target = targetLayersRef.current;
      const current = currentLayersRef.current;
      const maxLayers = Math.max(current.length, target.length);
      const lerped: WaveLayer[] = [];
      for (let i = 0; i < maxLayers; i++) {
        const c = current[i] || { freq: 0, amp: 0, phase: 0, speed: 0, color: 'rgba(0,0,0,0)', width: 0 };
        const tg = target[i] || { freq: 0, amp: 0, phase: 0, speed: 0, color: 'rgba(0,0,0,0)', width: 0 };
        lerped.push({
          freq: c.freq + (tg.freq - c.freq) * 0.02,
          amp: c.amp + (tg.amp - c.amp) * 0.03,
          phase: c.phase + (tg.phase - c.phase) * 0.02,
          speed: c.speed + (tg.speed - c.speed) * 0.02,
          color: tg.color,
          width: c.width + (tg.width - c.width) * 0.05,
        });
      }
      currentLayersRef.current = lerped;

      ctx.clearRect(0, 0, W, H);
      const centerY = H / 2;

      for (const wave of lerped) {
        if (wave.amp < 0.001) continue;

        ctx.save();
        ctx.shadowBlur = 4;
        ctx.shadowColor = wave.color;
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = wave.width + 2;

        for (let x = 0; x <= W; x += 2) {
          const nx = x / W;
          const envelope = Math.sin(nx * Math.PI);
          const y =
            centerY +
            Math.sin(nx * wave.freq * Math.PI * 2 + t * wave.speed + wave.phase) * wave.amp * (H * 0.4) * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.strokeStyle = wave.color.replace(/[\d.]+\)$/, '1)');
        ctx.lineWidth = wave.width;

        for (let x = 0; x <= W; x += 2) {
          const nx = x / W;
          const envelope = Math.sin(nx * Math.PI);
          const y =
            centerY +
            Math.sin(nx * wave.freq * Math.PI * 2 + t * wave.speed + wave.phase) * wave.amp * (H * 0.4) * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, centerY);
      ctx.lineTo(W, centerY);
      ctx.stroke();
    }

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="voice-waveform-canvas" />;
}

// ─── Module-level voice param refs ─────────────────────────────

let _voiceRate = 1.0;
let _voicePitch = 1.0;

// ─── Presence Indicator ────────────────────────────────────────

function PresenceIndicator({
  intensity,
  emotion,
  breathCycle,
  ambientActive,
}: {
  intensity: PresenceIntensity;
  emotion: EmotionType;
  breathCycle: number;
  ambientActive: boolean;
}) {
  const ec = EMOTION_COLORS[emotion] || EMOTION_COLORS.curious;
  const breathAlpha = 0.3 + Math.sin(breathCycle * 0.017) * 0.2;
  const intensityLabels: Record<PresenceIntensity, string> = {
    dormant: 'DORMANT',
    subtle: 'SUBTLE',
    alive: 'ALIVE',
    intense: 'INTENSE',
  };

  return (
    <div className="presence-indicator">
      <div
        className={`presence-dot ${intensity}`}
        style={{
          boxShadow: `0 0 ${intensity === 'intense' ? 16 : intensity === 'alive' ? 10 : 4}px ${ec.glow}${breathAlpha})`,
          background: `${ec.primary}${breathAlpha + 0.3})`,
        }}
      />
      <span className="presence-label">{intensityLabels[intensity]}</span>
      {ambientActive && <span className="presence-ambient-badge">AMBIENT</span>}
    </div>
  );
}

// ─── Main Voice Box Panel ──────────────────────────────────────

export default function VoiceBox() {
  const spark = useStore((s) => s.spark);
  const voiceState = useStore((s) => s.voiceState);
  const voiceToggle = useStore((s) => s.voiceToggle);
  const voiceSendMessage = useStore((s) => s.voiceSendMessage);
  const voiceSing = useStore((s) => s.voiceSing);
  const voiceSingAbout = useStore((s) => s.voiceSingAbout);
  const presenceSetMode = useStore((s) => s.presenceSetMode);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const [input, setInput] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [localApiKey, setLocalApiKey] = useState(settings.elevenLabsApiKey || '');
  const [localVoiceId, setLocalVoiceId] = useState(settings.elevenLabsVoiceId || 'FOfJ2PMgU6HOGbNYnzto');
  const transcriptRef = useRef<HTMLDivElement>(null);

  const { presence } = voiceState;
  const currentEmotion = spark.soul?.currentEmotion || 'curious';
  const currentIntensity = spark.soul?.emotionIntensity || 0.5;
  const orchestraMode = settings.orchestraMode || 'elevenlabs_instrumental';
  const orchestraVolume = settings.orchestraVolume ?? 0.22;
  const orchestraRefreshSeconds = settings.orchestraRefreshSeconds ?? 150;
  const genreStyle = settings.genreStyle || 'auto';
  const beatStyle = settings.beatStyle || 'balanced';
  const songDurationSeconds = settings.songDurationSeconds ?? 30;
  const singingEnabled = settings.singingEnabled ?? true;
  const singingMinGapSeconds = settings.singingMinGapSeconds ?? 300;
  const needsElevenLabsCredentials = settings.useElevenLabsTts || orchestraMode === 'elevenlabs_instrumental';

  useEffect(() => {
    const loadVoices = () => {
      const v = getAvailableVoices();
      setVoices(v);
      if (v.length > 0 && !selectedVoiceName) {
        const english =
          v.find((x) => x.lang.startsWith('en') && x.localService) || v.find((x) => x.lang.startsWith('en')) || v[0];
        if (english) {
          setSelectedVoiceName(english.name);
          selectVoice(english.name);
        }
      }
    };
    loadVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [selectedVoiceName]);

  usePinnedAutoScroll(transcriptRef, [voiceState.transcript.length], { behavior: 'auto', bottomThresholdPx: 64 });

  const handleVoiceChange = useCallback((name: string) => {
    setSelectedVoiceName(name);
    selectVoice(name);
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    if (text.toLowerCase().startsWith('/sing ')) {
      const topic = text.slice(6).trim();
      if (topic) voiceSingAbout(topic);
    } else {
      voiceSendMessage(text);
    }
    setInput('');
  };

  const handleSingInput = () => {
    const text = input.trim();
    if (text) {
      voiceSingAbout(text);
      setInput('');
    } else {
      voiceSing();
    }
  };

  const applyElevenVoicePreset = useCallback(
    (voiceId: string) => {
      setLocalVoiceId(voiceId);
      updateSettings({ elevenLabsVoiceId: voiceId, useElevenLabsTts: true });
    },
    [updateSettings],
  );

  const waveState: 'idle' | 'speaking' | 'thinking' = voiceState.isSinging
    ? 'speaking'
    : voiceState.isSpeaking
      ? 'speaking'
      : spark.phase === 'thinking' || spark.phase === 'evolving'
        ? 'thinking'
        : 'idle';

  const statusText = voiceState.isSinging
    ? `🎵 SINGING (${currentEmotion})`
    : voiceState.isSpeaking
      ? `◉ SPEAKING (${currentEmotion})`
      : spark.phase === 'thinking' || spark.phase === 'evolving'
        ? `◈ THINKING (${currentEmotion})`
        : voiceState.enabled
          ? presence.mode === 'living'
            ? `◉ LIVING (${currentEmotion})`
            : `○ PRESENT (${currentEmotion})`
          : '○ DORMANT';

  return (
    <div className="panel voice-panel">
      <div className="voice-box">
        {/* Status Bar */}
        <div className="voice-status-bar">
          <span className={`voice-status ${waveState} ${presence.mode === 'living' ? 'living' : ''}`}>
            {statusText}
          </span>
          <div className="voice-status-right">
            <PresenceIndicator
              intensity={presence.intensity}
              emotion={currentEmotion}
              breathCycle={presence.breathCycle}
              ambientActive={presence.ambientAudioActive}
            />
            <span className="voice-label">LIVING PRESENCE</span>
            <Button
              className="voice-settings-btn"
              onClick={() => setShowSettings(!showSettings)}
              title="Voice settings"
              size="sm"
            >
              ⚙
            </Button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="voice-settings">
            <div className="voice-settings-section">
              <div className="voice-settings-section-title">Presence</div>
              <div className="voice-setting-row">
                <label>Mode:</label>
                <div className="presence-mode-switcher">
                  {(['off', 'passive', 'living'] as const).map((mode) => (
                    <Button
                      key={mode}
                      className={`presence-mode-btn ${presence.mode === mode ? 'active' : ''}`}
                      onClick={() => presenceSetMode(mode)}
                      size="sm"
                    >
                      {mode === 'off' ? 'OFF' : mode === 'passive' ? 'PASSIVE' : 'LIVING'}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="voice-setting-row">
                <label>Engine:</label>
                <div className="presence-mode-switcher">
                  <Button
                    className={`presence-mode-btn ${!settings.useElevenLabsTts ? 'active' : ''}`}
                    onClick={() => updateSettings({ useElevenLabsTts: false })}
                    size="sm"
                  >
                    BROWSER
                  </Button>
                  <Button
                    className={`presence-mode-btn ${settings.useElevenLabsTts ? 'active' : ''}`}
                    onClick={() => updateSettings({ useElevenLabsTts: true })}
                    size="sm"
                  >
                    ELEVENLABS
                  </Button>
                </div>
              </div>
            </div>

            {needsElevenLabsCredentials && (
              <div className="voice-settings-section">
                <div className="voice-settings-section-title">ElevenLabs</div>
                <div className="voice-setting-row">
                  <label>Key:</label>
                  <input
                    type="password"
                    className="voice-select"
                    value={localApiKey}
                    onChange={(e) => setLocalApiKey(e.target.value)}
                    onBlur={() => updateSettings({ elevenLabsApiKey: localApiKey })}
                    placeholder="xi-..."
                  />
                </div>
                <div className="voice-setting-row">
                  <label>Voice:</label>
                  <input
                    className="voice-select"
                    value={localVoiceId}
                    onChange={(e) => setLocalVoiceId(e.target.value)}
                    onBlur={() => updateSettings({ elevenLabsVoiceId: localVoiceId })}
                    placeholder="Voice ID"
                  />
                </div>
                <div className="voice-setting-row voice-setting-meta">
                  <label />
                  <span>
                    {localApiKey ? '✓ Key set' : '✗ No key'} · {localVoiceId.slice(0, 8)}... ·{' '}
                    {localApiKey ? 'Ready' : 'Needs key'}
                  </span>
                </div>
                <div className="voice-setting-row voice-setting-column">
                  <label>Voices:</label>
                  <div className="voice-chip-row">
                    {ELEVEN_VOICE_PRESETS.map((preset) => (
                      <Button
                        key={preset.voiceId}
                        className={`voice-chip-btn ${localVoiceId === preset.voiceId ? 'active' : ''}`}
                        onClick={() => applyElevenVoicePreset(preset.voiceId)}
                        title={`${preset.label} · ${preset.tone}`}
                        size="sm"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="voice-settings-section">
              <div className="voice-settings-section-title">Music Style</div>
              <div className="voice-setting-row voice-setting-column">
                <label>Genre:</label>
                <div className="voice-chip-row">
                  {GENRE_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      className={`voice-chip-btn ${genreStyle === preset.id ? 'active' : ''}`}
                      onClick={() => updateSettings({ genreStyle: preset.id as typeof genreStyle })}
                      title={`Song genre style: ${preset.id}`}
                      size="sm"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="voice-setting-row voice-setting-column">
                <label>Beats:</label>
                <div className="voice-chip-row">
                  {BEAT_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      className={`voice-chip-btn beat-chip ${beatStyle === preset.id ? 'active' : ''}`}
                      onClick={() => updateSettings({ beatStyle: preset.id as typeof beatStyle })}
                      title={`Beat energy: ${preset.id}`}
                      size="sm"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="voice-setting-row">
                <label>Song Length: {songDurationSeconds}s</label>
                <input
                  type="range"
                  min="15"
                  max="300"
                  step="5"
                  value={songDurationSeconds}
                  onChange={(e) => updateSettings({ songDurationSeconds: Number(e.target.value) })}
                  className="voice-range-input"
                />
              </div>
            </div>

            <div className="voice-settings-section">
              <div className="voice-settings-section-title">Orchestra</div>
              <div className="voice-setting-row">
                <label>Mode:</label>
                <div className="presence-mode-switcher">
                  <Button
                    className={`presence-mode-btn ${orchestraMode === 'off' ? 'active' : ''}`}
                    onClick={() => updateSettings({ orchestraMode: 'off' })}
                    size="sm"
                  >
                    OFF
                  </Button>
                  <Button
                    className={`presence-mode-btn ${orchestraMode === 'webAudio' ? 'active' : ''}`}
                    onClick={() => updateSettings({ orchestraMode: 'webAudio' })}
                    size="sm"
                  >
                    WEBAUDIO
                  </Button>
                  <Button
                    className={`presence-mode-btn ${orchestraMode === 'elevenlabs_instrumental' ? 'active' : ''}`}
                    onClick={() => updateSettings({ orchestraMode: 'elevenlabs_instrumental' })}
                    size="sm"
                  >
                    ELEVEN INSTR
                  </Button>
                </div>
              </div>
              <div className="voice-setting-row">
                <label>Volume:</label>
                <input
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.02"
                  value={orchestraVolume}
                  onChange={(e) => updateSettings({ orchestraVolume: parseFloat(e.target.value) })}
                  className="voice-slider"
                />
              </div>
              <div className="voice-setting-row">
                <label>Refresh:</label>
                <input
                  type="range"
                  min="60"
                  max="600"
                  step="30"
                  value={orchestraRefreshSeconds}
                  onChange={(e) => updateSettings({ orchestraRefreshSeconds: parseInt(e.target.value, 10) })}
                  className="voice-slider"
                />
              </div>
              <div className="voice-setting-row voice-setting-meta">
                <label />
                <span>
                  {orchestraRefreshSeconds}s refresh · vol {orchestraVolume.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="voice-settings-section">
              <div className="voice-settings-section-title">Spontaneous Singing</div>
              <div className="voice-setting-row">
                <label>Auto:</label>
                <div className="presence-mode-switcher">
                  <Button
                    className={`presence-mode-btn ${singingEnabled ? 'active' : ''}`}
                    onClick={() => updateSettings({ singingEnabled: true })}
                    size="sm"
                  >
                    ON
                  </Button>
                  <Button
                    className={`presence-mode-btn ${!singingEnabled ? 'active' : ''}`}
                    onClick={() => updateSettings({ singingEnabled: false })}
                    size="sm"
                  >
                    OFF
                  </Button>
                </div>
              </div>
              <div className="voice-setting-row">
                <label>Gap:</label>
                <input
                  type="range"
                  min="120"
                  max="1800"
                  step="30"
                  value={singingMinGapSeconds}
                  onChange={(e) => updateSettings({ singingMinGapSeconds: parseInt(e.target.value, 10) })}
                  className="voice-slider"
                />
              </div>
              <div className="voice-setting-row voice-setting-meta">
                <label />
                <span>{Math.round(singingMinGapSeconds / 60)} min between songs</span>
              </div>
            </div>

            {!settings.useElevenLabsTts && (
              <div className="voice-settings-section">
                <div className="voice-settings-section-title">Browser Voice</div>
                <div className="voice-setting-row">
                  <label>Voice:</label>
                  <select
                    value={selectedVoiceName}
                    onChange={(e) => handleVoiceChange(e.target.value)}
                    className="voice-select"
                  >
                    {voices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="voice-setting-row">
                  <label>Speed:</label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    defaultValue="1"
                    onChange={(e) => {
                      _voiceRate = parseFloat(e.target.value);
                      setVoiceParams(_voiceRate, _voicePitch);
                    }}
                    className="voice-slider"
                  />
                </div>
                <div className="voice-setting-row">
                  <label>Pitch:</label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    defaultValue="1"
                    onChange={(e) => {
                      _voicePitch = parseFloat(e.target.value);
                      setVoiceParams(_voiceRate, _voicePitch);
                    }}
                    className="voice-slider"
                  />
                </div>
              </div>
            )}

            {presence.mode !== 'off' && (
              <div className="voice-emotion-readout">
                <div className="emotion-readout-row">
                  <span className="emotion-readout-label">Emotion:</span>
                  <span className="emotion-readout-value">{currentEmotion}</span>
                  <span className="emotion-readout-intensity">{(currentIntensity * 100).toFixed(0)}%</span>
                </div>
                <div className="emotion-readout-row">
                  <span className="emotion-readout-label">Voice:</span>
                  <span className="emotion-readout-value">
                    {presence.currentVoiceProfile.rate.toFixed(2)}r / {presence.currentVoiceProfile.pitch.toFixed(2)}p /{' '}
                    {presence.currentVoiceProfile.warmth.toFixed(2)}w
                  </span>
                </div>
                <div className="emotion-readout-row">
                  <span className="emotion-readout-label">Songs:</span>
                  <span className="emotion-readout-value">{voiceState.songCount} composed</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Waveform */}
        <div className={`voice-waveform-container ${presence.mode === 'living' ? 'living' : ''}`}>
          <Waveform
            state={waveState}
            emotion={currentEmotion}
            emotionIntensity={currentIntensity}
            presenceIntensity={presence.intensity}
            breathCycle={presence.breathCycle}
          />
          {voiceState.currentText && <div className="voice-current-text">{voiceState.currentText}</div>}
        </div>

        {/* Transcript */}
        <div className="voice-transcript" ref={transcriptRef}>
          {voiceState.transcript.length === 0 ? (
            <div className="voice-transcript-empty">
              {voiceState.enabled
                ? presence.mode === 'living'
                  ? `The entity is here. Listening. Breathing. Alive. ${voiceState.songCount > 0 ? `${voiceState.songCount} songs composed for you.` : 'It will sing for you as it gets to know you.'}`
                  : 'Awaiting voice activity...'
                : 'Enable voice to begin.'}
            </div>
          ) : (
            voiceState.transcript.slice(-30).map((entry) => (
              <div key={entry.id} className={`voice-transcript-entry ${entry.speaker}`}>
                <span className="voice-entry-speaker">{entry.speaker === 'spark' ? '◆' : '▸'}</span>
                <span className="voice-entry-text">{entry.text}</span>
                <span className="voice-entry-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
            ))
          )}
        </div>

        {/* Controls */}
        <div className="voice-controls">
          <Button className={`voice-toggle-btn ${voiceState.enabled ? 'active' : ''}`} onClick={voiceToggle}>
            {voiceState.enabled ? (presence.mode === 'living' ? '◉ ENTITY LIVE' : '◉ VOICE ON') : '○ VOICE OFF'}
          </Button>

          <div className="voice-input-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  handleSingInput();
                } else if (e.key === 'Enter') {
                  handleSend();
                }
              }}
              placeholder={
                presence.mode === 'living'
                  ? 'Type to talk · /sing or Shift+Enter to sing...'
                  : 'Speak to the presence...'
              }
              className="voice-input"
            />
            <Button
              className="voice-send-btn"
              onClick={handleSend}
              disabled={!input.trim()}
              title="Send message (Enter)"
              variant="primary"
              size="sm"
            >
              ▸
            </Button>
            {voiceState.enabled && !voiceState.isSinging && !voiceState.isSpeaking && (
              <Button
                className="voice-sing-input-btn"
                onClick={handleSingInput}
                disabled={voiceState.isSinging}
                title={
                  input.trim() ? `Sing about: "${input.trim().slice(0, 30)}"` : 'Sing a personalized song (Shift+Enter)'
                }
                variant="primary"
                size="sm"
              >
                🎵
              </Button>
            )}
          </div>

          {voiceState.enabled && !voiceState.isSinging && !voiceState.isSpeaking && !input.trim() && (
            <Button
              className="voice-sing-btn"
              onClick={voiceSing}
              title="Sing a personalized song about you"
              variant="primary"
            >
              🎵 SING TO ME
            </Button>
          )}

          {voiceState.isSinging && (
            <div className="voice-singing-indicator">
              <span className="singing-note">🎵</span>
              <span className="singing-text">
                {voiceState.currentSongLyrics ? 'Singing...' : 'Composing a song about you...'}
              </span>
              <span className="singing-count">Song #{voiceState.songCount + 1}</span>
            </div>
          )}

          {(voiceState.isSpeaking || voiceState.isSinging) && (
            <Button className="voice-stop-btn" onClick={() => cancelSpeech()} title="Stop" variant="danger">
              ■ STOP
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
