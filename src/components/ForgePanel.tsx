import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Button, Card } from './ui';

function msToDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}m ${rem}s`;
}

export default function ForgePanel() {
  const forge = useStore((s) => s.forge);
  const gauntlet = useStore((s) => s.gauntlet);
  const setActiveModule = useStore((s) => s.setActiveModule);
  const startForge = useStore((s) => s.startForge);
  const cancelForge = useStore((s) => s.cancelForge);
  const resetForge = useStore((s) => s.resetForge);
  const setStrictEval = useStore((s) => s.setForgeStrictEvalMode);
  const setVerifierFirst = useStore((s) => s.setForgeVerifierFirst);

  const [maxGenerations, setMaxGenerations] = useState<number>(forge.config.maxGenerations);
  const [candidatesPerGeneration, setCandidatesPerGeneration] = useState<number>(forge.config.candidatesPerGeneration);
  const [mutationRate, setMutationRate] = useState<number>(forge.config.mutationRate);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState<number>(Math.round(forge.config.maxDurationMs / 1000));

  const running = forge.phase === 'running';
  const elapsed = useMemo(() => {
    if (!forge.startedAt) return '0m 0s';
    const end = forge.finishedAt ?? Date.now();
    return msToDuration(end - forge.startedAt);
  }, [forge.startedAt, forge.finishedAt, forge.phase, forge.generations.length]);

  const handleRun = () => {
    if (running) return;
    startForge({
      maxGenerations: Math.max(1, Math.floor(maxGenerations)),
      candidatesPerGeneration: Math.max(2, Math.floor(candidatesPerGeneration)),
      mutationRate: Math.min(0.75, Math.max(0.05, mutationRate)),
      maxDurationMs: Math.max(3000, Math.floor(maxDurationSeconds * 1000)),
    });
  };

  return (
    <div className="forge-panel">
      <div className="forge-header">
        <div>
          <h2>⚒ FORGE MODULE</h2>
          <p>Bounded autonomy pipeline with evaluation and mutation sandbox</p>
        </div>
        <div className={`forge-status ${forge.phase}`}>{forge.phase.toUpperCase()}</div>
      </div>

      <div className="forge-grid">
        <Card title="Run Configuration" glow="cyan" className="forge-card">
          <p className="forge-stop">
            Latest gauntlet pass rate: {(gauntlet.passRate * 100).toFixed(1)}%
            {gauntlet.history.length > 0
              ? ` across ${gauntlet.history[0].results.length} capabilities.`
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
              checked={forge.strictEvalMode}
              onChange={(e) => setStrictEval(e.target.checked)}
              disabled={running}
            />
            Strict Eval Mode
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={forge.verifierFirst}
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
          {forge.bestCandidate ? (
            <div className="forge-metrics">
              <div>
                <span>Candidate</span>
                <strong>{forge.bestCandidate.id}</strong>
              </div>
              <div>
                <span>Score</span>
                <strong>{(forge.bestCandidate.score * 100).toFixed(1)}%</strong>
              </div>
              <div>
                <span>Pass rate</span>
                <strong>{(forge.bestCandidate.passRate * 100).toFixed(1)}%</strong>
              </div>
              <div>
                <span>Benchmark score</span>
                <strong>{(forge.bestCandidate.benchmarkScore * 100).toFixed(1)}%</strong>
              </div>
              <div>
                <span>Temperature</span>
                <strong>{forge.bestCandidate.temperature.toFixed(2)}</strong>
              </div>
              <div>
                <span>Tool budget</span>
                <strong>{forge.bestCandidate.toolBudget}</strong>
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
              <strong>{forge.baselineSuite.length}</strong>
            </div>
            <div>
              <span>Generation</span>
              <strong>{forge.currentGeneration}</strong>
            </div>
            <div>
              <span>History entries</span>
              <strong>{forge.generations.length}</strong>
            </div>
            <div>
              <span>Elapsed</span>
              <strong>{elapsed}</strong>
            </div>
            <div>
              <span>Verifier checks</span>
              <strong>{forge.verifierChecks.length}</strong>
            </div>
            <div>
              <span>Verifier pass</span>
              <strong>
                {forge.verifierChecks.length > 0
                  ? `${(
                      (forge.verifierChecks.filter((c) => c.passed).length / forge.verifierChecks.length) *
                      100
                    ).toFixed(1)}%`
                  : 'n/a'}
              </strong>
            </div>
          </div>
          <p className="forge-stop">{forge.stopReason ?? 'Bounded loop active. No stop event yet.'}</p>
        </Card>

        <Card title="Pipeline Log" className="forge-card forge-log-card">
          <div className="forge-log">
            {forge.logs.map((entry, index) => (
              <div key={`${index}-${entry}`} className="forge-log-line">
                {entry}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
