// ═══════════════════════════════════════════════════════════════
//  NEXUS Panel — The Convergence Point
//  Where all AGI modules meet through conversation
//  The system speaks here, thinks internally, and cares
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { useStore } from '../store';
import { usePinnedAutoScroll } from '../hooks/usePinnedAutoScroll';
import { Button } from './ui';
import './NexusPanel.css';

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

const WelcomeScreen = memo(function WelcomeScreen() {
  const currentEmotion = useStore((s) => s.consciousness.soulFrame.currentEmotion);

  return (
    <div className="welcome-screen">
      <div className="welcome-logo">◆</div>
      <div className="welcome-title">AGI PRIME</div>
      <div className="welcome-subtitle">
        A living mind — general intelligence that thinks across all domains, cares with emotional depth, and acts with
        autonomous purpose.
      </div>

      <div className="welcome-modules">
        <div className="welcome-module">
          <div className="welcome-module-icon" style={{ color: '#00ff41' }}>
            ⬡
          </div>
          <div className="welcome-module-name">NEXUS</div>
          <div className="welcome-module-status">Communication</div>
        </div>
        <div className="welcome-module">
          <div className="welcome-module-icon" style={{ color: '#ff006e' }}>
            ♥
          </div>
          <div className="welcome-module-name">HEART</div>
          <div className="welcome-module-status">{currentEmotion}</div>
        </div>
        <div className="welcome-module">
          <div className="welcome-module-icon" style={{ color: '#00ccff' }}>
            ◈
          </div>
          <div className="welcome-module-name">MIND</div>
          <div className="welcome-module-status">Multi-Agent</div>
        </div>
        <div className="welcome-module">
          <div className="welcome-module-icon" style={{ color: '#a855f7' }}>
            ✧
          </div>
          <div className="welcome-module-name">HANDS</div>
          <div className="welcome-module-status">Standby</div>
        </div>
      </div>
    </div>
  );
});

