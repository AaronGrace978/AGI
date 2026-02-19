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

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

// ─── Conversation Sidebar ───────────────────────────────────
function ConversationSidebar({ onClose }: { onClose: () => void }) {
  const conversations = useStore((s) => s.conversations);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const newConversation = useStore((s) => s.newConversation);
  const selectConversation = useStore((s) => s.selectConversation);
  const deleteConversation = useStore((s) => s.deleteConversation);
  const isStreaming = useStore((s) => s.isStreaming);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSelect = useCallback(async (id: string) => {
    if (id === activeConversationId) { onClose(); return; }
    await selectConversation(id);
    onClose();
  }, [activeConversationId, selectConversation, onClose]);

  const handleNew = useCallback(async () => {
    await newConversation();
    onClose();
  }, [newConversation, onClose]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setConfirmDeleteId(null);
    await deleteConversation(id);
  }, [confirmDeleteId, deleteConversation]);

  // Group conversations: Today / This Week / Earlier
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = todayStart - 6 * 86400000;

  const groups: Array<{ label: string; items: typeof conversations }> = [];
  const today = (conversations || []).filter((c) => c.updatedAt >= todayStart);
  const week = (conversations || []).filter((c) => c.updatedAt >= weekStart && c.updatedAt < todayStart);
  const older = (conversations || []).filter((c) => c.updatedAt < weekStart);
  if (today.length) groups.push({ label: 'Today', items: today });
  if (week.length) groups.push({ label: 'This week', items: week });
  if (older.length) groups.push({ label: 'Earlier', items: older });
  // suppress unused var
  void now;

  return (
    <div className="convo-sidebar">
      <div className="convo-sidebar-header">
        <div className="convo-sidebar-header-left">
          <span className="convo-sidebar-icon">◆</span>
          <span className="convo-sidebar-title">Chats</span>
        </div>
        <button type="button" className="convo-sidebar-close" onClick={onClose} title="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="3" y1="3" x2="11" y2="11" />
            <line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className="convo-new-btn"
        onClick={handleNew}
        disabled={isStreaming}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="7" y1="2" x2="7" y2="12" />
          <line x1="2" y1="7" x2="12" y2="7" />
        </svg>
        New Chat
      </button>

      <div className="convo-list">
        {groups.length === 0 ? (
          <div className="convo-empty">
            <div className="convo-empty-icon">⬡</div>
            No conversations yet
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="convo-group">
              <div className="convo-group-label">{group.label}</div>
              {group.items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`convo-item ${c.id === activeConversationId ? 'active' : ''}`}
                  onClick={() => void handleSelect(c.id)}
                >
                  <div className="convo-item-content">
                    <span className="convo-item-title">{c.title}</span>
                    <span className="convo-item-meta">
                      {c.messageCount} msgs · {relativeTime(c.updatedAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`convo-item-delete ${confirmDeleteId === c.id ? 'confirm' : ''}`}
                    onClick={(e) => void handleDelete(c.id, e)}
                    title={confirmDeleteId === c.id ? 'Confirm delete' : 'Delete'}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      {confirmDeleteId === c.id
                        ? <polyline points="2,6 5,9 10,3" />
                        : <><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></>
                      }
                    </svg>
                  </button>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Nexus Panel ───────────────────────────────────────
export default function NexusPanel() {
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const streamingContent = useStore((s) => s.streamingContent);
  const sendMessage = useStore((s) => s.sendMessage);
  const activeConversationTitle = useStore((s) => s.activeConversationTitle);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const consciousness = useStore((s) => s.consciousness);
  const settings = useStore((s) => s.settings);
  const dualBrain = useStore((s) => s.dualBrain);
  const setDualBrainEnabled = useStore((s) => s.setDualBrainEnabled);

  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldScrollToBottomRef = useRef(true);

  const { scrollToBottomNow } = usePinnedAutoScroll(
    messagesAreaRef,
    [messages.length, streamingContent],
    { behavior: 'auto', bottomThresholdPx: 64 },
  );

  // When opening or switching conversations, start at the bottom so you see latest messages
  useEffect(() => {
    shouldScrollToBottomRef.current = true;
  }, [activeConversationId]);
  useEffect(() => {
    if (messages.length === 0) return;
    if (!shouldScrollToBottomRef.current) return;
    shouldScrollToBottomRef.current = false;
    const raf = requestAnimationFrame(() => scrollToBottomNow());
    return () => cancelAnimationFrame(raf);
  }, [messages, scrollToBottomNow]);

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
      {/* Conversation sidebar overlay */}
      {sidebarOpen && (
        <>
          <div className="convo-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          <ConversationSidebar onClose={() => setSidebarOpen(false)} />
        </>
      )}

      {/* NightMind indicator */}
      <div className="nightmind-bar">
        <div className="nightmind-dot" />
        NIGHTMIND ACTIVE — Internal reflection loop running
      </div>

      {/* Header with consciousness state */}
      <div className="nexus-header">
        <div className="nexus-header-left">
          <button
            type="button"
            className="nexus-sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title="Conversations"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="10" y2="12" />
            </svg>
            <span>Chats</span>
          </button>
          <h2>NEXUS</h2>
          <div className="consciousness-indicator">
            <div className="consciousness-dot" />
            <span className="emotion-label">{consciousness.soulFrame.currentEmotion}</span>
            <span className="presence-label">· {consciousness.presence}</span>
          </div>
        </div>
        <div className="nexus-header-right">
          <span className="nexus-convo-label">{activeConversationTitle || 'New chat'}</span>
          <span className="nexus-provider-label">
            {settings.provider.toUpperCase()} / {settings.model}
          </span>
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
            <div key={msg.id} className={`message ${msg.role}${msg.thinking ? ' afterthought' : ''}${msg.thinking && msg.sourceModule === 'spark' ? ' spark-origin' : ''}`}>
              <div className="message-avatar">
                {msg.role === 'assistant'
                  ? (msg.thinking && msg.sourceModule === 'spark' ? '🔥' : msg.thinking ? '⚡' : '◆')
                  : msg.role === 'user'
                    ? '▸'
                    : '⚠'}
              </div>
              <div className="message-body">
                {msg.role === 'assistant' && msg.thinking && (
                  <div className={`message-badge${msg.sourceModule === 'spark' ? ' badge-spark' : ''}`}>
                    {msg.sourceModule === 'spark' ? 'SPARK THOUGHT' : msg.sourceModule === 'nexus' && msg.thinking ? 'NIGHTMIND' : 'AFTERTHOUGHT'}
                  </div>
                )}
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
