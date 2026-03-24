import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { GauntletProvenance } from '../types';
import { Button, Card } from './ui';

function msToDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}m ${rem}s`;
}

function computeGrade(overallScore: number, passRate: number): { grade: string; color: string } {
  // A+ criteria: perfect or near-perfect (>= 0.95 score AND >= 1.00 pass-rate)
  if (overallScore >= 0.95 && passRate >= 1.0) {
    return { grade: 'A+', color: '#00ff41' };
  }
  // A criteria: excellent (>= 0.90 score AND >= 0.90 pass-rate)
  if (overallScore >= 0.9 && passRate >= 0.9) {
    return { grade: 'A', color: '#4ade80' };
  }
  // B+ criteria: good (>= 0.80 score AND >= 0.80 pass-rate)
  if (overallScore >= 0.8 && passRate >= 0.8) {
    return { grade: 'B+', color: '#a3d977' };
  }
  // B criteria: acceptable (>= 0.70 score AND >= 0.70 pass-rate)
  if (overallScore >= 0.7 && passRate >= 0.7) {
    return { grade: 'B', color: '#fbbf24' };
  }
  // C criteria: needs improvement (< 0.70)
  return { grade: 'C', color: '#f87171' };
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
  const agiScore = useStore((s) => s.agiScore);
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
    () =>
      gauntlet.history
        .filter((run) => run.phase === 'completed')
        .slice(0, 12)
        .reverse(),
    [gauntlet.history],
  );
  const scorePoints = useMemo(
    () =>
      polylinePoints(
        trendRuns.map((run) => run.overallScore),
        280,
        84,
      ),
    [trendRuns],
  );
  const passPoints = useMemo(
    () =>
      polylinePoints(
        trendRuns.map((run) => run.passRate),
        280,
        84,
      ),
    [trendRuns],
  );

  const agiTrend = useMemo(() => agiScore.snapshots.slice(0, 12).reverse(), [agiScore.snapshots]);
  const agiPoints = useMemo(
    () =>
      polylinePoints(
        agiTrend.map((s) => Math.max(0, Math.min(1, (s.total || 0) / 10))),
        280,
        84,
      ),
    [agiTrend],
  );
  const [provenanceFilter, setProvenanceFilter] = useState<GauntletProvenance | 'all'>('all');
  const filteredResults = gauntlet.results.filter((result) =>
    provenanceFilter === 'all' ? true : (result.provenance || 'synthetic') === provenanceFilter,
  );
  const grade = useMemo(
    () => computeGrade(gauntlet.overallScore, gauntlet.passRate),
    [gauntlet.overallScore, gauntlet.passRate],
  );

  return (
    <div className="forge-panel">
      <div className="forge-header">
        <div>
          <h2>⚔ GAUNTLET MODULE</h2>
          <p>Capability benchmark harness for planning, reasoning, robustness, and self-correction</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className={`forge-status ${gauntlet.phase}`}>{gauntlet.phase.toUpperCase()}</div>
          {gauntlet.phase === 'completed' && gauntlet.results.length > 0 && (
            <div
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                backgroundColor: grade.color,
                color: '#000',
                fontWeight: 'bold',
                fontSize: 14,
                letterSpacing: 0.5,
              }}
            >
              {grade.grade}
            </div>
          )}
        </div>
      </div>

      <div className="forge-grid">
        <Card title="Run Control" glow="cyan" className="forge-card">
          <div className="forge-metrics">
            <div>
              <span>Capabilities</span>
              <strong>{gauntlet.baselineCapabilities.length}</strong>
            </div>
            <div>
              <span>Progress</span>
              <strong>
                {gauntlet.currentIndex}/{gauntlet.baselineCapabilities.length}
              </strong>
            </div>
            <div>
              <span>Overall score</span>
              <strong>{(gauntlet.overallScore * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span>Pass rate</span>
              <strong>{(gauntlet.passRate * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span>AGI score</span>
              <strong>{agiScore.latest ? `${agiScore.latest.total.toFixed(2)}/10` : 'n/a'}</strong>
            </div>
            {gauntlet.phase === 'completed' && gauntlet.results.length > 0 && (
              <div>
                <span>Grade</span>
                <strong style={{ color: grade.color }}>{grade.grade}</strong>
              </div>
            )}
            <div>
              <span>Elapsed</span>
              <strong>{elapsed}</strong>
            </div>
            <div>
              <span>History runs</span>
              <strong>{gauntlet.history.length}</strong>
            </div>
            <div>
              <span>Auto cycle</span>
              <strong>{gauntlet.autoCycleStage.toUpperCase()}</strong>
            </div>
            <div>
              <span>Curriculum level</span>
              <strong>{gauntlet.curriculum.level}</strong>
            </div>
            <div>
              <span>Solved at level</span>
              <strong>
                {gauntlet.curriculum.solvedAtCurrentLevel}/{gauntlet.curriculum.targetPerLevel}
              </strong>
            </div>
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
            <Button variant="primary" onClick={() => startGauntlet()} disabled={running || autoCycleRunning}>
              Run Gauntlet
            </Button>
            <Button variant="danger" onClick={cancelGauntlet} disabled={!running || autoCycleRunning}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={startGauntletAutoCycle}
              disabled={!gauntlet.autoCycleEnabled || autoCycleRunning || running}
            >
              Run Auto Cycle
            </Button>
            <Button variant="danger" onClick={cancelGauntletAutoCycle} disabled={!autoCycleRunning}>
              Cancel Auto Cycle
            </Button>
            <Button onClick={resetGauntlet} disabled={running || autoCycleRunning}>
              Reset
            </Button>
          </div>
        </Card>

        <Card title="AGI Score (Weighted Rubric)" glow="gold" className="forge-card">
          {!agiScore.latest ? (
            <p className="forge-empty">Run GAUNTLET to generate an AGI score snapshot.</p>
          ) : (
            <>
              <div className="forge-metrics">
                <div>
                  <span>Total</span>
                  <strong>{agiScore.latest.total.toFixed(2)} / 10</strong>
                </div>
                <div>
                  <span>Reasoning</span>
                  <strong>{agiScore.latest.subscores.abstractReasoningLogic.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Flexibility</span>
                  <strong>{agiScore.latest.subscores.learningFlexibility.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Generality</span>
                  <strong>{agiScore.latest.subscores.domainGenerality.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Goal-setting</span>
                  <strong>{agiScore.latest.subscores.autonomousGoalSetting.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Meta-cognition</span>
                  <strong>{agiScore.latest.subscores.selfModelingMetaCognition.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Creativity</span>
                  <strong>{agiScore.latest.subscores.creativeProblemSolving.toFixed(2)}</strong>
                </div>
              </div>
              {agiTrend.length >= 2 && (
                <div className="gauntlet-trend" style={{ marginTop: 10 }}>
                  <div className="gauntlet-trend-header">
                    <span>Last {agiTrend.length} snapshots</span>
                  </div>
                  <svg
                    className="gauntlet-trend-chart"
                    viewBox="0 0 280 84"
                    preserveAspectRatio="none"
                    aria-label="AGI score trend chart"
                  >
                    <polyline className="gauntlet-trend-line score" points={agiPoints} />
                  </svg>
                  <div className="gauntlet-trend-legend">
                    <span className="score">AGI total</span>
                  </div>
                </div>
              )}
              {agiScore.lastError && <p className="forge-stop">AGI score error: {agiScore.lastError}</p>}
            </>
          )}
        </Card>

        <Card title="Capability Results" glow="green" className="forge-card">
          <div className="forge-actions" style={{ marginBottom: 8 }}>
            <Button size="sm" onClick={() => setProvenanceFilter('all')} disabled={provenanceFilter === 'all'}>
              All
            </Button>
            <Button
              size="sm"
              onClick={() => setProvenanceFilter('real-workflow')}
              disabled={provenanceFilter === 'real-workflow'}
            >
              Real Workflow
            </Button>
            <Button
              size="sm"
              onClick={() => setProvenanceFilter('synthetic')}
              disabled={provenanceFilter === 'synthetic'}
            >
              Synthetic
            </Button>
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
                  {' — '}[{result.provenance || 'synthetic'}]{' — '}
                  {result.summary}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Provenance Rollups" className="forge-card">
          <div className="forge-metrics">
            <div>
              <span>Real workflow score</span>
              <strong>{(gauntlet.provenanceRollups['real-workflow'].overallScore * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span>Real workflow pass</span>
              <strong>{(gauntlet.provenanceRollups['real-workflow'].passRate * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span>Real workflow count</span>
              <strong>{gauntlet.provenanceRollups['real-workflow'].count}</strong>
            </div>
            <div>
              <span>Synthetic score</span>
              <strong>{(gauntlet.provenanceRollups.synthetic.overallScore * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span>Synthetic pass</span>
              <strong>{(gauntlet.provenanceRollups.synthetic.passRate * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span>Synthetic count</span>
              <strong>{gauntlet.provenanceRollups.synthetic.count}</strong>
            </div>
          </div>
        </Card>

        <Card title="Baseline Suite" className="forge-card">
          <div className="forge-log">
            {gauntlet.baselineCapabilities.map((cap) => (
              <div key={cap.id} className="forge-log-line">
                <strong>{cap.name}</strong> ({cap.category}, w={cap.weight.toFixed(1)}) — {cap.description}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Auto Cycle Delta" className="forge-card">
          {!gauntlet.autoCycleSummary ? (
            <p className="forge-empty">No auto-cycle summary yet.</p>
          ) : (
            <div className="forge-metrics">
              <div>
                <span>AGI before</span>
                <strong>
                  {typeof gauntlet.autoCycleSummary.beforeAgiScore === 'number'
                    ? gauntlet.autoCycleSummary.beforeAgiScore.toFixed(2)
                    : 'n/a'}
                </strong>
              </div>
              <div>
                <span>AGI after</span>
                <strong>
                  {typeof gauntlet.autoCycleSummary.afterAgiScore === 'number'
                    ? gauntlet.autoCycleSummary.afterAgiScore.toFixed(2)
                    : 'n/a'}
                </strong>
              </div>
              <div>
                <span>AGI delta</span>
                <strong>
                  {typeof gauntlet.autoCycleSummary.deltaAgiScore === 'number'
                    ? gauntlet.autoCycleSummary.deltaAgiScore.toFixed(2)
                    : 'n/a'}
                </strong>
              </div>
              <div>
                <span>Score before</span>
                <strong>{(gauntlet.autoCycleSummary.beforeScore * 100).toFixed(1)}%</strong>
              </div>
              <div>
                <span>Score after</span>
                <strong>{(gauntlet.autoCycleSummary.afterScore * 100).toFixed(1)}%</strong>
              </div>
              <div>
                <span>Score delta</span>
                <strong>{(gauntlet.autoCycleSummary.deltaScore * 100).toFixed(1)}%</strong>
              </div>
              <div>
                <span>Pass before</span>
                <strong>{(gauntlet.autoCycleSummary.beforePassRate * 100).toFixed(1)}%</strong>
              </div>
              <div>
                <span>Pass after</span>
                <strong>{(gauntlet.autoCycleSummary.afterPassRate * 100).toFixed(1)}%</strong>
              </div>
              <div>
                <span>Pass delta</span>
                <strong>{(gauntlet.autoCycleSummary.deltaPassRate * 100).toFixed(1)}%</strong>
              </div>
            </div>
          )}
        </Card>

        <Card title="Curriculum Arena" className="forge-card">
          <div className="forge-metrics">
            <div>
              <span>Level</span>
              <strong>{gauntlet.curriculum.level}</strong>
            </div>
            <div>
              <span>Promotions</span>
              <strong>{gauntlet.curriculum.totalPromotions}</strong>
            </div>
            <div>
              <span>Weakness tags</span>
              <strong>{gauntlet.curriculum.recentFailures.length}</strong>
            </div>
          </div>
          <p className="forge-stop">
            {gauntlet.curriculum.recentFailures.length > 0
              ? `Recent failure modes: ${gauntlet.curriculum.recentFailures.slice(-3).join(', ')}`
              : 'No recent recurring failures detected.'}
          </p>
        </Card>

        <Card title="Trend Sparkline" className="forge-card">
          {trendRuns.length < 2 ? (
            <p className="forge-empty">Need at least 2 completed runs to render trend.</p>
          ) : (
            <div className="gauntlet-trend">
              <div className="gauntlet-trend-header">
                <span>Last {trendRuns.length} completed runs</span>
              </div>
              <svg
                className="gauntlet-trend-chart"
                viewBox="0 0 280 84"
                preserveAspectRatio="none"
                aria-label="Gauntlet trend chart"
              >
                <polyline className="gauntlet-trend-line score" points={scorePoints} />
                <polyline className="gauntlet-trend-line pass" points={passPoints} />
              </svg>
              <div className="gauntlet-trend-legend">
                <span className="score">Overall score</span>
                <span className="pass">Pass rate</span>
              </div>
            </div>
          )}
        </Card>

        <Card title="Recent Runs" className="forge-card">
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
        </Card>

        <Card title="Gauntlet Log" className="forge-card forge-log-card">
          <div className="forge-log">
            {gauntlet.logs.map((entry, idx) => (
              <div key={`${idx}-${entry}`} className="forge-log-line">
                {entry}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
