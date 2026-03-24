// ═══════════════════════════════════════════════════════════════
//  SOVEREIGN Panel — Owner Command Center
//  Full control. Your policy. Your evolution. Your AGI.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { useStore } from '../store';
import type { AutonomyLevel } from '../prime/policy';
import type { OrchestratorEvent, OrchestratorMissionSnapshot, OrchestratorProfile } from '../types';
import HardeningPanel from './HardeningPanel';
import { Button, Card } from './ui';
import { usePinnedAutoScroll } from '../hooks/usePinnedAutoScroll';

const AUTONOMY_LEVELS: { id: AutonomyLevel; label: string; desc: string }[] = [
  { id: 'manual', label: 'MANUAL', desc: 'Every action requires approval' },
  { id: 'supervised', label: 'SUPERVISED', desc: 'Runs freely, logs everything, can be paused' },
  { id: 'autonomous', label: 'AUTONOMOUS', desc: 'Full autonomy within policy bounds' },
  { id: 'sovereign', label: 'SOVEREIGN', desc: 'Unrestricted. Owner-controlled only.' },
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

function missionEventTone(type: string): 'good' | 'warn' | 'danger' | 'neutral' {
  if (type === 'action_executed' || type === 'goal_completed' || type === 'heartbeat') return 'good';
  if (type === 'action_blocked' || type === 'policy_updated') return 'warn';
  if (type.includes('emergency') || type === 'error') return 'danger';
  return 'neutral';
}

function missionEventLabel(type: string): string {
  return type.replace(/_/g, ' ').toUpperCase();
}

type MissionFilter = 'all' | 'actions' | 'goals' | 'policy' | 'emergency' | 'errors';

function missionEventMatchesFilter(type: string, filter: MissionFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'actions') return type === 'action_executed' || type === 'action_blocked';
  if (filter === 'goals') return type === 'goal_submitted' || type === 'goal_completed';
  if (filter === 'policy') return type === 'policy_updated' || type === 'profile_changed';
  if (filter === 'emergency') return type.includes('emergency');
  if (filter === 'errors') return type === 'error';
  return true;
}

