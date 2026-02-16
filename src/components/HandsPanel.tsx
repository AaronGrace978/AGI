// ═══════════════════════════════════════════════════════════════
//  HANDS Panel — Cognitive Agent (ReAct Loop)
//  Real agency. Observe → Think → Act → Reflect → Loop.
//  No more one-shot planning. The mind pursues goals.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import type { CognitiveStep } from '../types';
import type { AutonomyLevel } from '../prime/policy';
import { usePinnedAutoScroll } from '../hooks/usePinnedAutoScroll';

type ApiResult = Record<string, unknown> & {
  success?: boolean;
  error?: string;
  output?: string;
};

type DesktopIntel = {
  loadedAt: number;
  username: string;
  platform: string;
  cpuModel: string;
  totalMemoryGb: string;
  freeMemoryGb: string;
  homeDir: string;
  dimensions: string;
  foregroundWindow: string;
  mousePosition: string;
  processPreview: string[];
  controlsSummary: string;
};

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
  const updateSettings = useStore((s) => s.updateSettings);
  const cognitive = useStore((s) => s.cognitive);
  const pendingConsentActions = useStore((s) => s.pendingConsentActions);
  const rollbackEntries = useStore((s) => s.rollbackEntries);
  const replay = useStore((s) => s.replay);
  const sovereignPolicy = useStore((s) => s.sovereignPolicy);
  const executionTierLimit = useStore((s) => s.executionTierLimit);
  const emergencyStopActive = useStore((s) => s.emergencyStopActive);
  const runtimeControlSync = useStore((s) => s.runtimeControlSync);
  const consentMode = useStore((s) => s.consentMode);
  const setConsentMode = useStore((s) => s.setConsentMode);
  const setAutonomyLevel = useStore((s) => s.setAutonomyLevel);
  const setExecutionTierLimit = useStore((s) => s.setExecutionTierLimit);
  const triggerEmergencyStop = useStore((s) => s.triggerEmergencyStop);
  const clearEmergencyStop = useStore((s) => s.clearEmergencyStop);
  const syncRuntimeControls = useStore((s) => s.syncRuntimeControls);
  const resolveConsentAction = useStore((s) => s.resolveConsentAction);
  const refreshRollbacks = useStore((s) => s.refreshRollbacks);
  const executeRollback = useStore((s) => s.executeRollback);
  const replayLoadRuns = useStore((s) => s.replayLoadRuns);
  const replayLoadRun = useStore((s) => s.replayLoadRun);
  const replayNext = useStore((s) => s.replayNext);
  const replaySeek = useStore((s) => s.replaySeek);
  const replayTogglePlayPause = useStore((s) => s.replayTogglePlayPause);
  const replayStop = useStore((s) => s.replayStop);
  const startCognitive = useStore((s) => s.startCognitive);
  const killCognitive = useStore((s) => s.killCognitive);
  const resetCognitive = useStore((s) => s.resetCognitive);

  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [desktopIntel, setDesktopIntel] = useState<DesktopIntel | null>(null);
  const [desktopIntelLoading, setDesktopIntelLoading] = useState(false);
  const [desktopIntelError, setDesktopIntelError] = useState<string | null>(null);
  const [operatorBusy, setOperatorBusy] = useState(false);
  const [operatorResult, setOperatorResult] = useState<string | null>(null);
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [mouseX, setMouseX] = useState('0');
  const [mouseY, setMouseY] = useState('0');
  const [typeText, setTypeText] = useState('');
  const [shortcutModifiers, setShortcutModifiers] = useState('ctrl');
  const [shortcutKey, setShortcutKey] = useState('s');
  const [urlToOpen, setUrlToOpen] = useState('https://mail.google.com/mail/u/0/#inbox?compose=new');
  const [macroType, setMacroType] = useState<'email' | 'research' | 'desktop-prep'>('email');
  const [macroTarget, setMacroTarget] = useState('');
  const [macroSubject, setMacroSubject] = useState('');
  const [macroBody, setMacroBody] = useState('');
  const [macroDetails, setMacroDetails] = useState('');
  const [prefKey, setPrefKey] = useState('');
  const [prefValue, setPrefValue] = useState('');
  const handsLogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const operatorProfile = useStore((s) => s.operatorProfile);
  const synthesisSession = useStore((s) => s.synthesisSession);
  const synthesisStart = useStore((s) => s.synthesisStart);
  const synthesisStop = useStore((s) => s.synthesisStop);
  const synthesisPause = useStore((s) => s.synthesisPause);
  const synthesisResume = useStore((s) => s.synthesisResume);
  const synthesisAddObservation = useStore((s) => s.synthesisAddObservation);
  const synthesisAddPreference = useStore((s) => s.synthesisAddPreference);
  const synthesisRunSnapshot = useStore((s) => s.synthesisRunSnapshot);
  const synthesisDigest = useStore((s) => s.synthesisDigest);

  // Auto-scroll only while pinned to bottom (so you can scroll up mid-run).
  usePinnedAutoScroll(
    handsLogRef,
    [cognitive.steps.length, cognitive.isActive],
    { behavior: 'auto', bottomThresholdPx: 96 },
  );

  useEffect(() => {
    void refreshRollbacks();
  }, [refreshRollbacks]);
  useEffect(() => {
    void replayLoadRuns();
  }, [replayLoadRuns]);
  useEffect(() => {
    void syncRuntimeControls();
  }, [syncRuntimeControls]);
  useEffect(() => {
    if (!showSettings || desktopIntelLoading || desktopIntel) return;
    void loadDesktopIntel();
  }, [showSettings, desktopIntelLoading, desktopIntel]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || cognitive.isActive || emergencyStopActive) return;
    startCognitive(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // While HANDS is actively running, allow free typing (including Enter/newlines)
    // so the UI doesn't feel "frozen". Submit-on-Enter only when idle.
    if (cognitive.isActive || emergencyStopActive) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const telemetrySteps = cognitive.steps
    .filter((step) => step.actionType === 'telemetry' && !!step.actionResult?.output)
    .map((step) => {
      try {
        return {
          step,
          payload: JSON.parse(String(step.actionResult?.output || '{}')) as Record<string, unknown>,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<{ step: CognitiveStep; payload: Record<string, unknown> }>;

  const latestIterationTelemetry = [...telemetrySteps]
    .reverse()
    .find((t) => t.step.content.includes('iteration'));
  const latestRunSummaryTelemetry = [...telemetrySteps]
    .reverse()
    .find((t) => t.step.content.includes('run summary'));
  const pendingConsents = pendingConsentActions.filter((r) => r.status === 'pending');
  const readyRollbacks = rollbackEntries.filter((r) => r.status === 'ready');
  const replayCurrentStep = replay.steps.length > 0 ? replay.steps[replay.cursor] : null;

  const asResult = (value: unknown): ApiResult => (
    value && typeof value === 'object' ? (value as ApiResult) : {}
  );

  const formatError = (value: unknown, fallback: string): string => {
    const result = asResult(value);
    if (typeof result.error === 'string' && result.error.trim()) return result.error;
    if (typeof result.output === 'string' && result.output.trim()) return result.output;
    return fallback;
  };

  const runOperatorAction = async (
    run: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setOperatorBusy(true);
    setOperatorError(null);
    setOperatorResult(null);
    try {
      const response = asResult(await run());
      if (response.success === false) {
        throw new Error(formatError(response, 'Operator action failed'));
      }
      setOperatorResult(
        typeof response.output === 'string' && response.output.trim()
          ? response.output
          : successMessage,
      );
    } catch (e: unknown) {
      setOperatorError(e instanceof Error ? e.message : 'Operator action failed');
    } finally {
      setOperatorBusy(false);
    }
  };

  const loadDesktopIntel = async () => {
    if (!window.api?.agent) return;
    setDesktopIntelLoading(true);
    setDesktopIntelError(null);
    try {
      const [
        detailsRaw,
        dimRaw,
        foregroundRaw,
        mouseRaw,
        processRaw,
        controlsRaw,
      ] = await Promise.all([
        window.api.agent.systemDetails(),
        window.api.agent.getScreenDimensions(),
        window.api.agent.getForegroundWindow(),
        window.api.agent.getMousePosition(),
        window.api.agent.listProcesses(),
        window.api.agent.getRuntimeControls(),
      ]);
      const details = asResult(detailsRaw);
      const dimensions = asResult(dimRaw);
      const foreground = asResult(foregroundRaw);
      const mouse = asResult(mouseRaw);
      const processList = asResult(processRaw);
      const controls = asResult(controlsRaw);

      const processPreview = String(processList.output || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8);

      const controlMap = controls.controls && typeof controls.controls === 'object'
        ? controls.controls as Record<string, unknown>
        : {};
      const controlsSummary = [
        `consent=${String(controlMap.consentMode || 'unknown')}`,
        `tier=${String(controlMap.executionTierLimit || 'unknown')}`,
        `input=${String(controlMap.allowInputSimulation ?? 'unknown')}`,
        `screen=${String(controlMap.allowScreenCapture ?? 'unknown')}`,
      ].join(' • ');

      const totalMemory = Number(details.totalMemory || 0);
      const freeMemory = Number(details.freeMemory || 0);

      setDesktopIntel({
        loadedAt: Date.now(),
        username: String(details.username || 'unknown'),
        platform: `${String(details.platform || 'unknown')} ${String(details.release || '')}`.trim(),
        cpuModel: String(details.cpuModel || 'unknown'),
        totalMemoryGb: totalMemory > 0 ? (totalMemory / (1024 ** 3)).toFixed(1) : '0',
        freeMemoryGb: freeMemory > 0 ? (freeMemory / (1024 ** 3)).toFixed(1) : '0',
        homeDir: String(details.homeDir || 'unknown'),
        dimensions: `${String(dimensions.width || '?')}x${String(dimensions.height || '?')}`,
        foregroundWindow: String(foreground.output || 'unknown'),
        mousePosition: String(mouse.output || 'unknown'),
        processPreview,
        controlsSummary,
      });
    } catch (e: unknown) {
      setDesktopIntelError(e instanceof Error ? e.message : 'Failed to fetch desktop intel');
    } finally {
      setDesktopIntelLoading(false);
    }
  };

  const handleCenterMouse = async () => {
    if (!window.api?.agent) return;
    await runOperatorAction(async () => {
      const dim = asResult(await window.api.agent.getScreenDimensions());
      const width = Number(dim.width || 0);
      const height = Number(dim.height || 0);
      if (width <= 0 || height <= 0) {
        throw new Error('Could not determine screen dimensions');
      }
      return window.api.agent.mouseMove(Math.floor(width / 2), Math.floor(height / 2));
    }, 'Mouse centered');
    void loadDesktopIntel();
  };

  const operatorPowerOn = !emergencyStopActive;

  const setOperatorPower = async (targetOn: boolean) => {
    setOperatorBusy(true);
    setOperatorError(null);
    setOperatorResult(null);
    try {
      if (targetOn) {
        clearEmergencyStop();
        setAutonomyLevel('supervised');
        setConsentMode('ask-first');
        setExecutionTierLimit('high-risk');
        await syncRuntimeControls();
        await loadDesktopIntel();
        setOperatorResult('HANDS is ON: supervised control with ask-first consent.');
      } else {
        triggerEmergencyStop();
        setAutonomyLevel('manual');
        setConsentMode('manual');
        setExecutionTierLimit('read-only');
        await syncRuntimeControls();
        setOperatorResult('HANDS is OFF: emergency stop + manual/read-only safety mode.');
      }
    } catch (e: unknown) {
      setOperatorError(e instanceof Error ? e.message : 'Failed to toggle HANDS power');
    } finally {
      setOperatorBusy(false);
    }
  };

  const applySpeedProfile = async (profile: 'fast' | 'guarded') => {
    // Fast = fewer UI interruptions; Guarded = maximum explicit approvals.
    setOperatorBusy(true);
    setOperatorError(null);
    setOperatorResult(null);
    try {
      if (profile === 'fast') {
        setAutonomyLevel('supervised');
        setConsentMode('auto');
        setExecutionTierLimit('high-risk');
        await syncRuntimeControls();
        setOperatorResult('Speed profile: FAST (auto-consent; still bounded by policy + conscience).');
      } else {
        setAutonomyLevel('supervised');
        setConsentMode('ask-first');
        setExecutionTierLimit('high-risk');
        await syncRuntimeControls();
        setOperatorResult('Speed profile: GUARDED (ask-first consent).');
      }
    } catch (e: unknown) {
      setOperatorError(e instanceof Error ? e.message : 'Failed to apply speed profile');
    } finally {
      setOperatorBusy(false);
    }
  };

  const launchMacro = () => {
    if (!operatorPowerOn || emergencyStopActive || cognitive.isActive) {
      setOperatorError('Hands must be ON and idle before launching a macro.');
      return;
    }

    let goal = '';
    if (macroType === 'email') {
      const to = macroTarget.trim() || 'unspecified recipient';
      const subject = macroSubject.trim() || 'Draft subject';
      const body = macroBody.trim() || 'Draft a concise professional email body.';
      goal = [
        'Operator macro: draft an email on my behalf.',
        `Recipient: ${to}`,
        `Subject: ${subject}`,
        `Body intent: ${body}`,
        'Execution instructions:',
        '- Open webmail compose flow (or default mail app if webmail unavailable).',
        '- Fill recipient, subject, and body fields.',
        '- Do not send automatically; stop with a confirmation summary and wait for explicit approval.',
        '- Use consent checks before irreversible actions.',
      ].join('\n');
    } else if (macroType === 'research') {
      const topic = macroTarget.trim() || 'topic not provided';
      const notes = macroDetails.trim() || 'Find reliable sources and produce a short brief.';
      goal = [
        'Operator macro: research and summarize.',
        `Topic: ${topic}`,
        `Focus notes: ${notes}`,
        'Execution instructions:',
        '- Search multiple sources, open and read top relevant pages.',
        '- Capture key facts with source links.',
        '- Return a concise summary in the Hands log.',
      ].join('\n');
    } else {
      const scope = macroTarget.trim() || 'desktop';
      const specifics = macroDetails.trim() || 'Organize visible items into a cleaner structure.';
      goal = [
        'Operator macro: desktop prep and organization.',
        `Scope: ${scope}`,
        `Objective: ${specifics}`,
        'Execution instructions:',
        '- First observe current desktop and active windows.',
        '- Prefer reversible organization steps.',
        '- Ask for consent before risky file operations or deletions.',
        '- Report exactly what changed.',
      ].join('\n');
    }

    startCognitive(goal);
    setOperatorResult(`Macro launched: ${macroType.toUpperCase()}`);
    setOperatorError(null);
    setShowSettings(false);
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

  const renderTelemetrySummary = () => {
    const source = latestRunSummaryTelemetry || latestIterationTelemetry;
    if (!source) return null;
    const p = source.payload;
    const avgActionMs = Number(p.avgActionMs || 0);
    const actionCalls = Number(p.actionCalls || 0);
    const parallelBranches = Number(p.parallelBranches || 0);
    const dagPlans = Number(p.dagPlans || 0);
    const subloopsSpawned = Number(p.subloopsSpawned || 0);
    const maxSubloopDepth = Number(p.maxSubloopDepth || 0);
    const elapsedMs = Number(p.elapsedMs || 0);
    const iterationMs = Number(p.iterationMs || 0);
    const mode =
      String(p.executionMode || '') ||
      (latestIterationTelemetry?.payload
        ? String(latestIterationTelemetry.payload.executionMode || '')
        : '');

    return (
      <div className="hands-telemetry-card">
        <div className="hands-telemetry-header">
          <span>RUN TELEMETRY</span>
          <span>{mode ? `mode: ${mode}` : 'live metrics'}</span>
        </div>
        <div className="hands-telemetry-grid">
          <div className="hands-telemetry-item">
            <span className="hands-telemetry-label">avg action</span>
            <span className="hands-telemetry-value">{avgActionMs}ms</span>
          </div>
          <div className="hands-telemetry-item">
            <span className="hands-telemetry-label">actions</span>
            <span className="hands-telemetry-value">{actionCalls}</span>
          </div>
          <div className="hands-telemetry-item">
            <span className="hands-telemetry-label">parallel branches</span>
            <span className="hands-telemetry-value">{parallelBranches}</span>
          </div>
          <div className="hands-telemetry-item">
            <span className="hands-telemetry-label">dag plans</span>
            <span className="hands-telemetry-value">{dagPlans}</span>
          </div>
          <div className="hands-telemetry-item">
            <span className="hands-telemetry-label">subloops</span>
            <span className="hands-telemetry-value">{subloopsSpawned}</span>
          </div>
          <div className="hands-telemetry-item">
            <span className="hands-telemetry-label">max depth</span>
            <span className="hands-telemetry-value">{maxSubloopDepth}</span>
          </div>
        </div>
        <div className="hands-telemetry-footer">
          {elapsedMs > 0 ? `elapsed ${(elapsedMs / 1000).toFixed(1)}s` : ''}
          {iterationMs > 0 ? `${elapsedMs > 0 ? ' • ' : ''}last iteration ${iterationMs}ms` : ''}
        </div>
      </div>
    );
  };

  const renderStep = (step: CognitiveStep, index: number) => {
    const color = STEP_COLORS[step.type] || 'var(--text-secondary)';
    const icon = STEP_ICONS[step.type] || '•';
    const label = STEP_LABELS[step.type] || step.type.toUpperCase();
    const isTelemetry = step.actionType === 'telemetry';
    let telemetryEntries: Array<[string, unknown]> = [];
    if (isTelemetry && step.actionResult?.output) {
      try {
        const parsed = JSON.parse(String(step.actionResult.output));
        telemetryEntries = Object.entries(parsed).slice(0, 12);
      } catch {
        telemetryEntries = [];
      }
    }

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
          {isTelemetry && (
            <div className="hands-cognitive-action">
              <span className="hands-action-badge">telemetry</span>
              <span className="hands-action-result success">metrics</span>
            </div>
          )}
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
          {isTelemetry && telemetryEntries.length > 0 && (
            <pre className="hands-cognitive-output">
              {telemetryEntries
                .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                .join('\n')
                .slice(0, 700)}
            </pre>
          )}
          {step.actionResult?.output && !isTelemetry && (
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
          <div className={`hands-status ${operatorPowerOn ? 'active' : ''}`} title="Operator power state">
            <div className="hands-status-dot" />
            {operatorPowerOn ? 'ON' : 'OFF'}
          </div>
          <button
            className="mind-ctrl-btn"
            onClick={() => void setOperatorPower(!operatorPowerOn)}
            style={{ color: operatorPowerOn ? 'var(--green)' : 'var(--red)' }}
            disabled={operatorBusy}
            title={operatorPowerOn ? 'Disarm Hands operator controls' : 'Arm Hands operator controls'}
          >
            {operatorPowerOn ? 'TURN OFF' : 'TURN ON'}
          </button>
          {emergencyStopActive && (
            <div className="hands-estop-badge" onClick={() => setShowSettings(true)}>
              ⚠ E-STOP
            </div>
          )}
          {pendingConsents.length > 0 && (
            <div className="hands-consent-badge" onClick={() => setShowSettings(true)}>
              {pendingConsents.length} CONSENT
            </div>
          )}
          <div className={`hands-status ${cognitive.isActive ? 'active' : ''}`}>
            <div className="hands-status-dot" />
            {cognitive.isActive ? cognitive.phase.toUpperCase() : cognitive.phase === 'complete' ? 'DONE' : cognitive.phase === 'failed' ? 'STOPPED' : 'READY'}
          </div>
          <button
            className="hands-settings-toggle"
            onClick={() => setShowSettings(!showSettings)}
            title="Hands settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {cognitive.isActive && (
            <button className="mind-ctrl-btn" onClick={killCognitive} style={{ color: 'var(--red)' }}>KILL</button>
          )}
          {cognitive.steps.length > 0 && !cognitive.isActive && (
            <button className="mind-ctrl-btn" onClick={resetCognitive}>CLEAR</button>
          )}
        </div>
      </div>

      {/* Progress */}
      {getProgressBar()}
      {renderTelemetrySummary()}

      {/* Settings Drawer */}
      {showSettings && <div className="hands-settings-backdrop" onClick={() => setShowSettings(false)} />}
      <div className={`hands-settings-drawer ${showSettings ? 'open' : ''}`}>
        <div className="hands-settings-drawer-header">
          <span>HANDS SETTINGS</span>
          <button className="hands-settings-close" onClick={() => setShowSettings(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="hands-settings-drawer-body">
          {/* Operator Control Center */}
          <div className="hands-telemetry-card" style={{ border: emergencyStopActive ? '1px solid var(--red)' : undefined }}>
            <div className="hands-telemetry-header">
              <span>OPERATOR CONTROL CENTER</span>
              <span>{emergencyStopActive ? 'E-STOP ACTIVE' : 'live'}</span>
            </div>
            <div className="hands-cognitive-action" style={{ marginBottom: 8, paddingLeft: 2 }}>
              <span className="hands-action-badge">control sync</span>
              <span className={`hands-action-result ${runtimeControlSync.lastError ? 'fail' : 'success'}`}>
                {runtimeControlSync.syncing ? 'SYNCING...' : runtimeControlSync.lastError ? 'DESYNCED' : 'SYNCED'}
              </span>
              {runtimeControlSync.lastSyncedAt && !runtimeControlSync.syncing && (
                <span className="hands-cognitive-time" style={{ marginLeft: 0 }}>
                  {new Date(runtimeControlSync.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              <button className="mind-ctrl-btn" onClick={() => void syncRuntimeControls()} disabled={runtimeControlSync.syncing}>
                SYNC NOW
              </button>
            </div>
            {runtimeControlSync.lastError && (
              <pre className="hands-cognitive-error" style={{ marginBottom: 8 }}>{runtimeControlSync.lastError}</pre>
            )}
            <div className="hands-telemetry-grid">
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">autonomy</span>
                <select
                  value={sovereignPolicy.autonomyLevel}
                  onChange={(e) => setAutonomyLevel(e.target.value as AutonomyLevel)}
                >
                  <option value="manual">manual</option>
                  <option value="supervised">supervised</option>
                  <option value="autonomous">autonomous</option>
                  <option value="sovereign">sovereign</option>
                </select>
              </div>
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">consent mode</span>
                <select
                  value={consentMode}
                  onChange={(e) => setConsentMode(e.target.value as typeof consentMode)}
                >
                  <option value="auto">auto</option>
                  <option value="ask-first">ask-first</option>
                  <option value="manual">manual</option>
                </select>
              </div>
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">tier limit</span>
                <select
                  value={executionTierLimit}
                  onChange={(e) => setExecutionTierLimit(e.target.value as typeof executionTierLimit)}
                >
                  <option value="read-only">read-only</option>
                  <option value="reversible">reversible</option>
                  <option value="high-risk">high-risk</option>
                </select>
              </div>
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">rollback queue</span>
                <span className="hands-telemetry-value">{readyRollbacks.length}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                className="mind-ctrl-btn"
                onClick={() => void applySpeedProfile('fast')}
                disabled={operatorBusy || emergencyStopActive}
                title="Reduce consent interruptions (recommended for smooth mouse motion tasks)"
              >
                FAST MODE
              </button>
              <button
                className="mind-ctrl-btn"
                onClick={() => void applySpeedProfile('guarded')}
                disabled={operatorBusy || emergencyStopActive}
                title="Ask before risky actions (recommended for unfamiliar workflows)"
              >
                GUARDED MODE
              </button>
              <button
                className="mind-ctrl-btn"
                style={{ color: operatorPowerOn ? 'var(--red)' : 'var(--green)' }}
                onClick={() => void setOperatorPower(!operatorPowerOn)}
                disabled={operatorBusy}
              >
                {operatorPowerOn ? 'POWER OFF' : 'POWER ON'}
              </button>
              <button className="mind-ctrl-btn" style={{ color: 'var(--red)' }} onClick={triggerEmergencyStop}>
                EMERGENCY STOP
              </button>
              <button className="mind-ctrl-btn" onClick={clearEmergencyStop} disabled={!emergencyStopActive}>
                CLEAR STOP
              </button>
            </div>
          </div>

          {/* Desktop Operator Workbench */}
          <div className="hands-telemetry-card">
            <div className="hands-telemetry-header">
              <span>DESKTOP OPERATOR WORKBENCH</span>
              <span>{desktopIntelLoading ? 'scanning...' : 'ready'}</span>
            </div>
            <div className="hands-telemetry-footer" style={{ marginBottom: 8 }}>
              Active controls only. No passive keylogging or hidden monitoring.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button className="mind-ctrl-btn" onClick={() => void loadDesktopIntel()} disabled={desktopIntelLoading}>
                REFRESH INTEL
              </button>
              <button className="mind-ctrl-btn" onClick={() => void handleCenterMouse()} disabled={operatorBusy || emergencyStopActive}>
                CENTER MOUSE
              </button>
              <button
                className="mind-ctrl-btn"
                onClick={() => void runOperatorAction(() => window.api.agent.minimizeSelf(), 'Window minimized')}
                disabled={operatorBusy || emergencyStopActive}
              >
                MINIMIZE PRIME
              </button>
            </div>
            {desktopIntelError && <pre className="hands-cognitive-error">{desktopIntelError}</pre>}
            {desktopIntel && (
              <>
                <div className="hands-telemetry-grid" style={{ marginBottom: 8 }}>
                  <div className="hands-telemetry-item">
                    <span className="hands-telemetry-label">user</span>
                    <span className="hands-telemetry-value">{desktopIntel.username}</span>
                  </div>
                  <div className="hands-telemetry-item">
                    <span className="hands-telemetry-label">platform</span>
                    <span className="hands-telemetry-value">{desktopIntel.platform}</span>
                  </div>
                  <div className="hands-telemetry-item">
                    <span className="hands-telemetry-label">display</span>
                    <span className="hands-telemetry-value">{desktopIntel.dimensions}</span>
                  </div>
                  <div className="hands-telemetry-item">
                    <span className="hands-telemetry-label">mouse</span>
                    <span className="hands-telemetry-value">{desktopIntel.mousePosition}</span>
                  </div>
                  <div className="hands-telemetry-item">
                    <span className="hands-telemetry-label">memory</span>
                    <span className="hands-telemetry-value">{desktopIntel.freeMemoryGb} / {desktopIntel.totalMemoryGb} GB free</span>
                  </div>
                  <div className="hands-telemetry-item">
                    <span className="hands-telemetry-label">controls</span>
                    <span className="hands-telemetry-value">{desktopIntel.controlsSummary}</span>
                  </div>
                </div>
                <div className="hands-cognitive-text" style={{ marginBottom: 6 }}>
                  foreground: {desktopIntel.foregroundWindow || 'unknown'}
                </div>
                <div className="hands-cognitive-text" style={{ marginBottom: 6 }}>
                  home: {desktopIntel.homeDir}
                </div>
                {desktopIntel.processPreview.length > 0 && (
                  <pre className="hands-cognitive-output">{desktopIntel.processPreview.join('\n').slice(0, 520)}</pre>
                )}
              </>
            )}

            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <div className="hands-cognitive-step act" style={{ borderLeftColor: 'var(--cyan)' }}>
                <div className="hands-cognitive-header">
                  <span className="hands-cognitive-label" style={{ color: 'var(--cyan)' }}>MOUSE CONTROL</span>
                </div>
                <div className="hands-cognitive-content">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      value={mouseX}
                      onChange={(e) => setMouseX(e.target.value)}
                      placeholder="x"
                      style={{ width: 100 }}
                    />
                    <input
                      value={mouseY}
                      onChange={(e) => setMouseY(e.target.value)}
                      placeholder="y"
                      style={{ width: 100 }}
                    />
                    <button
                      className="mind-ctrl-btn"
                      onClick={() => void runOperatorAction(
                        () => window.api.agent.mouseMove(Number(mouseX || 0), Number(mouseY || 0)),
                        `Moved mouse to ${mouseX},${mouseY}`,
                      )}
                      disabled={operatorBusy || emergencyStopActive}
                    >
                      MOVE
                    </button>
                    <button
                      className="mind-ctrl-btn"
                      onClick={() => void runOperatorAction(
                        () => window.api.agent.mouseClick(Number(mouseX || 0), Number(mouseY || 0), 'left', false),
                        `Clicked at ${mouseX},${mouseY}`,
                      )}
                      disabled={operatorBusy || emergencyStopActive}
                    >
                      CLICK
                    </button>
                  </div>
                </div>
              </div>

              <div className="hands-cognitive-step act" style={{ borderLeftColor: 'var(--green)' }}>
                <div className="hands-cognitive-header">
                  <span className="hands-cognitive-label" style={{ color: 'var(--green)' }}>KEYBOARD CONTROL</span>
                </div>
                <div className="hands-cognitive-content">
                  <textarea
                    value={typeText}
                    onChange={(e) => setTypeText(e.target.value)}
                    placeholder="Text to type in the currently focused app..."
                    rows={2}
                    style={{ width: '100%', marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      className="mind-ctrl-btn"
                      onClick={() => void runOperatorAction(
                        () => window.api.agent.keyboardType(typeText),
                        `Typed ${typeText.length} chars`,
                      )}
                      disabled={operatorBusy || emergencyStopActive || !typeText.trim()}
                    >
                      TYPE
                    </button>
                    <input
                      value={shortcutModifiers}
                      onChange={(e) => setShortcutModifiers(e.target.value)}
                      placeholder="ctrl+shift"
                      style={{ width: 140 }}
                    />
                    <input
                      value={shortcutKey}
                      onChange={(e) => setShortcutKey(e.target.value)}
                      placeholder="key"
                      style={{ width: 80 }}
                    />
                    <button
                      className="mind-ctrl-btn"
                      onClick={() => {
                        const mods = shortcutModifiers
                          .split('+')
                          .map((m) => m.trim())
                          .filter(Boolean);
                        void runOperatorAction(
                          () => window.api.agent.keyboardShortcut(mods, shortcutKey.trim()),
                          `Shortcut ${mods.join('+')}+${shortcutKey}`,
                        );
                      }}
                      disabled={operatorBusy || emergencyStopActive || !shortcutKey.trim()}
                    >
                      SHORTCUT
                    </button>
                  </div>
                </div>
              </div>

              <div className="hands-cognitive-step act" style={{ borderLeftColor: 'var(--gold)' }}>
                <div className="hands-cognitive-header">
                  <span className="hands-cognitive-label" style={{ color: 'var(--gold)' }}>ACT ON BEHALF (CONSENSUAL)</span>
                </div>
                <div className="hands-cognitive-content">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      value={urlToOpen}
                      onChange={(e) => setUrlToOpen(e.target.value)}
                      placeholder="https://..."
                      style={{ minWidth: 320, flex: 1 }}
                    />
                    <button
                      className="mind-ctrl-btn"
                      onClick={() => void runOperatorAction(() => window.api.agent.openUrl(urlToOpen), `Opened ${urlToOpen}`)}
                      disabled={operatorBusy || emergencyStopActive || !urlToOpen.trim()}
                    >
                      OPEN URL
                    </button>
                  </div>
                  <div className="hands-cognitive-text" style={{ marginTop: 8 }}>
                    Tip: open Gmail compose URL to draft emails quickly, then use TYPE/SHORTCUT actions.
                  </div>
                </div>
              </div>

              <div className="hands-cognitive-step think" style={{ borderLeftColor: '#a855f7' }}>
                <div className="hands-cognitive-header">
                  <span className="hands-cognitive-label" style={{ color: '#a855f7' }}>DO THIS FOR ME — MACRO RUNNER</span>
                </div>
                <div className="hands-cognitive-content">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <select value={macroType} onChange={(e) => setMacroType(e.target.value as typeof macroType)}>
                      <option value="email">email draft</option>
                      <option value="research">research brief</option>
                      <option value="desktop-prep">desktop prep</option>
                    </select>
                    <input
                      value={macroTarget}
                      onChange={(e) => setMacroTarget(e.target.value)}
                      placeholder={macroType === 'email' ? 'recipient email/name' : macroType === 'research' ? 'research topic' : 'desktop scope'}
                      style={{ minWidth: 260, flex: 1 }}
                    />
                  </div>
                  {macroType === 'email' && (
                    <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                      <input
                        value={macroSubject}
                        onChange={(e) => setMacroSubject(e.target.value)}
                        placeholder="subject"
                      />
                      <textarea
                        value={macroBody}
                        onChange={(e) => setMacroBody(e.target.value)}
                        placeholder="body intent / key points"
                        rows={2}
                      />
                    </div>
                  )}
                  {macroType !== 'email' && (
                    <textarea
                      value={macroDetails}
                      onChange={(e) => setMacroDetails(e.target.value)}
                      placeholder="extra details / constraints"
                      rows={2}
                      style={{ width: '100%', marginBottom: 8 }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="mind-ctrl-btn"
                      onClick={launchMacro}
                      disabled={!operatorPowerOn || emergencyStopActive || cognitive.isActive}
                    >
                      RUN MACRO
                    </button>
                    <span className="hands-cognitive-time">
                      {cognitive.isActive ? 'Hands busy' : operatorPowerOn ? 'Ready' : 'Power OFF'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {operatorResult && <pre className="hands-cognitive-output" style={{ marginTop: 8 }}>{operatorResult}</pre>}
            {operatorError && <pre className="hands-cognitive-error" style={{ marginTop: 8 }}>{operatorError}</pre>}
          </div>

          {/* Operator Synthesis Engine */}
          <div className="hands-telemetry-card" style={{ border: synthesisSession.active ? '1px solid #ff006e' : undefined }}>
            <div className="hands-telemetry-header">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {synthesisSession.active && !synthesisSession.paused && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff006e', animation: 'pulse 1.2s infinite' }} />
                )}
                OPERATOR SYNTHESIS
              </span>
              <span>
                {synthesisSession.active
                  ? synthesisSession.paused ? 'PAUSED' : 'RECORDING'
                  : 'idle'}
              </span>
            </div>
            <div className="hands-telemetry-footer" style={{ marginBottom: 8 }}>
              Learns your rhythm, app patterns, and preferences through active screen observation.
              No keylogging. Uses screen snapshots + foreground window tracking.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={!!settings.resumeSynthesisOnStartup}
                onChange={(e) => void updateSettings({ resumeSynthesisOnStartup: e.target.checked })}
              />
              <span>Resume synthesis when I open the app (set-and-forget)</span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {!synthesisSession.active ? (
                <button
                  className="mind-ctrl-btn"
                  style={{ color: '#ff006e' }}
                  onClick={() => synthesisStart(15000)}
                  disabled={emergencyStopActive}
                >
                  START SYNTHESIS
                </button>
              ) : (
                <>
                  {synthesisSession.paused ? (
                    <button className="mind-ctrl-btn" onClick={synthesisResume}>
                      RESUME
                    </button>
                  ) : (
                    <button className="mind-ctrl-btn" onClick={synthesisPause}>
                      PAUSE
                    </button>
                  )}
                  <button className="mind-ctrl-btn" style={{ color: 'var(--red)' }} onClick={synthesisStop}>
                    STOP
                  </button>
                </>
              )}
              <button
                className="mind-ctrl-btn"
                onClick={() => void synthesisRunSnapshot()}
                disabled={!synthesisSession.active || synthesisSession.paused}
                title="Take an immediate observation snapshot"
              >
                SNAP NOW
              </button>
              <button
                className="mind-ctrl-btn"
                onClick={() => void synthesisDigest()}
                disabled={operatorProfile.observations.length < 5}
                title="Generate a digest of learned patterns and store to memory"
              >
                DIGEST
              </button>
            </div>

            {synthesisSession.error && (
              <pre className="hands-cognitive-error" style={{ marginBottom: 8 }}>{synthesisSession.error}</pre>
            )}

            <div className="hands-telemetry-grid" style={{ marginBottom: 8 }}>
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">observations</span>
                <span className="hands-telemetry-value">{operatorProfile.totalObservations}</span>
              </div>
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">sessions</span>
                <span className="hands-telemetry-value">{operatorProfile.totalSessions}</span>
              </div>
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">this session</span>
                <span className="hands-telemetry-value">{synthesisSession.observationCount}</span>
              </div>
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">interval</span>
                <span className="hands-telemetry-value">{(synthesisSession.intervalMs / 1000).toFixed(0)}s</span>
              </div>
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">peak hours</span>
                <span className="hands-telemetry-value">
                  {operatorProfile.rhythm.peakHours.length > 0
                    ? operatorProfile.rhythm.peakHours.slice(-6).join(', ')
                    : 'n/a'}
                </span>
              </div>
              <div className="hands-telemetry-item">
                <span className="hands-telemetry-label">known apps</span>
                <span className="hands-telemetry-value">
                  {operatorProfile.rhythm.preferredApps.length > 0
                    ? operatorProfile.rhythm.preferredApps.slice(-4).join(', ').slice(0, 60)
                    : 'n/a'}
                </span>
              </div>
            </div>

            {/* Preference editor */}
            <div className="hands-cognitive-step observe" style={{ borderLeftColor: '#ff006e' }}>
              <div className="hands-cognitive-header">
                <span className="hands-cognitive-label" style={{ color: '#ff006e' }}>TEACH ME YOUR PREFERENCES</span>
              </div>
              <div className="hands-cognitive-content">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                  <input
                    value={prefKey}
                    onChange={(e) => setPrefKey(e.target.value)}
                    placeholder="preference (e.g. 'email_app')"
                    style={{ minWidth: 180 }}
                  />
                  <input
                    value={prefValue}
                    onChange={(e) => setPrefValue(e.target.value)}
                    placeholder="value (e.g. 'Gmail web')"
                    style={{ minWidth: 220, flex: 1 }}
                  />
                  <button
                    className="mind-ctrl-btn"
                    onClick={() => {
                      if (prefKey.trim() && prefValue.trim()) {
                        synthesisAddPreference(prefKey.trim(), prefValue.trim());
                        synthesisAddObservation({
                          type: 'preference',
                          summary: `Operator set preference: ${prefKey.trim()} = ${prefValue.trim()}`,
                        });
                        setPrefKey('');
                        setPrefValue('');
                      }
                    }}
                    disabled={!prefKey.trim() || !prefValue.trim()}
                  >
                    TEACH
                  </button>
                </div>
                {Object.keys(operatorProfile.preferences).length > 0 && (
                  <div className="hands-cognitive-text">
                    {Object.entries(operatorProfile.preferences).map(([k, v]) => (
                      <span key={k} className="hands-action-badge" style={{ marginRight: 6, marginBottom: 4, display: 'inline-block' }}>
                        {k}: {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent observations feed */}
            {operatorProfile.observations.length > 0 && (
              <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                <div className="hands-cognitive-text" style={{ marginBottom: 4, fontSize: 10, color: 'var(--text-ghost)' }}>
                  LIVE OBSERVATION FEED (last {Math.min(operatorProfile.observations.length, 12)})
                </div>
                {operatorProfile.observations.slice(-12).reverse().map((obs) => (
                  <div key={obs.id} style={{ fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: obs.type === 'app_switch' ? '#ff006e' : obs.type === 'preference' ? 'var(--gold)' : 'var(--text-secondary)', marginRight: 6 }}>
                      {obs.type === 'app_switch' ? '↔' : obs.type === 'preference' ? '★' : '◉'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {new Date(obs.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span style={{ marginLeft: 8 }}>{obs.summary.slice(0, 120)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Synthesis notes */}
            {operatorProfile.synthesisNotes.length > 0 && (
              <pre className="hands-cognitive-output" style={{ marginTop: 8 }}>
                {operatorProfile.synthesisNotes.slice(-3).join('\n\n').slice(0, 800)}
              </pre>
            )}
          </div>

          {/* Consent Queue */}
          {pendingConsents.length > 0 && (
            <div className="hands-telemetry-card">
              <div className="hands-telemetry-header">
                <span>CONSENT QUEUE</span>
                <span>{pendingConsents.length} pending</span>
              </div>
              <div className="hands-telemetry-footer" style={{ marginBottom: 8 }}>
                <span>Mode:</span>
                <select
                  value={consentMode}
                  onChange={(e) => setConsentMode(e.target.value as typeof consentMode)}
                  style={{ marginLeft: 8 }}
                >
                  <option value="auto">auto</option>
                  <option value="ask-first">ask-first</option>
                  <option value="manual">manual</option>
                </select>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {pendingConsents.map((request) => (
                  <div key={request.id} className="hands-cognitive-step act" style={{ borderLeftColor: 'var(--gold)' }}>
                    <div className="hands-cognitive-header">
                      <span className="hands-cognitive-label" style={{ color: 'var(--gold)' }}>CONSENT</span>
                      <span className="hands-cognitive-time">
                        {new Date(request.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="hands-cognitive-content">
                      <div className="hands-cognitive-action">
                        <span className="hands-action-badge">{request.action}</span>
                        <span className="hands-action-result fail">{request.tier}</span>
                      </div>
                      <div className="hands-cognitive-text">{request.reason}</div>
                      <pre className="hands-cognitive-output">
                        {JSON.stringify(request.params || {}, null, 2).slice(0, 500)}
                      </pre>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="mind-ctrl-btn" onClick={() => resolveConsentAction(request.id, 'approved')}>APPROVE</button>
                        <button className="mind-ctrl-btn" style={{ color: 'var(--red)' }} onClick={() => resolveConsentAction(request.id, 'denied')}>DENY</button>
                        <button className="mind-ctrl-btn" style={{ color: 'var(--orange)' }} onClick={() => resolveConsentAction(request.id, 'overridden')}>OVERRIDE</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rollback Registry */}
          {rollbackEntries.length > 0 && (
            <div className="hands-telemetry-card">
              <div className="hands-telemetry-header">
                <span>ROLLBACK REGISTRY</span>
                <span>{readyRollbacks.length} ready</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {rollbackEntries.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="hands-cognitive-step reflect" style={{ borderLeftColor: 'var(--cyan)' }}>
                    <div className="hands-cognitive-header">
                      <span className="hands-cognitive-label" style={{ color: 'var(--cyan)' }}>
                        {entry.action}
                      </span>
                      <span className={`hands-action-result ${entry.status === 'ready' ? 'success' : 'fail'}`}>
                        {entry.status}
                      </span>
                    </div>
                    <div className="hands-cognitive-content">
                      <div className="hands-cognitive-text">
                        targets: {(entry.affectedTargets || []).join(' , ').slice(0, 220)}
                      </div>
                      {entry.lastError && (
                        <pre className="hands-cognitive-error">{String(entry.lastError).slice(0, 300)}</pre>
                      )}
                      {entry.status === 'ready' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="mind-ctrl-btn" onClick={() => executeRollback(entry.id)}>
                            EXECUTE ROLLBACK
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deterministic Replay */}
          <div className="hands-telemetry-card">
            <div className="hands-telemetry-header">
              <span>DETERMINISTIC REPLAY</span>
              <span>{replay.status}</span>
            </div>
            <div className="hands-telemetry-footer" style={{ marginBottom: 8 }}>
              <select
                value={replay.selectedRunId || ''}
                onChange={(e) => {
                  const runId = e.target.value;
                  if (runId) void replayLoadRun(runId);
                }}
                style={{ minWidth: 220 }}
              >
                <option value="">Select ledger run...</option>
                {replay.availableRuns.map((run) => (
                  <option key={run.runId} value={run.runId}>
                    {run.kind} • {new Date(run.startedAt).toLocaleString()} • {run.entryCount} entries
                  </option>
                ))}
              </select>
              <button className="mind-ctrl-btn" onClick={() => void replayLoadRuns()} style={{ marginLeft: 8 }}>
                REFRESH
              </button>
            </div>
            {replay.selectedRunId && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <button className="mind-ctrl-btn" onClick={replayTogglePlayPause} disabled={replay.steps.length === 0}>
                    {replay.isPlaying ? 'PAUSE' : 'PLAY'}
                  </button>
                  <button className="mind-ctrl-btn" onClick={replayNext} disabled={replay.steps.length === 0}>
                    NEXT
                  </button>
                  <button className="mind-ctrl-btn" onClick={replayStop} disabled={replay.steps.length === 0}>
                    STOP
                  </button>
                  <span className="hands-cognitive-time">
                    step {Math.min(replay.cursor + 1, Math.max(1, replay.steps.length))} / {replay.steps.length}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, replay.steps.length - 1)}
                  value={Math.min(replay.cursor, Math.max(0, replay.steps.length - 1))}
                  onChange={(e) => replaySeek(Number(e.target.value))}
                  style={{ width: '100%' }}
                  disabled={replay.steps.length === 0}
                />
                {replayCurrentStep && (
                  <div className="hands-cognitive-step observe" style={{ borderLeftColor: 'var(--cyan)', marginTop: 8 }}>
                    <div className="hands-cognitive-header">
                      <span className="hands-cognitive-label" style={{ color: 'var(--cyan)' }}>{replayCurrentStep.type.toUpperCase()}</span>
                      <span className="hands-cognitive-time">
                        {new Date(replayCurrentStep.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="hands-cognitive-content">
                      <div className="hands-cognitive-text">{replayCurrentStep.content}</div>
                      {replayCurrentStep.actionType && (
                        <div className="hands-cognitive-action" style={{ marginTop: 6 }}>
                          <span className="hands-action-badge">{replayCurrentStep.actionType}</span>
                          {replayCurrentStep.actionResult && (
                            <span className={`hands-action-result ${replayCurrentStep.actionResult.success ? 'success' : 'fail'}`}>
                              {replayCurrentStep.actionResult.success ? '✓ OK' : '✗ FAIL'}
                            </span>
                          )}
                        </div>
                      )}
                      {replayCurrentStep.actionResult?.output && (
                        <pre className="hands-cognitive-output">{String(replayCurrentStep.actionResult.output).slice(0, 260)}</pre>
                      )}
                      {replayCurrentStep.actionResult?.error && !replayCurrentStep.actionResult.success && (
                        <pre className="hands-cognitive-error">{String(replayCurrentStep.actionResult.error).slice(0, 220)}</pre>
                      )}
                    </div>
                  </div>
                )}
                {replay.error && <pre className="hands-cognitive-error" style={{ marginTop: 8 }}>{replay.error}</pre>}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cognitive Steps */}
      <div className="hands-log" ref={handsLogRef}>
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
            disabled={emergencyStopActive}
          />
          <button
            className="send-btn hands-send"
            onClick={handleSubmit}
            disabled={!input.trim() || cognitive.isActive || emergencyStopActive}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 5l7 7-7 7" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
        <div className="input-hint">
          <span>
            {emergencyStopActive
              ? 'Emergency stop active — clear stop to launch goals'
              : 'ReAct cognitive loop — reasons, acts, reflects, adapts'}
          </span>
          <span>{settings.provider.toUpperCase()} / {settings.model}</span>
        </div>
      </div>
    </div>
  );
}
