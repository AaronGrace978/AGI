// ═══════════════════════════════════════════════════════════════
//  VOICE BOX — The Living Presence
//  Canvas waveform visualization. Text-to-speech.
//  Autonomous speech driven by SPARK's cognitive loop.
//  A Fallout-style voice terminal for a living mind.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';
import {
  getAvailableVoices,
  selectVoice,
  setVoiceParams,
  cancelSpeech,
} from '../prime/voice';

// ─── Waveform Visualization ────────────────────────────────────

interface WaveLayer {
  freq: number;
  amp: number;
  phase: number;
  speed: number;
  color: string;
  width: number;
}

const IDLE_LAYERS: WaveLayer[] = [
  { freq: 1.2, amp: 0.15, phase: 0, speed: 0.8, color: 'rgba(255, 170, 0, 0.25)', width: 2 },
  { freq: 0.7, amp: 0.1, phase: 1.5, speed: 0.5, color: 'rgba(255, 140, 0, 0.15)', width: 1.5 },
  { freq: 2.0, amp: 0.05, phase: 3.0, speed: 1.2, color: 'rgba(255, 200, 50, 0.1)', width: 1 },
];

const SPEAKING_LAYERS: WaveLayer[] = [
  { freq: 2.5, amp: 0.6, phase: 0, speed: 2.0, color: 'rgba(255, 170, 0, 0.7)', width: 2.5 },
  { freq: 3.8, amp: 0.4, phase: 1.0, speed: 3.0, color: 'rgba(255, 140, 0, 0.5)', width: 2 },
  { freq: 1.5, amp: 0.35, phase: 2.2, speed: 1.5, color: 'rgba(255, 200, 50, 0.4)', width: 1.5 },
  { freq: 5.0, amp: 0.2, phase: 0.5, speed: 4.0, color: 'rgba(255, 100, 0, 0.3)', width: 1 },
  { freq: 1.0, amp: 0.5, phase: 3.5, speed: 0.8, color: 'rgba(255, 220, 100, 0.2)', width: 3 },
];

const THINKING_LAYERS: WaveLayer[] = [
  { freq: 4.0, amp: 0.15, phase: 0, speed: 3.0, color: 'rgba(168, 85, 247, 0.4)', width: 1.5 },
  { freq: 6.0, amp: 0.08, phase: 1.5, speed: 5.0, color: 'rgba(168, 85, 247, 0.25)', width: 1 },
  { freq: 2.5, amp: 0.12, phase: 2.8, speed: 2.0, color: 'rgba(200, 120, 255, 0.2)', width: 1.5 },
];