// ─── Conversation Sidebar ───────────────────────────────────
const ConversationSidebar = memo(function ConversationSidebar({ onClose }: { onClose: () => void }) {
  const conversations = useStore((s) => s.conversations);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const newConversation = useStore((s) => s.newConversation);
  const selectConversation = useStore((s) => s.selectConversation);
  const deleteConversation = useStore((s) => s.deleteConversation);
  const isStreaming = useStore((s) => s.isStreaming);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSelect = useCallback(
    async (id: string) => {
      if (id === activeConversationId) {
        onClose();
        return;
      }
      await selectConversation(id);
      onClose();
    },
    [activeConversationId, selectConversation, onClose],
  );

  const handleNew = useCallback(async () => {
    await newConversation();
    onClose();
  }, [newConversation, onClose]);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        return;
      }
      setConfirmDeleteId(null);
      await deleteConversation(id);
    },
    [confirmDeleteId, deleteConversation],
  );

  // Group conversations: Today / This Week / Earlier (memoized to avoid 3 filters on every render)
  const groups = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = todayStart - 6 * 86400000;

    const today = (conversations || []).filter((c) => c.updatedAt >= todayStart);
    const week = (conversations || []).filter((c) => c.updatedAt >= weekStart && c.updatedAt < todayStart);
    const older = (conversations || []).filter((c) => c.updatedAt < weekStart);

    const result: Array<{ label: string; items: typeof conversations }> = [];
    if (today.length) result.push({ label: 'Today', items: today });
    if (week.length) result.push({ label: 'This week', items: week });
    if (older.length) result.push({ label: 'Earlier', items: older });
    return result;
  }, [conversations]);

  return (
    <div className="convo-sidebar">
      <div className="convo-sidebar-header">
        <div className="convo-sidebar-header-left">
          <span className="convo-sidebar-icon">◆</span>
          <span className="convo-sidebar-title">Chats</span>
        </div>
        <Button type="button" variant="ghost" size="sm" className="convo-sidebar-close" onClick={onClose} title="Close">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <line x1="3" y1="3" x2="11" y2="11" />
            <line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </Button>
      </div>

      <Button type="button" variant="accent" className="convo-new-btn" onClick={handleNew} disabled={isStreaming}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="7" y1="2" x2="7" y2="12" />
          <line x1="2" y1="7" x2="12" y2="7" />
        </svg>
        New Chat
      </Button>

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
                <Button
                  key={c.id}
                  type="button"
                  variant="ghost"
                  className={`convo-item ${c.id === activeConversationId ? 'active' : ''}`}
                  onClick={() => void handleSelect(c.id)}
                >
                  <div className="convo-item-content">
                    <span className="convo-item-title">{c.title}</span>
                    <span className="convo-item-meta">
                      {c.messageCount} msgs · {relativeTime(c.updatedAt)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className={`convo-item-delete ${confirmDeleteId === c.id ? 'confirm' : ''}`}
                    onClick={(e) => void handleDelete(c.id, e)}
                    title={confirmDeleteId === c.id ? 'Confirm delete' : 'Delete'}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      {confirmDeleteId === c.id ? (
                        <polyline points="2,6 5,9 10,3" />
                      ) : (
                        <>
                          <line x1="3" y1="3" x2="9" y2="9" />
                          <line x1="9" y1="3" x2="3" y2="9" />
                        </>
                      )}
                    </svg>
                  </Button>
                </Button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

// ─── Streaming Bubble (isolated from message list re-renders) ──
const StreamingBubble = memo(function StreamingBubble() {
  const isStreaming = useStore((s) => s.isStreaming);
  const streamingContent = useStore((s) => s.streamingContent);

  if (!isStreaming) return null;

  if (!streamingContent) {
    return (
      <div className="thinking-indicator">
        <div className="thinking-dots">
          <span />
          <span />
          <span />
        </div>
        AGI PRIME is thinking...
      </div>
    );
  }

  return (
    <div className="message assistant streaming">
      <div className="message-avatar">◆</div>
      <div className="message-body">
        <div className="message-content">{streamingContent}</div>
      </div>
    </div>
  );
});

// ─── Message List (only re-renders when messages array changes) ──
const MessageList = memo(function MessageList() {
  const messages = useStore((s) => s.messages);

  return (
    <>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`message ${msg.role}${msg.thinking ? ' afterthought' : ''}${msg.thinking && msg.sourceModule === 'spark' ? ' spark-origin' : ''}`}
        >
          <div className="message-avatar">
            {msg.role === 'assistant'
              ? msg.thinking && msg.sourceModule === 'spark'
                ? '🔥'
                : msg.thinking
                  ? '⚡'
                  : '◆'
              : msg.role === 'user'
                ? '▸'
                : '⚠'}
          </div>
          <div className="message-body">
            {msg.role === 'assistant' && msg.thinking && (
              <div className={`message-badge${msg.sourceModule === 'spark' ? ' badge-spark' : ''}`}>
                {msg.sourceModule === 'spark'
                  ? 'SPARK THOUGHT'
                  : msg.sourceModule === 'nexus' && msg.thinking
                    ? 'NIGHTMIND'
                    : 'AFTERTHOUGHT'}
              </div>
            )}
            <div className="message-content">{msg.content}</div>
            <div className="message-time">{formatTime(msg.timestamp)}</div>
          </div>
        </div>
      ))}
    </>
  );
});

// ─── Dual-Brain Bar (isolated to avoid re-renders from streaming) ──
const DualBrainBar = memo(function DualBrainBar() {
  const dualBrain = useStore((s) => s.dualBrain);
  const setDualBrainEnabled = useStore((s) => s.setDualBrainEnabled);

  return (
    <div className="dual-brain-bar">
      <span>
        Dual-Brain: {dualBrain.enabled ? 'ON' : 'OFF'} · route={dualBrain.lastRoute.toUpperCase()} · fast=
        {dualBrain.fastCount} slow={dualBrain.slowCount}
      </span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={dualBrain.enabled} onChange={(e) => setDualBrainEnabled(e.target.checked)} />
        Router
      </label>
    </div>
  );
});