function SovereignPanel() {
  const sovereign = useStore((s) => s.sovereign);
  const policy = useStore((s) => s.sovereignPolicy);
  const updatePolicy = useStore((s) => s.updateSovereignPolicy);
  const startSovereign = useStore((s) => s.startSovereign);
  const killSovereign = useStore((s) => s.killSovereign);
  const resetSovereign = useStore((s) => s.resetSovereign);
  const agiScore = useStore((s) => s.agiScore);
  const agiScoreSetConfig = useStore((s) => s.agiScoreSetConfig);
  const selfMod = useStore((s) => s.selfMod);
  const selfModSetEnabled = useStore((s) => s.selfModSetEnabled);
  const selfModSetRepoRoot = useStore((s) => s.selfModSetRepoRoot);
  const selfModSetRequest = useStore((s) => s.selfModSetRequest);
  const selfModRun = useStore((s) => s.selfModRun);

  const logScrollRef = useRef<HTMLDivElement>(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const [mission, setMission] = useState<OrchestratorMissionSnapshot | null>(null);
  const [missionError, setMissionError] = useState<string>('');
  const [recentEvents, setRecentEvents] = useState<OrchestratorEvent[]>([]);
  const [goalDraft, setGoalDraft] = useState('');
  const [timelineFilter, setTimelineFilter] = useState<MissionFilter>('all');
  const [exportStatus, setExportStatus] = useState<string>('');
  const [runbookOutput, setRunbookOutput] = useState<string>('');
  const [runbookRole, setRunbookRole] = useState<'observer' | 'operator' | 'maintainer'>('observer');
  const activeProfile = useMemo(() => String(mission?.status.profile || '').toLowerCase(), [mission?.status.profile]);

  const isRunning = sovereign.phase === 'evolving' || sovereign.phase === 'initializing';

  const refreshSnapshot = useCallback(async () => {
    if (!window.api?.orchestrator?.missionSnapshot) return;
    const res = await window.api.orchestrator.missionSnapshot({ eventLimit: 120 });
    if (res?.success && res.snapshot) {
      setMission(res.snapshot);
      setRecentEvents((res.snapshot.latestEvents || []).slice(-40).reverse());
      const role = String(res.snapshot.status.runbookRole || 'observer');
      if (role === 'maintainer' || role === 'operator' || role === 'observer') {
        setRunbookRole(role);
      }
      setMissionError('');
    } else {
      setMissionError(res?.error || 'Mission snapshot unavailable');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const loadSnapshot = async () => {
      if (cancelled) return;
      await refreshSnapshot();
    };

    void loadSnapshot();
    const interval = window.setInterval(() => {
      void loadSnapshot();
    }, 12000);

    if (window.api?.orchestrator?.onEvent) {
      unsubscribe = window.api.orchestrator.onEvent((evt) => {
        setRecentEvents((prev) => [evt, ...prev].slice(0, 50));
      });
    }

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (unsubscribe) unsubscribe();
    };
  }, [refreshSnapshot]);

  const runOrchestratorCommand = useCallback(
    async (type: string, payload: Record<string, unknown> = {}) => {
      if (!window.api?.orchestrator?.command) {
        setMissionError('Orchestrator command API unavailable');
        return;
      }
      const res = await window.api.orchestrator.command({ type, payload });
      if (!res?.success) {
        setMissionError(String(res?.error || `Command failed: ${type}`));
      } else {
        setMissionError('');
        await refreshSnapshot();
      }
    },
    [refreshSnapshot],
  );

  const setProfile = useCallback(
    async (profile: OrchestratorProfile) => {
      await runOrchestratorCommand('set_profile', { profile });
    },
    [runOrchestratorCommand],
  );

  const filteredEvents = useMemo(
    () => recentEvents.filter((evt) => missionEventMatchesFilter(evt.type, timelineFilter)),
    [recentEvents, timelineFilter],
  );

  const exportTimeline = useCallback(async (format: 'json' | 'jsonl') => {
    if (!window.api?.orchestrator?.exportEvents) {
      setMissionError('Export API unavailable');
      return;
    }
    const res = await window.api.orchestrator.exportEvents({ limit: 5000, format });
    if (!res?.success) {
      setMissionError(String(res?.error || 'Export failed'));
      return;
    }
    setMissionError('');
    setExportStatus(`Exported ${res.count || 0} events to ${res.path}`);
  }, []);

  const runRunbookAction = useCallback(
    async (actionId: string) => {
      if (!window.api?.orchestrator?.runbookAction || !window.api?.orchestrator?.prepareRunbookAction) {
        setMissionError('Runbook API unavailable');
        return;
      }
      setRunbookOutput(`Running action: ${actionId} ...`);
      const prep = await window.api.orchestrator.prepareRunbookAction(actionId);
      if (!prep?.success) {
        setMissionError(String(prep?.error || `Preparation failed: ${actionId}`));
        setRunbookOutput(`[${actionId}] PREP FAILED`);
        return;
      }
      if (prep.confirmationRequired && prep.token) {
        setRunbookOutput(`Confirmed high-impact action: ${actionId}\nToken expires in ~30s`);
      }

      const res = await window.api.orchestrator.runbookAction(
        actionId,
        prep.confirmationRequired ? { confirmationToken: prep.token } : undefined,
      );
      if (!res?.success) {
        setMissionError(String(res?.error || `Runbook action failed: ${actionId}`));
        setRunbookOutput(`[${actionId}] FAILED\n${String(res?.stderr || res?.error || '')}`.slice(0, 12000));
        return;
      }
      setMissionError('');
      const output = String(res.stdout || res.stderr || 'Action completed (no output).');
      setRunbookOutput(`[${actionId}] OK\n${output}`.slice(0, 16000));
      await refreshSnapshot();
    },
    [refreshSnapshot],
  );

  const updateRunbookRole = useCallback(
    async (role: 'observer' | 'operator' | 'maintainer') => {
      if (!window.api?.orchestrator?.setRunbookRole) {
        setMissionError('Runbook role API unavailable');
        return;
      }
      const res = await window.api.orchestrator.setRunbookRole(role);
      if (!res?.success) {
        setMissionError(String(res?.error || 'Failed to set runbook role'));
        return;
      }
      setMissionError('');
      setRunbookRole(role);
      await refreshSnapshot();
    },
    [refreshSnapshot],
  );

  // Auto-scroll log only while pinned to bottom.
  usePinnedAutoScroll(logScrollRef, [sovereign.logs.length], { behavior: 'auto', bottomThresholdPx: 64 });

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
          <Button
            variant="primary"
            className="sovereign-btn primary"
            onClick={() => startSovereign()}
            disabled={isRunning}
          >
            IGNITE
          </Button>
          <Button variant="danger" className="sovereign-btn danger" onClick={killSovereign} disabled={!isRunning}>
            KILL
          </Button>
          <Button className="sovereign-btn" onClick={resetSovereign} disabled={isRunning}>
            RESET
          </Button>
          <Button className="sovereign-btn" onClick={() => setShowPolicy((p) => !p)}>
            {showPolicy ? 'HIDE POLICY' : 'POLICY'}
          </Button>
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
                    <Button
                      key={level.id}
                      size="sm"
                      className={`autonomy-btn ${policy.autonomyLevel === level.id ? 'active' : ''}`}
                      onClick={() => updatePolicy({ autonomyLevel: level.id })}
                      disabled={isRunning}
                      title={level.desc}
                    >
                      {level.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="policy-field">
                <label>Self-mutation</label>
                <Button
                  size="sm"
                  className={`policy-toggle ${policy.allowSelfMutation ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowSelfMutation: !policy.allowSelfMutation })}
                  disabled={isRunning}
                >
                  {policy.allowSelfMutation ? 'ENABLED' : 'OFF'}
                </Button>
              </div>
              <div className="policy-field">
                <label>Unbounded loops</label>
                <Button
                  size="sm"
                  className={`policy-toggle ${policy.allowUnboundedLoops ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowUnboundedLoops: !policy.allowUnboundedLoops })}
                  disabled={isRunning}
                >
                  {policy.allowUnboundedLoops ? 'ENABLED' : 'OFF'}
                </Button>
              </div>
              <div className="policy-field">
                <label>Network calls</label>
                <Button
                  size="sm"
                  className={`policy-toggle ${policy.allowNetworkCalls ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowNetworkCalls: !policy.allowNetworkCalls })}
                  disabled={isRunning}
                >
                  {policy.allowNetworkCalls ? 'ENABLED' : 'OFF'}
                </Button>
              </div>
              <div className="policy-field">
                <label>FS writes</label>
                <Button
                  size="sm"
                  className={`policy-toggle ${policy.allowFileSystemWrites ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowFileSystemWrites: !policy.allowFileSystemWrites })}
                  disabled={isRunning}
                >
                  {policy.allowFileSystemWrites ? 'ENABLED' : 'OFF'}
                </Button>
              </div>
              <div className="policy-field">
                <label>Process execution</label>
                <Button
                  size="sm"
                  className={`policy-toggle ${policy.allowProcessExecution ? 'on' : ''}`}
                  onClick={() => updatePolicy({ allowProcessExecution: !policy.allowProcessExecution })}
                  disabled={isRunning}
                >
                  {policy.allowProcessExecution ? 'ENABLED' : 'OFF'}
                </Button>
              </div>

              {/* Numeric controls */}
              <div className="policy-field">
                <label>Max generations (0 = unlimited)</label>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={policy.maxGenerations}
                  onChange={(e) => updatePolicy({ maxGenerations: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Candidates / gen</label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={policy.maxCandidatesPerGen}
                  onChange={(e) => updatePolicy({ maxCandidatesPerGen: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Mutation aggression</label>
                <input
                  type="number"
                  min={0.05}
                  max={1.0}
                  step={0.05}
                  value={policy.mutationAggressiveness}
                  onChange={(e) => updatePolicy({ mutationAggressiveness: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Max runtime ms (0 = unlimited)</label>
                <input
                  type="number"
                  min={0}
                  max={999999}
                  value={policy.maxRuntimeMs}
                  onChange={(e) => updatePolicy({ maxRuntimeMs: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Reasoning depth (1-10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={policy.reasoningDepth}
                  onChange={(e) => updatePolicy({ reasoningDepth: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Exploration breadth (1-10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={policy.explorationBreadth}
                  onChange={(e) => updatePolicy({ explorationBreadth: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>
            </div>

            <h3 style={{ marginTop: 18 }}>AGI Score Rubric</h3>
            <div className="policy-grid">
              <div className="policy-field full">
                <label>Latest AGI score</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <strong style={{ fontSize: 18 }}>
                    {agiScore.latest ? `${agiScore.latest.total.toFixed(2)} / 10` : 'n/a'}
                  </strong>
                  {agiScore.lastError && <span style={{ color: '#ff006e' }}>{agiScore.lastError}</span>}
                </div>
              </div>

              <div className="policy-field">
                <label>Optimize Auto Cycle for AGI score</label>
                <Button
                  size="sm"
                  className={`policy-toggle ${agiScore.config.optimizeInAutoCycle ? 'on' : ''}`}
                  onClick={() => agiScoreSetConfig({ optimizeInAutoCycle: !agiScore.config.optimizeInAutoCycle })}
                  disabled={isRunning}
                  title="When enabled, Forge adaptive benchmarks target the weakest AGI subscores."
                >
                  {agiScore.config.optimizeInAutoCycle ? 'ENABLED' : 'OFF'}
                </Button>
              </div>

              <div className="policy-field">
                <label>Require real-workflow evidence</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={agiScore.config.requireRealWorkflowCountForFullCredit}
                  onChange={(e) => agiScoreSetConfig({ requireRealWorkflowCountForFullCredit: Number(e.target.value) })}
                  disabled={isRunning}
                />
              </div>

              <div className="policy-field">
                <label>Weight: Reasoning & logic</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={agiScore.config.weights.abstractReasoningLogic}
                  onChange={(e) =>
                    agiScoreSetConfig({
                      weights: { ...agiScore.config.weights, abstractReasoningLogic: Number(e.target.value) },
                    })
                  }
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Weight: Learning flexibility</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={agiScore.config.weights.learningFlexibility}
                  onChange={(e) =>
                    agiScoreSetConfig({
                      weights: { ...agiScore.config.weights, learningFlexibility: Number(e.target.value) },
                    })
                  }
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Weight: Domain generality</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={agiScore.config.weights.domainGenerality}
                  onChange={(e) =>
                    agiScoreSetConfig({
                      weights: { ...agiScore.config.weights, domainGenerality: Number(e.target.value) },
                    })
                  }
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Weight: Goal-setting</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={agiScore.config.weights.autonomousGoalSetting}
                  onChange={(e) =>
                    agiScoreSetConfig({
                      weights: { ...agiScore.config.weights, autonomousGoalSetting: Number(e.target.value) },
                    })
                  }
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Weight: Meta-cognition</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={agiScore.config.weights.selfModelingMetaCognition}
                  onChange={(e) =>
                    agiScoreSetConfig({
                      weights: { ...agiScore.config.weights, selfModelingMetaCognition: Number(e.target.value) },
                    })
                  }
                  disabled={isRunning}
                />
              </div>
              <div className="policy-field">
                <label>Weight: Creativity</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={agiScore.config.weights.creativeProblemSolving}
                  onChange={(e) =>
                    agiScoreSetConfig({
                      weights: { ...agiScore.config.weights, creativeProblemSolving: Number(e.target.value) },
                    })
                  }
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
            <strong>{sovereign.currentBest ? `${(sovereign.currentBest.passRate * 100).toFixed(1)}%` : '--'}</strong>
          </div>
          <div className="sovereign-metric">
            <span>Champion</span>
            <strong style={{ color: sovereign.championDeployed ? '#00ff41' : 'var(--text-ghost)' }}>
              {sovereign.championDeployed ? 'DEPLOYED' : 'PENDING'}
            </strong>
          </div>
        </div>

        {/* ─── Mission Control (PrimeOS Orchestrator) ───── */}
        <Card title="Mission Control" className="sovereign-log mission-control-log" glow="none">
          <div className="mission-control-toolbar">
            <Button
              className={`sovereign-btn ${activeProfile === 'manual-operator' ? 'mission-selected' : ''}`}
              onClick={() => void setProfile('manual-operator')}
            >
              PROFILE: MANUAL
            </Button>
            <Button
              variant="primary"
              className={`sovereign-btn primary ${activeProfile === 'autonomous-limited' ? 'mission-selected' : ''}`}
              onClick={() => void setProfile('autonomous-limited')}
            >
              PROFILE: AUTONOMOUS-LIMITED
            </Button>
            <Button
              className={`sovereign-btn ${activeProfile === 'sovereign-desktop' ? 'mission-selected' : ''}`}
              onClick={() => void setProfile('sovereign-desktop')}
            >
              PROFILE: SOVEREIGN
            </Button>
            <Button
              variant="danger"
              className={`sovereign-btn danger ${activeProfile === 'owner-direct' ? 'mission-selected' : ''}`}
              onClick={() => void setProfile('owner-direct')}
            >
              PROFILE: OWNER-DIRECT
            </Button>
            <Button
              variant="danger"
              className="sovereign-btn danger"
              onClick={() => void runOrchestratorCommand('emergency_stop')}
            >
              EMERGENCY STOP
            </Button>
            <Button className="sovereign-btn" onClick={() => void runOrchestratorCommand('clear_emergency_stop')}>
              CLEAR STOP
            </Button>
          </div>

          <div className="mission-goal-row">
            <input
              type="text"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              placeholder="Submit high-level goal to orchestrator..."
              style={{ flex: 1 }}
            />
            <Button
              className="sovereign-btn"
              disabled={!goalDraft.trim()}
              onClick={() => {
                const text = goalDraft.trim();
                if (!text) return;
                void runOrchestratorCommand('submit_goal', { description: text, priority: 6 });
                setGoalDraft('');
              }}
            >
              SUBMIT GOAL
            </Button>
          </div>

          {mission && (
            <div className="sovereign-telemetry mission-metrics">
              <div className="sovereign-metric">
                <span>Profile</span>
                <strong>{String(mission.status.profile).toUpperCase()}</strong>
              </div>
              <div className="sovereign-metric">
                <span>Mode</span>
                <strong>{mission.status.mode.toUpperCase()}</strong>
              </div>
              <div className="sovereign-metric">
                <span>Heartbeat</span>
                <strong>{mission.status.heartbeatCount}</strong>
              </div>
              <div className="sovereign-metric">
                <span>Uptime</span>
                <strong>{msToDuration(mission.status.uptimeMs)}</strong>
              </div>
              <div className="sovereign-metric">
                <span>Goals</span>
                <strong>{mission.goals.active} active</strong>
              </div>
              <div className="sovereign-metric">
                <span>Blocks</span>
                <strong>{mission.audit.recentBlocks}</strong>
              </div>
            </div>
          )}
          {activeProfile === 'owner-direct' && (
            <div className="mission-error">
              Owner-Direct mode is active: actions execute immediately; keep Emergency Stop ready.
            </div>
          )}

          {missionError && <div className="mission-error">{missionError}</div>}

          <div className="sovereign-log-scroll mission-events-scroll">
            <div className="mission-runbook-strip">
              <Button
                size="sm"
                className={`sovereign-btn mission-filter-btn ${runbookRole === 'observer' ? 'mission-selected' : ''}`}
                onClick={() => void updateRunbookRole('observer')}
              >
                ROLE: OBSERVER
              </Button>
              <Button
                size="sm"
                className={`sovereign-btn mission-filter-btn ${runbookRole === 'operator' ? 'mission-selected' : ''}`}
                onClick={() => void updateRunbookRole('operator')}
              >
                ROLE: OPERATOR
              </Button>
              <Button
                size="sm"
                className={`sovereign-btn mission-filter-btn ${runbookRole === 'maintainer' ? 'mission-selected' : ''}`}
                onClick={() => void updateRunbookRole('maintainer')}
              >
                ROLE: MAINTAINER
              </Button>
            </div>
            <div className="mission-runbook-strip">
              <Button
                size="sm"
                className="sovereign-btn mission-filter-btn"
                onClick={() => void runRunbookAction('service_status')}
              >
                SERVICE STATUS
              </Button>
              <Button
                size="sm"
                variant="danger"
                className="sovereign-btn mission-filter-btn danger"
                onClick={() => void runRunbookAction('service_restart')}
              >
                RESTART SERVICE
              </Button>
              <Button
                size="sm"
                className="sovereign-btn mission-filter-btn"
                onClick={() => void runRunbookAction('logs_tail')}
              >
                TAIL LOGS
              </Button>
              <Button
                size="sm"
                variant="danger"
                className="sovereign-btn mission-filter-btn danger"
                onClick={() => void runRunbookAction('apt_update')}
              >
                APT UPDATE
              </Button>
              <Button
                size="sm"
                className="sovereign-btn mission-filter-btn"
                onClick={() => void runRunbookAction('disk_health')}
              >
                DISK HEALTH
              </Button>
              <Button
                size="sm"
                className="sovereign-btn mission-filter-btn"
                onClick={() => void runRunbookAction('memory_health')}
              >
                MEMORY HEALTH
              </Button>
            </div>
            {runbookOutput && <pre className="mission-runbook-output">{runbookOutput}</pre>}
            <div className="mission-timeline-toolbar">
              <div className="mission-filter-group">
                {(['all', 'actions', 'goals', 'policy', 'emergency', 'errors'] as MissionFilter[]).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    className={`sovereign-btn mission-filter-btn ${timelineFilter === f ? 'mission-selected' : ''}`}
                    onClick={() => setTimelineFilter(f)}
                  >
                    {f.toUpperCase()}
                  </Button>
                ))}
              </div>
              <div className="mission-export-group">
                <Button
                  size="sm"
                  className="sovereign-btn mission-filter-btn"
                  onClick={() => void exportTimeline('json')}
                >
                  EXPORT JSON
                </Button>
                <Button
                  size="sm"
                  className="sovereign-btn mission-filter-btn"
                  onClick={() => void exportTimeline('jsonl')}
                >
                  EXPORT JSONL
                </Button>
              </div>
            </div>
            {exportStatus && <div className="mission-export-status">{exportStatus}</div>}
            {filteredEvents.length === 0 ? (
              <div className="sov-log-line">No orchestrator events yet.</div>
            ) : (
              filteredEvents.map((evt) => (
                <div key={evt.id} className={`sov-log-line mission-event tone-${missionEventTone(evt.type)}`}>
                  <span className="mission-event-time">
                    {new Date(evt.emittedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <span className="mission-event-type">{missionEventLabel(evt.type)}</span>
                  <span className="mission-event-source">{String(evt.source).toUpperCase()}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* ─── Best Candidate Detail ──────────────────────── */}
        {sovereign.currentBest && (
          <Card title="Current Champion" className="sovereign-candidate" glow="none">
            <div className="candidate-detail">
              <div>
                <span>ID</span>
                <strong>{sovereign.currentBest.id}</strong>
              </div>
              <div>
                <span>Gen</span>
                <strong>{sovereign.currentBest.generation}</strong>
              </div>
              <div>
                <span>Temp</span>
                <strong>{sovereign.currentBest.temperature.toFixed(3)}</strong>
              </div>
              <div>
                <span>Tools</span>
                <strong>{sovereign.currentBest.toolBudget}</strong>
              </div>
            </div>
            <div className="candidate-prompt">
              <span>Prompt DNA</span>
              <pre>{sovereign.currentBest.promptTemplate}</pre>
            </div>
          </Card>
        )}

        {/* ─── Hardening Health ──────────────────────────── */}
        <HardeningPanel />

        {/* ─── Self-Mod Pipeline (Opt-in) ─────────────────── */}
        <Card title="Self-Mod Pipeline (Opt-in)" className="sovereign-log" glow="none">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant={selfMod.enabled ? 'primary' : 'ghost'}
              className={`sovereign-btn ${selfMod.enabled ? 'primary' : ''}`}
              onClick={() => selfModSetEnabled(!selfMod.enabled)}
              disabled={selfMod.running}
              title="Enables the app to attempt self-modifying code changes. Use carefully."
            >
              {selfMod.enabled ? 'ENABLED' : 'DISABLED'}
            </Button>
            <Button
              className="sovereign-btn"
              onClick={() => selfModRun()}
              disabled={!selfMod.enabled || selfMod.running || !selfMod.request.trim()}
              title="Runs Hands -> npm test -> verification gauntlet -> rollback on regression."
            >
              {selfMod.running ? `RUNNING (${selfMod.phase})` : 'RUN SELF-MOD'}
            </Button>
          </div>

          <div className="sovereign-log-scroll" style={{ maxHeight: 420, marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, paddingRight: 8 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, opacity: 0.8 }}>Repo root (for npm test)</label>
                <input
                  type="text"
                  value={selfMod.repoRoot}
                  onChange={(e) => selfModSetRepoRoot(e.target.value)}
                  disabled={selfMod.running}
                  style={{ width: '100%' }}
                  placeholder="e.g. G:\\AGIPRIME"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, opacity: 0.8 }}>Request</label>
                <textarea
                  value={selfMod.request}
                  onChange={(e) => selfModSetRequest(e.target.value)}
                  disabled={selfMod.running}
                  style={{ width: '100%', minHeight: 90, resize: 'vertical' }}
                  placeholder="Describe the code change you want the system to implement."
                />
              </div>
              {selfMod.lastResult && (
                <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <strong style={{ color: selfMod.lastResult.success ? '#00ff41' : '#ff006e' }}>
                      {selfMod.lastResult.success ? 'SUCCESS' : 'FAILED'}
                    </strong>
                    {typeof selfMod.lastResult.testsPassed === 'boolean' && (
                      <span>tests: {selfMod.lastResult.testsPassed ? 'PASS' : 'FAIL'}</span>
                    )}
                    {typeof selfMod.lastResult.gauntletDelta === 'number' && (
                      <span>gauntlet Δ {(selfMod.lastResult.gauntletDelta * 100).toFixed(1)}%</span>
                    )}
                    {typeof selfMod.lastResult.agiDelta === 'number' && (
                      <span>AGI Δ {selfMod.lastResult.agiDelta.toFixed(2)}</span>
                    )}
                    {selfMod.lastResult.rolledBack && <span>rollback: applied</span>}
                  </div>
                </div>
              )}
              <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.9 }}>
                {selfMod.logs.slice(-60).map((line, i) => (
                  <div key={`${i}-${line}`}>{line}</div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Live Log ───────────────────────────────────── */}
        <Card title="Runtime Log" className="sovereign-log" glow="none">
          <div className="sovereign-log-scroll" ref={logScrollRef}>
            {sovereign.logs.map((line, i) => (
              <div
                key={i}
                className={`sov-log-line ${line.startsWith('G') ? 'gen' : line.startsWith('══') ? 'header' : line.startsWith('──') ? 'divider' : ''}`}
              >
                {line}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default memo(SovereignPanel);
