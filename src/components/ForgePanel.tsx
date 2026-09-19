import { memo, useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { Button, Card } from './ui';

function msToDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}m ${rem}s`;
}

function pct(value: number | undefined | null): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.0%';
  return `${(n * 100).toFixed(1)}%`;
}

export default memo(function ForgePanel() {
  const {
    phase,
    startedAt,
    finishedAt,
    config,
    strictEvalMode,
    verifierFirst,
    bestCandidate,
    baselineSuiteLength,
    currentGeneration,
    generationsLength,
    verifierChecksLength,
    verifierPassCount,
    logs,
    stopReason,
    gauntletPassRate,
    gauntletLastResultCount,
    hasGauntletHistory,
  } = useStore(
    useShallow((s) => {
      const forge = s.forge;
      const gauntlet = s.gauntlet;
      const checks = forge?.verifierChecks ?? [];
      const history = gauntlet?.history ?? [];
      const lastResults = history[0]?.results;
      return {
        phase: forge?.phase ?? 'idle',
        startedAt: forge?.startedAt ?? null,
        finishedAt: forge?.finishedAt ?? null,
        config: forge?.config,
        strictEvalMode: !!forge?.strictEvalMode,
        verifierFirst: !!forge?.verifierFirst,
        bestCandidate: forge?.bestCandidate ?? null,
        baselineSuiteLength: forge?.baselineSuite?.length ?? 0,
        currentGeneration: forge?.currentGeneration ?? 0,
        generationsLength: forge?.generations?.length ?? 0,
        verifierChecksLength: checks.length,
        verifierPassCount: checks.reduce((n, c) => n + (c.passed ? 1 : 0), 0),
        logs: forge?.logs ?? [],
        stopReason: forge?.stopReason ?? null,
        gauntletPassRate: gauntlet?.passRate ?? 0,
        gauntletLastResultCount: Array.isArray(lastResults) ? lastResults.length : 0,
        hasGauntletHistory: history.length > 0,
      };
    }),
  );
  const setActiveModule = useStore((s) => s.setActiveModule);
  const startForge = useStore((s) => s.startForge);
  const cancelForge = useStore((s) => s.cancelForge);
  const resetForge = useStore((s) => s.resetForge);
  const setStrictEval = useStore((s) => s.setForgeStrictEvalMode);
  const setVerifierFirst = useStore((s) => s.setForgeVerifierFirst);

  const [maxGenerations, setMaxGenerations] = useState<number>(config?.maxGenerations ?? 8);
  const [candidatesPerGeneration, setCandidatesPerGeneration] = useState<number>(config?.candidatesPerGeneration ?? 5);
  const [mutationRate, setMutationRate] = useState<number>(config?.mutationRate ?? 0.24);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState<number>(
    Math.round((config?.maxDurationMs ?? 300000) / 1000),
  );

  const running = phase === 'running';
  const elapsed = useMemo(() => {
    if (!startedAt) return '0m 0s';
    const end = finishedAt ?? Date.now();
    return msToDuration(end - startedAt);
  }, [startedAt, finishedAt]);

  const visibleLogs = logs.length > 80 ? logs.slice(-80) : logs;
  const verifierPass = verifierChecksLength > 0 ? pct(verifierPassCount / verifierChecksLength) : 'n/a';

  const handleRun = useCallback(() => {
    if (running) return;
    // Defer so the click frame paints; never run the pipeline synchronously
    // inside the sidebar/module click handler.
    window.setTimeout(() => {
      void startForge({
        maxGenerations: Math.max(1, Math.floor(maxGenerations)),
        candidatesPerGeneration: Math.max(2, Math.floor(candidatesPerGeneration)),
        mutationRate: Math.min(0.75, Math.max(0.05, mutationRate)),
        maxDurationMs: Math.max(3000, Math.floor(maxDurationSeconds * 1000)),
      });
    }, 0);
  }, [running, startForge, maxGenerations, candidatesPerGeneration, mutationRate, maxDurationSeconds]);

  return (
    <div className="forge-panel">
      <div className="forge-header">
        <div>
          <h2>FORGE MODULE</h2>
          <p>Bounded autonomy pipeline with evaluation and mutation sandbox</p>
        </div>
        <div className={`forge-status ${phase}`}>{String(phase).toUpperCase()}</div>
      </div>

      <div className="forge-grid">
        <Card title="Run Configuration" glow="cyan" className="forge-card">
          <p className="forge-stop">
            Latest gauntlet pass rate: {pct(gauntletPassRate)}
            {hasGauntletHistory
              ? ` across ${gauntletLastResultCount} capabilities.`
              : ' (run GAUNTLET first for adaptive benchmarks).'}
          </p>
          <label>
            Generations
            <input
              type="number"
              min={1}
              max={50}
              value={maxGenerations}
              onChange={(e) => setMaxGenerations(Number(e.target.value || 1))}
              disabled={running}
            />
          </label>
          <label>
            Candidates / generation
            <input
              type="number"
              min={2}
              max={20}
              value={candidatesPerGeneration}
              onChange={(e) => setCandidatesPerGeneration(Number(e.target.value || 2))}
              disabled={running}
            />
          </label>
          <label>
            Mutation rate
            <input
              type="number"
              min={0.05}
              max={0.75}
              step={0.01}
              value={mutationRate}
              onChange={(e) => setMutationRate(Number(e.target.value || 0.05))}
              disabled={running}
            />
          </label>
          <label>
            Max runtime (seconds)
            <input
              type="number"
              min={3}
              max={300}
              value={maxDurationSeconds}
              onChange={(e) => setMaxDurationSeconds(Number(e.target.value || 3))}
              disabled={running}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={strictEvalMode}
              onChange={(e) => setStrictEval(e.target.checked)}
              disabled={running}
            />
            Strict Eval Mode
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={verifierFirst}
              onChange={(e) => setVerifierFirst(e.target.checked)}
              disabled={running}
            />
            Verifier-First Runtime
          </label>
          <div className="forge-actions">
            <Button variant="primary" onClick={handleRun} disabled={running}>
              Run Pipeline
            </Button>
            <Button variant="danger" onClick={cancelForge} disabled={!running}>
              Cancel
            </Button>
            <Button onClick={resetForge} disabled={running}>
              Reset
            </Button>
            <Button onClick={() => setActiveModule('gauntlet')} disabled={running}>
              Open Gauntlet
            </Button>
          </div>
        </Card>

        <Card title="Best Candidate" glow="green" className="forge-card">
          {bestCandidate ? (
            <div className="forge-metrics">
              <div>
                <span>Candidate</span>
                <strong>{bestCandidate.id}</strong>
              </div>
              <div>
                <span>Score</span>
                <strong>{pct(bestCandidate.score)}</strong>
              </div>
              <div>
                <span>Pass rate</span>
                <strong>{pct(bestCandidate.passRate)}</strong>
              </div>
              <div>
                <span>Benchmark score</span>
                <strong>{pct(bestCandidate.benchmarkScore)}</strong>
              </div>
              <div>
                <span>Temperature</span>
                <strong>{Number(bestCandidate.temperature || 0).toFixed(2)}</strong>
              </div>
              <div>
                <span>Tool budget</span>
                <strong>{bestCandidate.toolBudget}</strong>
              </div>
            </div>
          ) : (
            <p className="forge-empty">Run the pipeline to produce a baseline candidate.</p>
          )}
        </Card>

        <Card title="Run Telemetry" className="forge-card">
          <div className="forge-metrics">
            <div>
              <span>Suite tests</span>
              <strong>{baselineSuiteLength}</strong>
            </div>
            <div>
              <span>Generation</span>
              <strong>{currentGeneration}</strong>
            </div>
            <div>
              <span>History entries</span>
              <strong>{generationsLength}</strong>
            </div>
            <div>
              <span>Elapsed</span>
              <strong>{elapsed}</strong>
            </div>
            <div>
              <span>Verifier checks</span>
              <strong>{verifierChecksLength}</strong>
            </div>
            <div>
              <span>Verifier pass</span>
              <strong>{verifierPass}</strong>
            </div>
          </div>
          <p className="forge-stop">{stopReason ?? 'Bounded loop active. No stop event yet.'}</p>
        </Card>

        <Card title="Pipeline Log" className="forge-card forge-log-card">
          <div className="forge-log">
            {visibleLogs.map((entry, index) => (
              <div key={`${index}-${entry}`} className="forge-log-line">
                {entry}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
});
