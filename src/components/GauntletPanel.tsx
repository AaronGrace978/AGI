import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { GauntletProvenance } from '../types';

function msToDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}m ${rem}s`;
}

function polylinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `0,${height / 2} ${width},${height / 2}`;
  return values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - value * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export default function GauntletPanel() {
  const gauntlet = useStore((s) => s.gauntlet);
  const startGauntlet = useStore((s) => s.startGauntlet);
  const cancelGauntlet = useStore((s) => s.cancelGauntlet);
  const resetGauntlet = useStore((s) => s.resetGauntlet);
  const setGauntletAutoCycleEnabled = useStore((s) => s.setGauntletAutoCycleEnabled);
  const startGauntletAutoCycle = useStore((s) => s.startGauntletAutoCycle);
  const cancelGauntletAutoCycle = useStore((s) => s.cancelGauntletAutoCycle);

  const running = gauntlet.phase === 'running';
  const elapsed = useMemo(() => {
    if (!gauntlet.startedAt) return '0m 0s';
    const end = gauntlet.finishedAt ?? Date.now();
    return msToDuration(end - gauntlet.startedAt);
  }, [gauntlet.phase, gauntlet.startedAt, gauntlet.finishedAt, gauntlet.currentIndex]);

  const capNameById = useMemo(
    () => new Map(gauntlet.baselineCapabilities.map((cap) => [cap.id, cap.name])),
    [gauntlet.baselineCapabilities],
  );

  const latestHistory = gauntlet.history.slice(0, 5);
  const autoCycleRunning = gauntlet.autoCycleRunning;
  const trendRuns = useMemo(
    () => gauntlet.history.filter((run) => run.phase === 'completed').slice(0, 12).reverse(),
    [gauntlet.history],
  );
  const scorePoints = useMemo(
    () => polylinePoints(trendRuns.map((run) => run.overallScore), 280, 84),
    [trendRuns],
  );
  const passPoints = useMemo(
    () => polylinePoints(trendRuns.map((run) => run.passRate), 280, 84),
    [trendRuns],
  );
  const [provenanceFilter, setProvenanceFilter] = useState<GauntletProvenance | 'all'>('all');
  const filteredResults = gauntlet.results.filter((result) =>
    provenanceFilter === 'all' ? true : (result.provenance || 'synthetic') === provenanceFilter,
  );

  return (
    <div className="forge-panel">
      <div className="forge-header">
        <div>
          <h2>⚔ GAUNTLET MODULE</h2>
          <p>Capability benchmark harness for planning, reasoning, robustness, and self-correction</p>
        </div>
        <div className={`forge-status ${gauntlet.phase}`}>
          {gauntlet.phase.toUpperCase()}
        </div>
      </div>

      <div className="forge-grid">
        <section className="forge-card">
          <h3>Run Control</h3>
          <div className="forge-metrics">
            <div><span>Capabilities</span><strong>{gauntlet.baselineCapabilities.length}</strong></div>
            <div><span>Progress</span><strong>{gauntlet.currentIndex}/{gauntlet.baselineCapabilities.length}</strong></div>
            <div><span>Overall score</span><strong>{(gauntlet.overallScore * 100).toFixed(1)}%</strong></div>
            <div><span>Pass rate</span><strong>{(gauntlet.passRate * 100).toFixed(1)}%</strong></div>
            <div><span>Elapsed</span><strong>{elapsed}</strong></div>
            <div><span>History runs</span><strong>{gauntlet.history.length}</strong></div>
            <div><span>Auto cycle</span><strong>{gauntlet.autoCycleStage.toUpperCase()}</strong></div>
            <div><span>Curriculum level</span><strong>{gauntlet.curriculum.level}</strong></div>
            <div><span>Solved at level</span><strong>{gauntlet.curriculum.solvedAtCurrentLevel}/{gauntlet.curriculum.targetPerLevel}</strong></div>
          </div>
          <p className="forge-stop">{gauntlet.stopReason ?? 'Gauntlet standing by.'}</p>
          <label>
            <input
              type="checkbox"
              checked={gauntlet.autoCycleEnabled}
              onChange={(e) => setGauntletAutoCycleEnabled(e.target.checked)}
              disabled={autoCycleRunning}
            />
            Enable Auto Cycle mode (Gauntlet → Forge → Gauntlet)
          </label>
          <div className="forge-actions">
            <button onClick={() => startGauntlet()} disabled={running || autoCycleRunning}>Run Gauntlet</button>
            <button onClick={cancelGauntlet} disabled={!running || autoCycleRunning}>Cancel</button>
            <button onClick={startGauntletAutoCycle} disabled={!gauntlet.autoCycleEnabled || autoCycleRunning || running}>Run Auto Cycle</button>
            <button onClick={cancelGauntletAutoCycle} disabled={!autoCycleRunning}>Cancel Auto Cycle</button>
            <button onClick={resetGauntlet} disabled={running || autoCycleRunning}>Reset</button>
          </div>
        </section>

        <section className="forge-card">
          <h3>Capability Results</h3>
          <div className="forge-actions" style={{ marginBottom: 8 }}>
            <button onClick={() => setProvenanceFilter('all')} disabled={provenanceFilter === 'all'}>All</button>
            <button onClick={() => setProvenanceFilter('real-workflow')} disabled={provenanceFilter === 'real-workflow'}>Real Workflow</button>
            <button onClick={() => setProvenanceFilter('synthetic')} disabled={provenanceFilter === 'synthetic'}>Synthetic</button>
          </div>
          {filteredResults.length === 0 ? (
            <p className="forge-empty">Run the gauntlet to score capabilities against your baseline suite.</p>
          ) : (
            <div className="forge-log">
              {filteredResults.map((result) => (
                <div key={`${result.capabilityId}-${result.latencyMs}`} className="forge-log-line">
                  <strong>{capNameById.get(result.capabilityId) ?? result.capabilityId}</strong>
                  {' — '}
                  {(result.score * 100).toFixed(1)}% {result.passed ? 'PASS' : 'FAIL'}
                  {' — '}
                  [{result.provenance || 'synthetic'}]
                  {' — '}
                  {result.summary}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="forge-card">
          <h3>Provenance Rollups</h3>
          <div className="forge-metrics">
            <div><span>Real workflow score</span><strong>{(gauntlet.provenanceRollups['real-workflow'].overallScore * 100).toFixed(1)}%</strong></div>
            <div><span>Real workflow pass</span><strong>{(gauntlet.provenanceRollups['real-workflow'].passRate * 100).toFixed(1)}%</strong></div>
            <div><span>Real workflow count</span><strong>{gauntlet.provenanceRollups['real-workflow'].count}</strong></div>
            <div><span>Synthetic score</span><strong>{(gauntlet.provenanceRollups.synthetic.overallScore * 100).toFixed(1)}%</strong></div>
            <div><span>Synthetic pass</span><strong>{(gauntlet.provenanceRollups.synthetic.passRate * 100).toFixed(1)}%</strong></div>
            <div><span>Synthetic count</span><strong>{gauntlet.provenanceRollups.synthetic.count}</strong></div>
          </div>
        </section>

        <section className="forge-card">
          <h3>Baseline Suite</h3>
          <div className="forge-log">
            {gauntlet.baselineCapabilities.map((cap) => (
              <div key={cap.id} className="forge-log-line">
                <strong>{cap.name}</strong> ({cap.category}, w={cap.weight.toFixed(1)}) — {cap.description}
              </div>
            ))}
          </div>
        </section>

        <section className="forge-card">
          <h3>Auto Cycle Delta</h3>
          {!gauntlet.autoCycleSummary ? (
            <p className="forge-empty">No auto-cycle summary yet.</p>
          ) : (
            <div className="forge-metrics">
              <div><span>Score before</span><strong>{(gauntlet.autoCycleSummary.beforeScore * 100).toFixed(1)}%</strong></div>
              <div><span>Score after</span><strong>{(gauntlet.autoCycleSummary.afterScore * 100).toFixed(1)}%</strong></div>
              <div><span>Score delta</span><strong>{(gauntlet.autoCycleSummary.deltaScore * 100).toFixed(1)}%</strong></div>
              <div><span>Pass before</span><strong>{(gauntlet.autoCycleSummary.beforePassRate * 100).toFixed(1)}%</strong></div>
              <div><span>Pass after</span><strong>{(gauntlet.autoCycleSummary.afterPassRate * 100).toFixed(1)}%</strong></div>
              <div><span>Pass delta</span><strong>{(gauntlet.autoCycleSummary.deltaPassRate * 100).toFixed(1)}%</strong></div>
            </div>
          )}
        </section>

        <section className="forge-card">
          <h3>Curriculum Arena</h3>
          <div className="forge-metrics">
            <div><span>Level</span><strong>{gauntlet.curriculum.level}</strong></div>
            <div><span>Promotions</span><strong>{gauntlet.curriculum.totalPromotions}</strong></div>
            <div><span>Weakness tags</span><strong>{gauntlet.curriculum.recentFailures.length}</strong></div>
          </div>
          <p className="forge-stop">
            {gauntlet.curriculum.recentFailures.length > 0
              ? `Recent failure modes: ${gauntlet.curriculum.recentFailures.slice(-3).join(', ')}`
              : 'No recent recurring failures detected.'}
          </p>
        </section>

        <section className="forge-card">
          <h3>Trend Sparkline</h3>
          {trendRuns.length < 2 ? (
            <p className="forge-empty">Need at least 2 completed runs to render trend.</p>
          ) : (
            <div className="gauntlet-trend">
              <div className="gauntlet-trend-header">
                <span>Last {trendRuns.length} completed runs</span>
              </div>
              <svg className="gauntlet-trend-chart" viewBox="0 0 280 84" preserveAspectRatio="none" aria-label="Gauntlet trend chart">
                <polyline className="gauntlet-trend-line score" points={scorePoints} />
                <polyline className="gauntlet-trend-line pass" points={passPoints} />
              </svg>
              <div className="gauntlet-trend-legend">
                <span className="score">Overall score</span>
                <span className="pass">Pass rate</span>
              </div>
            </div>
          )}
        </section>

        <section className="forge-card">
          <h3>Recent Runs</h3>
          {latestHistory.length === 0 ? (
            <p className="forge-empty">No completed run history yet.</p>
          ) : (
            <div className="forge-log">
              {latestHistory.map((run) => (
                <div key={run.runId} className="forge-log-line">
                  <strong>{run.runId}</strong>
                  {' — '}
                  {(run.overallScore * 100).toFixed(1)}% overall, {(run.passRate * 100).toFixed(1)}% pass
                  {' — '}
                  {run.phase.toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="forge-card forge-log-card">
          <h3>Gauntlet Log</h3>
          <div className="forge-log">
            {gauntlet.logs.map((entry, idx) => (
              <div key={`${idx}-${entry}`} className="forge-log-line">
                {entry}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
