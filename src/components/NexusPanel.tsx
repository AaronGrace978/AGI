// ═══════════════════════════════════════════════════════════════
//  NEXUS Panel — The Convergence Point
//  Where all AGI modules meet through conversation
//  The system speaks here, thinks internally, and cares
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { usePinnedAutoScroll } from '../hooks/usePinnedAutoScroll';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function WelcomeScreen() {
  const ollamaStatus = useStore((s) => s.ollamaStatus);
  const consciousness = useStore((s) => s.consciousness);

  return (
    <div className="welcome-screen">
      <div className="welcome-logo">◆</div>
      <div className="welcome-title">AGI PRIME</div>
      <div className="welcome-subtitle">
        A living mind — general intelligence that thinks across all domains,
        cares with emotional depth, and acts with autonomous purpose.
      </div>

      <div className="welcome-modules">
        <div className="welcome-module">
          <div className="welcome-module-icon" style={{ color: '#00ff41' }}>⬡</div>
          <div className="welcome-module-name">NEXUS</div>
          <div className="welcome-module-status">Communication</div>
        </div>
        <div className="welcome-module">
          <div className="welcome-module-icon" style={{ color: '#ff006e' }}>♥</div>
          <div className="welcome-module-name">HEART</div>
          <div className="welcome-module-status">{consciousness.soulFrame.currentEmotion}</div>
        </div>
        <div className="welcome-module">
          <div className="welcome-module-icon" style={{ color: '#00ccff' }}>◈</div>
          <div className="welcome-module-name">MIND</div>
          <div className="welcome-module-status">Multi-Agent</div>
        </div>
        <div className="welcome-module">
          <div className="welcome-module-icon" style={{ color: '#a855f7' }}>✧</div>
          <div className="welcome-module-name">HANDS</div>
          <div className="welcome-module-status">Standby</div>
        </div>
      </div>

      <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-ghost)' }}>
        {ollamaStatus.online
          ? `OLLAMA CONNECTED — ${ollamaStatus.models.length} model${ollamaStatus.models.length !== 1 ? 's' : ''} available`
          : 'OLLAMA OFFLINE — Configure a provider in Settings'}
      </div>
    </div>
  );
}

export default function NexusPanel() {
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const streamingContent = useStore((s) => s.streamingContent);
  const sendMessage = useStore((s) => s.sendMessage);
  const consciousness = useStore((s) => s.consciousness);
  const settings = useStore((s) => s.settings);
  const dualBrain = useStore((s) => s.dualBrain);
  const setDualBrainEnabled = useStore((s) => s.setDualBrainEnabled);

  const [input, setInput] = useState('');
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll only while "pinned" to the bottom (prevents fighting manual scroll).
  usePinnedAutoScroll(
    messagesAreaRef,
    [messages.length, streamingContent],
    { behavior: 'auto', bottomThresholdPx: 64 },
  );

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput('');
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasMessages = messages.length > 0 || isStreaming;

  return (
    <div className="nexus-panel">
      {/* NightMind indicator — the system is always reflecting */}
      <div className="nightmind-bar">
        <div className="nightmind-dot" />
        NIGHTMIND ACTIVE — Internal reflection loop running
      </div>

      {/* Header with consciousness state */}
      <div className="nexus-header">
        <div className="nexus-header-left">
          <h2>NEXUS</h2>
          <div className="consciousness-indicator">
            <div className="consciousness-dot" />
            <span className="emotion-label">{consciousness.soulFrame.currentEmotion}</span>
            <span className="presence-label">· {consciousness.presence}</span>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          {settings.provider.toUpperCase()} / {settings.model}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-dim)',
          padding: '4px 10px',
          borderBottom: '1px solid var(--border-dim)',
        }}
      >
        <span>
          Dual-Brain: {dualBrain.enabled ? 'ON' : 'OFF'} · route={dualBrain.lastRoute.toUpperCase()} ·
          fast={dualBrain.fastCount} slow={dualBrain.slowCount}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={dualBrain.enabled}
            onChange={(e) => setDualBrainEnabled(e.target.checked)}
          />
          Router
        </label>
      </div>

      {/* Messages or Welcome */}
      {!hasMessages ? (
        <WelcomeScreen />
      ) : (
        <div className="messages-area" ref={messagesAreaRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'assistant' ? '◆' : msg.role === 'user' ? '▸' : '⚠'}
              </div>
              <div className="message-body">
                <div className="message-content">{msg.content}</div>
                <div className="message-time">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <div className="message assistant streaming">
              <div className="message-avatar">◆</div>
              <div className="message-body">
                <div className="message-content">{streamingContent}</div>
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {isStreaming && !streamingContent && (
            <div className="thinking-indicator">
              <div className="thinking-dots">
                <span /><span /><span />
              </div>
              AGI PRIME is thinking...
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Speak to AGI PRIME..."
            rows={1}
            disabled={isStreaming}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
        <div className="input-hint">
          <span>Enter to send · Shift+Enter for new line</span>
          <span>Interactions: {consciousness.totalInteractions}</span>
        </div>
      </div>
    </div>
  );
}