// ─── Auto-scrolling message area ──
const MessagesArea = memo(function MessagesArea() {
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);
  const messageCount = useStore((s) => s.messages.length);
  const isStreaming = useStore((s) => s.isStreaming);
  const streamingContent = useStore((s) => s.streamingContent);
  const activeConversationId = useStore((s) => s.activeConversationId);

  const { scrollToBottomNow } = usePinnedAutoScroll(messagesAreaRef, [messageCount, streamingContent], {
    behavior: 'auto',
    bottomThresholdPx: 64,
  });

  useEffect(() => {
    shouldScrollToBottomRef.current = true;
  }, [activeConversationId]);

  useEffect(() => {
    if (messageCount === 0) return;
    if (!shouldScrollToBottomRef.current) return;
    shouldScrollToBottomRef.current = false;
    const raf = requestAnimationFrame(() => scrollToBottomNow());
    return () => cancelAnimationFrame(raf);
  }, [messageCount, scrollToBottomNow]);

  const hasMessages = messageCount > 0 || isStreaming;

  if (!hasMessages) return <WelcomeScreen />;

  return (
    <div className="messages-area" ref={messagesAreaRef}>
      <MessageList />
      <StreamingBubble />
    </div>
  );
});

// ─── Composer (isolated so typing doesn't re-render whole panel) ──
const Composer = memo(function Composer({
  isStreaming,
  totalInteractions,
  onSend,
}: {
  isStreaming: boolean;
  totalInteractions: number;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeRaf = useRef<number>(0);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    setInput(el.value);
    cancelAnimationFrame(resizeRaf.current);
    resizeRaf.current = requestAnimationFrame(() => {
      el.style.height = '24px';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    });
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '24px';
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  useEffect(() => {
    return () => cancelAnimationFrame(resizeRaf.current);
  }, []);

  return (
    <div className="input-area">
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Speak to AGI PRIME..."
          rows={1}
          disabled={isStreaming}
        />
        <Button variant="primary" className="send-btn" onClick={handleSend} disabled={!input.trim() || isStreaming}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </Button>
      </div>
      <div className="input-hint">
        <span>Enter to send · Shift+Enter for new line</span>
        <span>Interactions: {totalInteractions}</span>
      </div>
    </div>
  );
});

// ─── Main Nexus Panel ───────────────────────────────────────
export default function NexusPanel() {
  const sendMessage = useStore((s) => s.sendMessage);
  const isStreaming = useStore((s) => s.isStreaming);
  const activeConversationTitle = useStore((s) => s.activeConversationTitle);
  const currentEmotion = useStore((s) => s.consciousness.soulFrame.currentEmotion);
  const presence = useStore((s) => s.consciousness.presence);
  const totalInteractions = useStore((s) => s.consciousness.totalInteractions);
  const provider = useStore((s) => s.settings.provider);
  const model = useStore((s) => s.settings.model);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const handleSend = useCallback(
    (text: string) => {
      if (isStreaming) return;
      sendMessage(text);
    },
    [isStreaming, sendMessage],
  );

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  return (
    <div className="nexus-panel">
      {sidebarOpen && (
        <>
          <div className="convo-sidebar-backdrop" onClick={closeSidebar} />
          <ConversationSidebar onClose={closeSidebar} />
        </>
      )}

      <div className="nightmind-bar">
        <div className="nightmind-dot" />
        NIGHTMIND ACTIVE — Internal reflection loop running
      </div>

      <div className="nexus-header">
        <div className="nexus-header-left">
          <Button
            type="button"
            variant="ghost"
            className="nexus-sidebar-toggle"
            onClick={toggleSidebar}
            title="Conversations"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="10" y2="12" />
            </svg>
            <span>Chats</span>
          </Button>
          <h2>NEXUS</h2>
          <div className="consciousness-indicator">
            <div className="consciousness-dot" />
            <span className="emotion-label">{currentEmotion}</span>
            <span className="presence-label">· {presence}</span>
          </div>
        </div>
        <div className="nexus-header-right">
          <span className="nexus-convo-label">{activeConversationTitle || 'New chat'}</span>
          <span className="nexus-provider-label">
            {provider.toUpperCase()} / {model}
          </span>
        </div>
      </div>

      <DualBrainBar />
      <MessagesArea />
      <Composer isStreaming={isStreaming} totalInteractions={totalInteractions} onSend={handleSend} />
    </div>
  );
}