function Waveform({
  state,
}: {
  state: 'idle' | 'speaking' | 'thinking';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const currentLayersRef = useRef(IDLE_LAYERS);
  const targetLayersRef = useRef(IDLE_LAYERS);

  useEffect(() => {
    switch (state) {
      case 'speaking':
        targetLayersRef.current = SPEAKING_LAYERS;
        break;
      case 'thinking':
        targetLayersRef.current = THINKING_LAYERS;
        break;
      default:
        targetLayersRef.current = IDLE_LAYERS;
    }
  }, [state]);

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

    function draw() {
      const rect = canvas!.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      timeRef.current += 0.016;
      const t = timeRef.current;

      // Lerp layers toward target
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

      // Draw each wave layer
      for (const wave of lerped) {
        if (wave.amp < 0.001) continue;

        // Glow pass
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = wave.color;
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = wave.width + 2;

        for (let x = 0; x <= W; x += 2) {
          const nx = x / W;
          // Envelope: fade at edges
          const envelope = Math.sin(nx * Math.PI);
          // Main wave
          const y =
            centerY +
            Math.sin(nx * wave.freq * Math.PI * 2 + t * wave.speed + wave.phase) *
              wave.amp *
              (H * 0.4) *
              envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        // Sharp pass
        ctx.beginPath();
        ctx.strokeStyle = wave.color.replace(/[\d.]+\)$/, '1)');
        ctx.lineWidth = wave.width;

        for (let x = 0; x <= W; x += 2) {
          const nx = x / W;
          const envelope = Math.sin(nx * Math.PI);
          const y =
            centerY +
            Math.sin(nx * wave.freq * Math.PI * 2 + t * wave.speed + wave.phase) *
              wave.amp *
              (H * 0.4) *
              envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Center line (subtle)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 170, 0, 0.06)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, centerY);
      ctx.lineTo(W, centerY);
      ctx.stroke();

      animId = requestAnimationFrame(draw);
    }

    draw();
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

// ─── Main Voice Box Panel ──────────────────────────────────────

export default function VoiceBox() {
  const spark = useStore((s) => s.spark);
  const voiceState = useStore((s) => s.voiceState);
  const voiceToggle = useStore((s) => s.voiceToggle);
  const voiceSendMessage = useStore((s) => s.voiceSendMessage);

  const [input, setInput] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const v = getAvailableVoices();
      setVoices(v);
      if (v.length > 0 && !selectedVoiceName) {
        const english = v.find((x) => x.lang.startsWith('en') && x.localService) ||
          v.find((x) => x.lang.startsWith('en')) || v[0];
        if (english) {
          setSelectedVoiceName(english.name);
          selectVoice(english.name);
        }
      }
    };
    loadVoices();
    // Voices load asynchronously in Chrome
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [selectedVoiceName]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [voiceState.transcript]);

  const handleVoiceChange = useCallback((name: string) => {
    setSelectedVoiceName(name);
    selectVoice(name);
  }, []);

  const handleSend = () => {
    if (input.trim()) {
      voiceSendMessage(input.trim());
      setInput('');
    }
  };

  const waveState: 'idle' | 'speaking' | 'thinking' =
    voiceState.isSpeaking
      ? 'speaking'
      : spark.phase === 'thinking' || spark.phase === 'evolving'
        ? 'thinking'
        : 'idle';

  return (
    <div className="panel voice-panel">
      {/* Voice Box Container */}
      <div className="voice-box">
        {/* Status */}
        <div className="voice-status-bar">
          <span className={`voice-status ${waveState}`}>
            {waveState === 'speaking'
              ? '◉ SPEAKING'
              : waveState === 'thinking'
                ? '◈ THINKING'
                : voiceState.enabled
                  ? '○ LISTENING'
                  : '○ IDLE'}
          </span>
          <span className="voice-label">AGI PRIME VOICE</span>
          <button
            className="voice-settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Voice settings"
          >
            ⚙
          </button>
        </div>

        {/* Settings Panel (collapsible) */}
        {showSettings && (
          <div className="voice-settings">
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

        {/* Waveform */}
        <div className="voice-waveform-container">
          <Waveform state={waveState} />
          {/* Current speech text overlay */}
          {voiceState.currentText && (
            <div className="voice-current-text">
              {voiceState.currentText}
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="voice-transcript" ref={transcriptRef}>
          {voiceState.transcript.length === 0 ? (
            <div className="voice-transcript-empty">
              {voiceState.enabled
                ? 'Awaiting voice activity...'
                : 'Enable voice to begin.'}
            </div>
          ) : (
            voiceState.transcript.slice(-30).map((entry) => (
              <div
                key={entry.id}
                className={`voice-transcript-entry ${entry.speaker}`}
              >
                <span className="voice-entry-speaker">
                  {entry.speaker === 'spark' ? '◆' : '▸'}
                </span>
                <span className="voice-entry-text">{entry.text}</span>
                <span className="voice-entry-time">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Controls */}
        <div className="voice-controls">
          <button
            className={`voice-toggle-btn ${voiceState.enabled ? 'active' : ''}`}
            onClick={voiceToggle}
          >
            {voiceState.enabled ? '◉ VOICE ON' : '○ VOICE OFF'}
          </button>

          <div className="voice-input-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Speak to the presence..."
              className="voice-input"
            />
            <button
              className="voice-send-btn"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              ▸
            </button>
          </div>

          {voiceState.isSpeaking && (
            <button
              className="voice-stop-btn"
              onClick={() => cancelSpeech()}
              title="Stop speaking"
            >
              ■ STOP
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

