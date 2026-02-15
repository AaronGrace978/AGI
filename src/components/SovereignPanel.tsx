// ═══════════════════════════════════════════════════════════════
//  SOVEREIGN Panel — Owner Command Center
//  Full control. Your policy. Your evolution. Your AGI.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { AutonomyLevel } from '../prime/policy';

const AUTONOMY_LEVELS: { id: AutonomyLevel; label: string; desc: string }[] = [
  { id: 'manual',      label: 'MANUAL',      desc: 'Every action requires approval' },
  { id: 'supervised',  label: 'SUPERVISED',   desc: 'Runs freely, logs everything, can be paused' },
  { id: 'autonomous',  label: 'AUTONOMOUS',   desc: 'Full autonomy within policy bounds' },
  { id: 'sovereign',   label: 'SOVEREIGN',    desc: 'Unrestricted. Owner-controlled only.' },
];

function msToDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default function SovereignPanel() {
  const sovereign = useStore((s) => s.sovereign);
  const policy = useStore((s) => s.sovereignPolicy);
  const updatePolicy = useStore((s) => s.updateSovereignPolicy);
  const startSovereign = useStore((s) => s.startSovereign);
  const killSovereign = useStore((s) => s.killSovereign);
  const resetSovereign = useStore((s) => s.resetSovereign);

  const logEndRef = useRef<HTMLDivElement>(null);
  const [showPolicy, setShowPolicy] = useState(false);

  const isRunning = sovereign.phase === 'evolving' || sovereign.phase === 'initializing';

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sovereign.logs.length]);

  return (
    <div className="sovereign-panel">
      {/* ─── Header ─────────────────────────────────────── */}
      <div className="sovereign-header">
        <div>
          <h2>◆ SOVEREIGN</h2>
          <p>Owner command center — evolution runtime + policy engine</p>
        </div>
        <div className="sovereign-header-right">
          <div className={`sovereign-phase ${sovereign.phase}`}>
            <div className="sovereign-phase-dot" />
            {sovereign.phase.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="sovereign-body">
        {/* ─── Controls ───────────────────────────────────── */}
        <div className="sovereign-controls">
          <button
            className="sovereign-btn primary"
            onClick={() => startSovereign()}
            disabled={isRunning}
          >
            IGNITE
          </button>
          <button
            className="sovereign-btn danger"
            onClick={killSovereign}
            disabled={!isRunning}
          >
            KILL
          </button>
          <button
            className="sovereign-btn"
            onClick={resetSovereign}
            disabled={isRunning}
          >
            RESET
          </button>
          <button
            className="sovereign-btn"
            onClick={() => setShowPolicy((p) => !p)}
          >
            {showPolicy ? 'HIDE POLICY' : 'POLICY'}
          </button>
        </div>

        {/* ─── Policy Editor (collapsible) ────────────────── */}
        {showPolicy && (
          <div className="sovereign-policy-editor">
            <h3>Owner Policy</h3>
            <div className="policy-grid">
              {/* Autonomy Level */}
              <div className="policy-field full">
                <label>Autonomy Level</label>
                <div className="autonomy-selector">
                  {AUTONOMY_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      className={`autonomy-btn ${policy.autonomyLevel === level.id ? 'active' : ''}`}
                      onClick={() => updatePolicy({ autonomyLevel: level.id })}
                      disabled={isRunning}
                      title={level.desc}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="policy-field">
                <label>Self-mutation</label>
                <button
                  className={`policy-toggle ${policy.allowSelfMutation ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowSelfMutation: !policy.allowSelfMutation })}
                  disabled={isRunning}
                >
                  {policy.allowSelfMutation ? 'ENABLED' : 'OFF'}
                </button>
              </div>
              <div className="policy-field">
                <label>Unbounded loops</label>
                <button
                  className={`policy-toggle ${policy.allowUnboundedLoops ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowUnboundedLoops: !policy.allowUnboundedLoops })}
                  disabled={isRunning}
                >
                  {policy.allowUnboundedLoops ? 'ENABLED' : 'OFF'}
                </button>
              </div>
              <div className="policy-field">
                <label>Network calls</label>
                <button
                  className={`policy-toggle ${policy.allowNetworkCalls ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowNetworkCalls: !policy.allowNetworkCalls })}
                  disabled={isRunning}
                >
                  {policy.allowNetworkCalls ? 'ENABLED' : 'OFF'}
                </button>
              </div>
              <div className="policy-field">
                <label>FS writes</label>
                <button
                  className={`policy-toggle ${policy.allowFileSystemWrites ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowFileSystemWrites: !policy.allowFileSystemWrites })}
                  disabled={isRunning}
                >
                  {policy.allowFileSystemWrites ? 'ENABLED' : 'OFF'}
                </button>
              </div>
              <div className="policy-field">
                <label>Process execution</label>
                <button
                  className={`policy-toggle ${policy.allowProcessExecution ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowProcessExecution: !policy.allowProcessExecution })}
                  disabled={isRunning}
                >
                  {policy.allowProcessExecution ? 'ENABLED' : 'OFF'}
                </button>
              </div>

              {/* Numeric controls */}
              <div className="policy-field">
                <label>Max generations (0 = unlimited)</label>
                <input
                  type="number" min={0} max={9999}
                  value={policy.maxGenerations}
                  onChange={(e) => updatePolicy({ maxGenerations: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Candidates / gen</label>
                <input
                  type="number" min={2} max={50}
                  value={policy.maxCandidatesPerGen}
                  onChange={(e) => updatePolicy({ maxCandidatesPerGen: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Mutation aggression</label>
                <input
                  type="number" min={0.05} max={1.0} step={0.05}
                  value={policy.mutationAggressiveness}
                  onChange={(e) => updatePolicy({ mutationAggressiveness: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Max runtime ms (0 = unlimited)</label>
                <input
                  type="number" min={0} max={999999}
                  value={policy.maxRuntimeMs}
                  onChange={(e) => updatePolicy({ maxRuntimeMs: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Reasoning depth (1-10)</label>
                <input
                  type="number" min={1} max={10}
                  value={policy.reasoningDepth}
                  onChange={(e) => updatePolicy({ reasoningDepth: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Exploration breadth (1-10)</label>
                <input
                  type="number" min={1} max={10}
                  value={policy.explorationBreadth}
                  onChange={(e) => updatePolicy({ explorationBreadth: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── Telemetry Dashboard ────────────────────────── */}
        <div className="sovereign-telemetry">
          <div className="sovereign-metric">
            <span>Generation</span>
            <strong>{sovereign.totalGenerations}</strong>
          </div>
          <div className="sovereign-metric">
            <span>Candidates</span>
            <strong>{sovereign.totalCandidatesEvaluated}</strong>
          </div>
          <div className="sovereign-metric">
            <span>Best Score</span>
            <strong className="score">
              {sovereign.currentBest ? `${(sovereign.currentBest.score * 100).toFixed(1)}%` : '--'}
            </strong>
          </div>
          <div className="sovereign-metric">
            <span>Convergence</span>
            <strong>{(sovereign.convergenceScore * 100).toFixed(0)}%</strong>
          </div>
          <div className="sovereign-metric">
            <span>Elapsed</span>
            <strong>{msToDuration(sovereign.elapsedMs)}</strong>
          </div>
          <div className="sovereign-metric">
            <span>Pass Rate</span>
            <strong>
              {sovereign.currentBest ? `${(sovereign.currentBest.passRate * 100).toFixed(1)}%` : '--'}
            </strong>
          </div>
          <div className="sovereign-metric">
            <span>Champion</span>
            <strong style={{ color: sovereign.championDeployed ? '#00ff41' : 'var(--text-ghost)' }}>
              {sovereign.championDeployed ? 'DEPLOYED' : 'PENDING'}
            </strong>
          </div>
        </div>

        {/* ─── Best Candidate Detail ──────────────────────── */}
        {sovereign.currentBest && (
          <div className="sovereign-candidate">
            <h3>Current Champion</h3>
            <div className="candidate-detail">
              <div><span>ID</span><strong>{sovereign.currentBest.id}</strong></div>
              <div><span>Gen</span><strong>{sovereign.currentBest.generation}</strong></div>
              <div><span>Temp</span><strong>{sovereign.currentBest.temperature.toFixed(3)}</strong></div>
              <div><span>Tools</span><strong>{sovereign.currentBest.toolBudget}</strong></div>
            </div>
            <div className="candidate-prompt">
              <span>Prompt DNA</span>
              <pre>{sovereign.currentBest.promptTemplate}</pre>
            </div>
          </div>
        )}

        {/* ─── Live Log ───────────────────────────────────── */}
        <div className="sovereign-log">
          <h3>Runtime Log</h3>
          <div className="sovereign-log-scroll">
            {sovereign.logs.map((line, i) => (
              <div key={i} className={`sov-log-line ${line.startsWith('G') ? 'gen' : line.startsWith('══') ? 'header' : line.startsWith('──') ? 'divider' : ''}`}>
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
