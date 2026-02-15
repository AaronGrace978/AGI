// ═══════════════════════════════════════════════════════════════
//  HANDS Panel — Cognitive Agent (ReAct Loop)
//  Real agency. Observe → Think → Act → Reflect → Loop.
//  No more one-shot planning. The mind pursues goals.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import type { CognitiveStep } from '../types';

const STEP_COLORS: Record<string, string> = {
  observe: '#00ccff',
  think: '#a855f7',
  act: '#00ff41',
  reflect: '#ffd700',
  replan: '#ff006e',
};

const STEP_LABELS: Record<string, string> = {
  observe: 'OBSERVE',
  think: 'THINK',
  act: 'ACT',
  reflect: 'REFLECT',
  replan: 'REPLAN',
};

const STEP_ICONS: Record<string, string> = {
  observe: '◉',
  think: '◈',
  act: '▶',
  reflect: '◆',
  replan: '↺',
};

export default function HandsPanel() {
  const settings = useStore((s) => s.settings);
  const cognitive = useStore((s) => s.cognitive);
  const startCognitive = useStore((s) => s.startCognitive);
  const killCognitive = useStore((s) => s.killCognitive);
  const resetCognitive = useStore((s) => s.resetCognitive);

  const [input, setInput] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cognitive.steps]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || cognitive.isActive) return;
    startCognitive(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getProgressBar = () => {
    if (!cognitive.isActive && cognitive.steps.length === 0) return null;
    const lastStep = cognitive.steps[cognitive.steps.length - 1];
    const progress = lastStep?.goalProgress ?? 0;
    return (
      <div className="hands-progress">
        <div className="hands-progress-bar" style={{ width: `${progress * 100}%` }} />
        <span className="hands-progress-label">
          {cognitive.phase === 'complete' ? 'GOAL ACHIEVED' :
           cognitive.phase === 'failed' ? 'STOPPED' :
           cognitive.phase === 'killed' ? 'KILLED' :
           `${(progress * 100).toFixed(0)}% — ${cognitive.phase.toUpperCase()}`}
        </span>
      </div>
    );
  };

  const renderStep = (step: CognitiveStep, index: number) => {
    const color = STEP_COLORS[step.type] || 'var(--text-secondary)';
    const icon = STEP_ICONS[step.type] || '•';
    const label = STEP_LABELS[step.type] || step.type.toUpperCase();

    return (
      <div key={index} className={`hands-cognitive-step ${step.type}`} style={{ borderLeftColor: color }}>
        <div className="hands-cognitive-header">
          <span className="hands-cognitive-icon" style={{ color }}>{icon}</span>
          <span className="hands-cognitive-label" style={{ color }}>{label}</span>
          <span className="hands-cognitive-time">
            {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          {step.goalProgress !== undefined && step.goalProgress > 0 && (
            <span className="hands-cognitive-progress">{(step.goalProgress * 100).toFixed(0)}%</span>
          )}
        </div>
        <div className="hands-cognitive-content">
          {step.type === 'act' && step.actionType && (
            <div className="hands-cognitive-action">
              <span className="hands-action-badge">{step.actionType}</span>
              {step.actionResult && (
                <span className={`hands-action-result ${step.actionResult.success ? 'success' : 'fail'}`}>
                  {step.actionResult.success ? '✓ OK' : '✗ FAIL'}
                </span>
              )}
            </div>
          )}
          <div className="hands-cognitive-text">{step.content}</div>
          {step.actionResult?.output && (
            <pre className="hands-cognitive-output">{String(step.actionResult.output).slice(0, 500)}</pre>
          )}
          {step.actionResult?.error && !step.actionResult.success && (
            <pre className="hands-cognitive-error">{String(step.actionResult.error).slice(0, 300)}</pre>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="hands-panel">
      {/* Header */}
      <div className="hands-header">
        <div className="hands-header-left">
          <h2>✧ HANDS MODULE</h2>
          <p>Cognitive agent — ReAct loop with self-correction</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={`hands-status ${cognitive.isActive ? 'active' : ''}`}>
            <div className="hands-status-dot" />
            {cognitive.isActive ? cognitive.phase.toUpperCase() : cognitive.phase === 'complete' ? 'DONE' : cognitive.phase === 'failed' ? 'STOPPED' : 'READY'}
          </div>
          {cognitive.isActive && (
            <button className="mind-ctrl-btn" onClick={killCognitive} style={{ color: '#ff4444' }}>KILL</button>
          )}
          {cognitive.steps.length > 0 && !cognitive.isActive && (
            <button className="mind-ctrl-btn" onClick={resetCognitive}>CLEAR</button>
          )}
        </div>
      </div>

      {/* Progress */}
      {getProgressBar()}

      {/* Cognitive Steps */}
      <div className="hands-log">
        {cognitive.steps.length === 0 && !cognitive.isActive ? (
          <div className="hands-empty">
            <div className="hands-empty-icon">✧</div>
            <h3>COGNITIVE AGENT</h3>
            <p>
              Give AGI PRIME a goal. It will reason step-by-step, act,
              observe results, reflect on what happened, and adapt its
              approach until the goal is achieved.
            </p>
            <div className="hands-capabilities">
              <div className="hands-cap" style={{ borderColor: STEP_COLORS.observe }}>◉ Observe state</div>
              <div className="hands-cap" style={{ borderColor: STEP_COLORS.think }}>◈ Think &amp; plan</div>
              <div className="hands-cap" style={{ borderColor: STEP_COLORS.act }}>▶ Execute action</div>
              <div className="hands-cap" style={{ borderColor: STEP_COLORS.reflect }}>◆ Reflect &amp; learn</div>
            </div>
            <div className="hands-capabilities" style={{ marginTop: 8 }}>
              <div className="hands-cap">⌨ Commands</div>
              <div className="hands-cap">📁 Files</div>
              <div className="hands-cap">🌐 URLs</div>
              <div className="hands-cap">🔍 Search</div>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-ghost)', marginTop: 12 }}>
              Powered by ReAct (Reasoning + Acting) loop with semantic memory recall
            </p>
          </div>
        ) : (
          <div className="hands-log-entries">
            {cognitive.goal && (
              <div className="hands-cognitive-goal">
                <span className="hands-goal-label">GOAL</span>
                <span className="hands-goal-text">{cognitive.goal}</span>
              </div>
            )}
            {cognitive.steps.map((step, i) => renderStep(step, i))}
            {cognitive.isActive && (
              <div className="hands-cognitive-thinking">
                <div className="hands-thinking-dots">
                  <span>●</span><span>●</span><span>●</span>
                </div>
                <span>{cognitive.phase === 'thinking' ? 'Reasoning...' : cognitive.phase === 'acting' ? 'Executing...' : cognitive.phase === 'reflecting' ? 'Reflecting...' : 'Processing...'}</span>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="hands-input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Set a goal... (e.g. 'Find all Python files and list them', 'Create a project folder structure')"
            rows={1}
            disabled={cognitive.isActive}
          />
          <button
            className="send-btn hands-send"
            onClick={handleSubmit}
            disabled={!input.trim() || cognitive.isActive}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 5l7 7-7 7" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
        <div className="input-hint">
          <span>ReAct cognitive loop — reasons, acts, reflects, adapts</span>
          <span>{settings.provider.toUpperCase()} / {settings.model}</span>
        </div>
      </div>
    </div>
  );
}
