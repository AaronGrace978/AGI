// ═══════════════════════════════════════════════════════════════
//  MIND Panel — The Cognitive Engine
//  Multi-agent Arena where models debate from different angles
//  From UnifiedAi: general knowledge, science, meta-intelligence
//  Multiple perspectives converge into unified understanding
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { Button, Card } from './ui';

const AGENT_INFO: Record<string, { description: string }> = {
  analyst: { description: 'Precise, logical, evidence-based reasoning' },
  creative: { description: 'Lateral thinking, novel connections, bold ideas' },
  critic: { description: 'Finds flaws, blind spots, failure modes' },
  synthesizer: { description: 'Integrates all perspectives into unified truth' },
};

function ArenaIdle() {
  return (
    <div className="arena-idle">
      <div className="arena-idle-icon">◈</div>
      <h3>MULTI-AGENT ARENA</h3>
      <p>
        Pose a question and watch multiple AI agents debate it from different perspectives — analytical, creative,
        critical — then synthesize their insights into a unified answer.
      </p>
      <p style={{ fontSize: 10, color: 'var(--text-ghost)', marginTop: 8 }}>
        General intelligence means examining every question from every angle.
      </p>
    </div>
  );
}

export default function MindPanel() {
  const arena = useStore((s) => s.arena);
  const startArena = useStore((s) => s.startArena);
  const resetArena = useStore((s) => s.resetArena);
  const settings = useStore((s) => s.settings);

  const [prompt, setPrompt] = useState('');
  const agentsContainerRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<HTMLDivElement>(null);

  const isRunning = arena.phase === 'debating' || arena.phase === 'synthesizing';
  const blueprint = arena.blueprint;

  const handleStart = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isRunning) return;
    startArena(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  // Auto-scroll agent cards when streaming
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>('.arena-agent-body');
    cards.forEach((card) => {
      // Only keep auto-scrolling if the user is already near the bottom.
      const distanceFromBottom = card.scrollHeight - card.scrollTop - card.clientHeight;
      if (distanceFromBottom <= 48) {
        card.scrollTop = card.scrollHeight;
      }
    });
  }, [arena.agents]);

  // Auto-scroll synthesis into view when it appears
  useEffect(() => {
    if (arena.synthesis) {
      const container = agentsContainerRef.current;
      // Avoid yanking the user around if they're reading earlier content.
      if (container) {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom > 96) return;
      }
      synthRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [arena.synthesis]);

  const scrollToTop = () => {
    agentsContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    if (synthRef.current) {
      synthRef.current.scrollIntoView({ behavior: 'smooth' });
    } else {
      agentsContainerRef.current?.scrollTo({
        top: agentsContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="mind-panel">
      <div className="mind-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>◈ MIND MODULE</h2>
            <p>Multi-agent reasoning · General intelligence across all domains</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Scroll controls */}
            {arena.phase !== 'idle' && (
              <>
                <Button size="sm" onClick={scrollToTop} title="Scroll to top">
                  ↑
                </Button>
                <Button size="sm" onClick={scrollToBottom} title="Scroll to bottom">
                  ↓
                </Button>
                <Button size="sm" variant="danger" onClick={resetArena}>
                  RESET
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="arena-input-area">
        <div className="arena-input-wrapper">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pose a question for the multi-agent arena..."
            rows={2}
            disabled={isRunning}
          />
          <Button variant="primary" size="lg" onClick={handleStart} disabled={!prompt.trim() || isRunning}>
            {isRunning ? 'DEBATING...' : 'ENGAGE'}
          </Button>
        </div>
        <div
          style={{
            padding: '6px 4px 0',
            fontSize: 10,
            color: 'var(--text-ghost)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Using {settings.provider.toUpperCase()} / {settings.model} · 4 agents will analyze your question
        </div>
      </div>

      {/* Arena Content */}
      {arena.phase === 'idle' && !arena.isActive ? (
        <ArenaIdle />
      ) : (
        <div className="arena-scroll-container" ref={agentsContainerRef}>
          {/* Agent Cards */}
          <div className="arena-agents">
            {arena.agents.map((agent) => {
              const info = AGENT_INFO[agent.id];
              return (
                <div key={agent.id} className="arena-agent-card">
                  <div className="arena-agent-header">
                    <div
                      className="arena-agent-dot"
                      style={{
                        background: agent.color,
                        boxShadow: agent.isStreaming ? `0 0 8px ${agent.color}40` : 'none',
                      }}
                    />
                    <span className="arena-agent-name" style={{ color: agent.color }}>
                      {agent.name}
                    </span>
                    <span className="arena-agent-status">
                      {agent.isDone ? 'DONE' : agent.isStreaming ? 'THINKING' : 'WAITING'}
                    </span>
                  </div>
                  <div className={`arena-agent-body ${agent.isStreaming ? 'streaming' : ''}`}>
                    {agent.response || (
                      <span style={{ color: 'var(--text-ghost)', fontStyle: 'italic' }}>
                        {agent.isStreaming ? '' : info?.description || 'Waiting...'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Synthesis */}
          {(arena.synthesis || arena.phase === 'synthesizing' || arena.phase === 'complete') && (
            <div className="arena-synthesis" ref={synthRef}>
              <div className="arena-synthesis-title">◆ UNIFIED SYNTHESIS</div>
              <div className="arena-synthesis-content">{arena.synthesis || 'Synthesizing all perspectives...'}</div>
            </div>
          )}

          {blueprint && arena.phase === 'complete' && (
            <div className="arena-blueprint">
              <div className="arena-synthesis-title">◆ AGI BLUEPRINT</div>
              <div className="arena-blueprint-grid">
                <Card compact className="arena-blueprint-card" title="NORTH STAR">
                  <p>{blueprint.northStar}</p>
                </Card>

                <Card compact className="arena-blueprint-card" title="ARCHITECTURE">
                  <ul>
                    {blueprint.architecture.map((item, idx) => (
                      <li key={`${item.module}-${idx}`}>
                        <strong>{item.module}:</strong> {item.mvp}
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card compact className="arena-blueprint-card" title="LEARNING LOOP">
                  <ul>
                    {blueprint.learningLoop.map((item, idx) => (
                      <li key={`${item}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </Card>

                <Card compact className="arena-blueprint-card" title="SAFETY GATES">
                  <ul>
                    {blueprint.safetyGates.map((item, idx) => (
                      <li key={`${item}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </Card>

                <Card compact className="arena-blueprint-card" title="NEXT MILESTONES">
                  <ul>
                    {blueprint.nextMilestones.map((item, idx) => (
                      <li key={`${item.name}-${idx}`}>
                        <strong>{item.name}:</strong> {item.doneWhen}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
