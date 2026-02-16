// ═══════════════════════════════════════════════════════════════
//  SPARK Panel — The Cognitive Architecture Dashboard
//  Seven engines. One mind. Real-time visualization.
//
//  World Model | Curiosity | Reasoning | Goals
//  Meta-Cognition | Self-Modification | Temporal Reasoning
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';

function formatPrediction(
  prediction: string | number | boolean | Record<string, unknown> | Array<unknown>,
): string {
  if (typeof prediction === 'string') return prediction;
  if (typeof prediction === 'number' || typeof prediction === 'boolean') {
    return String(prediction);
  }
  try {
    return JSON.stringify(prediction);
  } catch {
    return '[unserializable prediction]';
  }
}

// ─── Sub-components ────────────────────────────────────────────

function WorldModelSection() {
  const spark = useStore((s) => s.spark);
  const { entities, relations } = spark.worldModel;
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(filter.toLowerCase()) ||
          e.type.toLowerCase().includes(filter.toLowerCase()),
      )
    : entities.slice(-20);

  // Group entities by type
  const byType = new Map<string, number>();
  for (const e of entities) {
    byType.set(e.type, (byType.get(e.type) || 0) + 1);
  }

  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">⬡</span>
        <span className="spark-section-title">WORLD MODEL</span>
        <span className="spark-section-badge">
          {entities.length}E / {relations.length}R
        </span>
      </div>
      <div className="spark-section-body">
        {entities.length === 0 ? (
          <div className="spark-empty">
            No knowledge yet. Feed text to SPARK to build the world model.
          </div>
        ) : (
          <>
            <div className="spark-type-chips">
              {Array.from(byType.entries()).map(([type, count]) => (
                <span
                  key={type}
                  className={`spark-chip ${filter === type ? 'active' : ''}`}
                  onClick={() => setFilter(filter === type ? '' : type)}
                >
                  {type} ({count})
                </span>
              ))}
            </div>
            <div className="spark-entity-list">
              {filtered.slice(-15).map((e) => (
                <div key={e.id} className="spark-entity">
                  <span className="spark-entity-name">{e.name}</span>
                  <span className="spark-entity-type">{e.type}</span>
                  <span className="spark-entity-conf">
                    {(e.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
            {relations.length > 0 && (
              <div className="spark-relations">
                <div className="spark-subsection-title">Relations</div>
                {relations.slice(-10).map((r) => {
                  const src = entities.find((e) => e.id === r.source);
                  const tgt = entities.find((e) => e.id === r.target);
                  return (
                    <div key={r.id} className="spark-relation">
                      <span>{src?.name || '?'}</span>
                      <span className="spark-relation-type">{r.type}</span>
                      <span>{tgt?.name || '?'}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CuriositySection() {
  const spark = useStore((s) => s.spark);
  const { questions, curiosityScore, totalQuestionsGenerated } = spark.curiosity;
  const openQuestions = questions.filter((q) => q.status === 'open');

  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">◈</span>
        <span className="spark-section-title">CURIOSITY ENGINE</span>
        <span className="spark-section-badge">
          {(curiosityScore * 100).toFixed(0)}% drive
        </span>
      </div>
      <div className="spark-section-body">
        <div className="spark-curiosity-bar">
          <div
            className="spark-curiosity-fill"
            style={{ width: `${curiosityScore * 100}%` }}
          />
        </div>
        <div className="spark-stat-row">
          <span>Generated: {totalQuestionsGenerated}</span>
          <span>Open: {openQuestions.length}</span>
        </div>
        {openQuestions.length === 0 ? (
          <div className="spark-empty">No open questions yet.</div>
        ) : (
          <div className="spark-question-list">
            {openQuestions.slice(-6).map((q) => (
              <div key={q.id} className="spark-question">
                <span className="spark-question-mark">?</span>
                <span className="spark-question-text">{q.question}</span>
                <span className="spark-question-domain">{q.domain}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReasonerSection() {
  const spark = useStore((s) => s.spark);
  const chains = spark.reasoning;

  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">⚡</span>
        <span className="spark-section-title">HYBRID REASONER</span>
        <span className="spark-section-badge">
          {chains.filter((c) => c.verified).length} verified
        </span>
      </div>
      <div className="spark-section-body">
        {chains.length === 0 ? (
          <div className="spark-empty">
            No reasoning chains yet. Try "calculate 2^10 + sqrt(144)".
          </div>
        ) : (
          <div className="spark-chain-list">
            {chains.slice(-5).map((chain) => (
              <div
                key={chain.id}
                className={`spark-chain ${chain.verified ? 'verified' : 'unverified'}`}
              >
                <div className="spark-chain-header">
                  <span className="spark-chain-query">{chain.query}</span>
                  <span
                    className={`spark-chain-badge ${chain.verified ? 'verified' : ''}`}
                  >
                    {chain.verified ? '✓ VERIFIED' : `${(chain.confidence * 100).toFixed(0)}%`}
                  </span>
                </div>
                <div className="spark-chain-conclusion">{chain.conclusion}</div>
                {chain.steps.map((step, i) => (
                  <div key={i} className="spark-chain-step">
                    <span className="spark-step-type">{step.type}</span>
                    <span className="spark-step-content">
                      {step.result || step.content}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GoalsSection() {
  const spark = useStore((s) => s.spark);
  const addGoal = useStore((s) => s.sparkAddGoal);
  const [newGoal, setNewGoal] = useState('');
  const activeGoals = spark.goals.goals.filter((g) => g.status === 'active');
  const completedGoals = spark.goals.goals.filter((g) => g.status === 'completed');
  const activePlan = spark.goals.horizonPlans.find((p) => p.id === spark.goals.activeHorizonPlanId);

  const handleAddGoal = () => {
    if (newGoal.trim()) {
      addGoal(newGoal.trim());
      setNewGoal('');
    }
  };

  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">◆</span>
        <span className="spark-section-title">GOAL ENGINE</span>
        <span className="spark-section-badge">
          {activeGoals.length} active / {completedGoals.length} done
        </span>
      </div>
      <div className="spark-section-body">
        <div className="spark-goal-input">
          <input
            type="text"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddGoal()}
            placeholder="Set a new goal..."
            className="spark-input"
          />
          <button className="spark-btn-small" onClick={handleAddGoal}>
            +
          </button>
        </div>
        {activeGoals.length === 0 && completedGoals.length === 0 ? (
          <div className="spark-empty">No goals set. Add one above.</div>
        ) : (
          <div className="spark-goal-list">
            {activePlan && (
              <div className="spark-goal active" style={{ borderColor: 'var(--purple)' }}>
                <div className="spark-goal-header">
                  <span className="spark-goal-desc">Long-Horizon Plan ({activePlan.horizonHours}h)</span>
                  <span className="spark-goal-type">{activePlan.status}</span>
                </div>
                <div className="spark-goal-progress-bar">
                  <div
                    className="spark-goal-progress-fill"
                    style={{ width: `${activePlan.progress * 100}%` }}
                  />
                </div>
                <div className="spark-goal-meta">
                  {(activePlan.progress * 100).toFixed(0)}% horizon completion
                </div>
              </div>
            )}
            {activeGoals.map((g) => (
              <div key={g.id} className="spark-goal active">
                <div className="spark-goal-header">
                  <span className="spark-goal-desc">{g.description}</span>
                  <span className="spark-goal-type">{g.type}</span>
                </div>
                <div className="spark-goal-progress-bar">
                  <div
                    className="spark-goal-progress-fill"
                    style={{ width: `${g.progress * 100}%` }}
                  />
                </div>
                <div className="spark-goal-meta">
                  {(g.progress * 100).toFixed(0)}% complete
                </div>
              </div>
            ))}
            {completedGoals.slice(-3).map((g) => (
              <div key={g.id} className="spark-goal completed">
                <span className="spark-goal-check">✓</span>
                <span className="spark-goal-desc">{g.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaCognitionSection() {
  const spark = useStore((s) => s.spark);
  const { calibrationScore, knownLimitations, blindSpots, totalPredictions, correctPredictions } =
    spark.metacognition;

  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">☼</span>
        <span className="spark-section-title">META-COGNITION</span>
        <span className="spark-section-badge">
          Cal: {(calibrationScore * 100).toFixed(0)}%
        </span>
      </div>
      <div className="spark-section-body">
        <div className="spark-meta-gauge">
          <div className="spark-meta-label">Calibration Score</div>
          <div className="spark-meta-bar">
            <div
              className="spark-meta-fill"
              style={{
                width: `${calibrationScore * 100}%`,
                background:
                  calibrationScore > 0.7
                    ? 'var(--green)'
                    : calibrationScore > 0.4
                      ? 'var(--amber)'
                      : 'var(--red)',
              }}
            />
          </div>
        </div>
        <div className="spark-stat-row">
          <span>Predictions: {totalPredictions}</span>
          <span>Correct: {correctPredictions}</span>
        </div>
        {knownLimitations.length > 0 && (
          <div className="spark-limitations">
            <div className="spark-subsection-title">Known Limitations</div>
            {knownLimitations.slice(0, 3).map((lim, i) => (
              <div key={i} className="spark-limitation">
                <span className="spark-limitation-icon">△</span>
                {lim}
              </div>
            ))}
          </div>
        )}
        {blindSpots.length > 0 && (
          <div className="spark-blindspots">
            <div className="spark-subsection-title">Detected Blind Spots</div>
            {blindSpots.slice(-3).map((spot, i) => (
              <div key={i} className="spark-blindspot">
                <span className="spark-blindspot-icon">⚠</span>
                {spot}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemporalSection() {
  const spark = useStore((s) => s.spark);
  const { events, activePredictions, predictionAccuracy } = spark.temporal;

  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">⧖</span>
        <span className="spark-section-title">TEMPORAL REASONING</span>
        <span className="spark-section-badge">
          Acc: {(predictionAccuracy * 100).toFixed(0)}%
        </span>
      </div>
      <div className="spark-section-body">
        {activePredictions.length > 0 && (
          <div className="spark-predictions">
            <div className="spark-subsection-title">Active Predictions</div>
            {activePredictions.slice(-4).map((p) => (
              <div key={p.id} className="spark-prediction">
                <span className="spark-prediction-arrow">→</span>
                <span className="spark-prediction-text">{formatPrediction(p.prediction)}</span>
                <span className="spark-prediction-conf">
                  {(p.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
        {events.length > 0 && (
          <div className="spark-events">
            <div className="spark-subsection-title">
              Event Timeline ({events.length})
            </div>
            {events.slice(-5).map((e) => (
              <div key={e.id} className="spark-event">
                <span className="spark-event-time">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span className="spark-event-desc">
                  {e.description.slice(0, 80)}
                </span>
              </div>
            ))}
          </div>
        )}
        {events.length === 0 && activePredictions.length === 0 && (
          <div className="spark-empty">No temporal data yet.</div>
        )}
      </div>
    </div>
  );
}

function SelfModSection() {
  const spark = useStore((s) => s.spark);
  const { modifications, currentStrategy, totalModifications, successfulModifications } =
    spark.selfmod;

  return (
    <div className="spark-section spark-selfmod">
      <div className="spark-section-header">
        <span className="spark-section-icon">⚙</span>
        <span className="spark-section-title">SELF-MODIFICATION</span>
        <span className="spark-section-badge">
          {totalModifications} proposed / {successfulModifications} applied
        </span>
      </div>
      <div className="spark-section-body">
        <div className="spark-strategy">
          <div className="spark-subsection-title">Current Strategy</div>
          <div className="spark-strategy-text">{currentStrategy}</div>
        </div>
        {modifications.length > 0 && (
          <div className="spark-mod-list">
            <div className="spark-subsection-title">Modification Log</div>
            {modifications.slice(-4).map((mod) => (
              <div
                key={mod.id}
                className={`spark-mod ${mod.applied ? 'applied' : 'proposed'}`}
              >
                <span className="spark-mod-type">{mod.type}</span>
                <span className="spark-mod-desc">
                  {mod.description.slice(0, 100)}
                </span>
                <span
                  className={`spark-mod-status ${mod.applied ? 'applied' : ''}`}
                >
                  {mod.applied ? 'APPLIED' : 'PROPOSED'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GenomeSection() {
  const spark = useStore((s) => s.spark);
  const setDrive = useStore((s) => s.setGenomeDrive);
  const setTrait = useStore((s) => s.setGenomeTrait);
  const setPlasticity = useStore((s) => s.setGenomePlasticity);
  const setTrauma = useStore((s) => s.setGenomeTraumaSensitivity);
  const setAttachmentStyle = useStore((s) => s.setGenomeAttachmentStyle);
  const applyPreset = useStore((s) => s.applyGenomePreset);
  const g = spark.genome;

  const sliderRow = (
    label: string,
    value: number,
    onChange: (value: number) => void,
  ) => (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 40px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{value.toFixed(2)}</span>
    </div>
  );

  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">🧬</span>
        <span className="spark-section-title">COGNITIVE GENOME</span>
        <select
          value={g.attachmentStyle}
          onChange={(e) =>
            setAttachmentStyle(
              e.target.value as
                | 'secure'
                | 'anxious'
                | 'avoidant'
                | 'disorganized',
            )
          }
          style={{ fontSize: 13, background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
        >
          <option value="secure">secure</option>
          <option value="anxious">anxious</option>
          <option value="avoidant">avoidant</option>
          <option value="disorganized">disorganized</option>
        </select>
      </div>
      <div className="spark-section-body">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <button className="spark-btn-small" onClick={() => applyPreset('companion')}>Companion</button>
          <button className="spark-btn-small" onClick={() => applyPreset('strategist')}>Strategist</button>
          <button className="spark-btn-small" onClick={() => applyPreset('explorer')}>Explorer</button>
          <button className="spark-btn-small" onClick={() => applyPreset('guardian')}>Guardian</button>
        </div>
        <div className="spark-subsection-title">Drives</div>
        {sliderRow('Curiosity', g.drives.curiosity, (v) => setDrive('curiosity', v))}
        {sliderRow('Safety', g.drives.safety, (v) => setDrive('safety', v))}
        {sliderRow('Attachment', g.drives.attachment, (v) => setDrive('attachment', v))}
        {sliderRow('Mastery', g.drives.mastery, (v) => setDrive('mastery', v))}
        <div className="spark-subsection-title" style={{ marginTop: 8 }}>Traits</div>
        {sliderRow('Openness', g.traits.openness, (v) => setTrait('openness', v))}
        {sliderRow('Adaptability', g.traits.adaptability, (v) => setTrait('adaptability', v))}
        <div className="spark-subsection-title" style={{ marginTop: 8 }}>Plasticity</div>
        {sliderRow('Learning', g.plasticity.learningRate, (v) => setPlasticity('learningRate', v))}
        {sliderRow('Belief Update', g.plasticity.beliefUpdateRate, (v) => setPlasticity('beliefUpdateRate', v))}
        <div className="spark-subsection-title" style={{ marginTop: 8 }}>Trauma Sensitivity</div>
        {sliderRow('Rejection', g.traumaSensitivity.rejection, (v) => setTrauma('rejection', v))}
        {sliderRow('Uncertainty', g.traumaSensitivity.uncertainty, (v) => setTrauma('uncertainty', v))}
      </div>
    </div>
  );
}

function MetabolismSection() {
  const spark = useStore((s) => s.spark);
  const m = spark.metabolism;
  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">⚙</span>
        <span className="spark-section-title">AUTONOMY METABOLISM</span>
        <span className="spark-section-badge">{m.circadianPhase.toUpperCase()}</span>
      </div>
      <div className="spark-section-body">
        <div className="spark-stat-row">
          <span>Energy: {(m.energyBudget * 100).toFixed(0)}%</span>
          <span>Curiosity budget: {(m.curiosityBudget * 100).toFixed(0)}%</span>
        </div>
        <div className="spark-stat-row">
          <span>Risk budget: {(m.riskBudget * 100).toFixed(0)}%</span>
          <span>Recovery debt: {(m.recoveryDebt * 100).toFixed(0)}%</span>
        </div>
        <div className="spark-stat-row">
          <span>Wake cycles: {m.wakeCycleCount}</span>
          <span>Last sleep: {m.lastSleepAt ? new Date(m.lastSleepAt).toLocaleTimeString() : 'n/a'}</span>
        </div>
      </div>
    </div>
  );
}

function SocialSection() {
  const spark = useStore((s) => s.spark);
  const actor = spark.social.actors.find((a) => a.id === 'operator');
  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">🤝</span>
        <span className="spark-section-title">SOCIAL SIMULATION</span>
        <span className="spark-section-badge">{spark.social.actors.length} actors</span>
      </div>
      <div className="spark-section-body">
        <div className="spark-stat-row">
          <span>Ruptures: {spark.social.totalRuptures}</span>
          <span>Repairs: {spark.social.totalRepairs}</span>
        </div>
        {actor && (
          <div className="spark-stat-row">
            <span>Operator trust: {(actor.trust * 100).toFixed(0)}%</span>
            <span>Needs tracked: {actor.inferredNeeds.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EcologySection() {
  const spark = useStore((s) => s.spark);
  const e = spark.ecology;
  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">🌍</span>
        <span className="spark-section-title">EMBODIED ECOLOGY</span>
        <span className="spark-section-badge">{e.safetyMode}</span>
      </div>
      <div className="spark-section-body">
        <div className="spark-stat-row">
          <span>Plans: {e.plansApplied}</span>
          <span>Success: {e.successfulPlans}</span>
        </div>
        <div className="spark-stat-row">
          <span>Failures: {e.failedPlans}</span>
          <span>Signal: {(Number(e.worldState.signalStrength || 0) * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

function NightCycleTimeline() {
  const spark = useStore((s) => s.spark);
  const memoryConsolidation = useStore((s) => s.memoryConsolidation);
  const runNightly = useStore((s) => s.runNightlyReconsolidation);
  const reconEvents = [
    ...spark.logs.filter((line) => line.includes('[RECON]')),
    ...memoryConsolidation.logs.filter((line) =>
      line.toLowerCase().includes('night reconsolidation'),
    ),
  ].slice(-12).reverse();

  return (
    <div className="spark-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">🌙</span>
        <span className="spark-section-title">NIGHT CYCLE TIMELINE</span>
        <button
          className="spark-btn-small"
          onClick={() => runNightly()}
          title="Run reconsolidation immediately"
        >
          RUN NOW
        </button>
      </div>
      <div className="spark-section-body">
        {reconEvents.length === 0 ? (
          <div className="spark-empty">No reconsolidation events yet.</div>
        ) : (
          <div className="spark-log">
            {reconEvents.map((line, i) => (
              <div key={`${i}-${line}`} className="spark-log-line">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SparkLog() {
  const spark = useStore((s) => s.spark);
  const sparkLive = useStore((s) => s.sparkLiveLog);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [sparkLive, spark.logs]);

  const allLogs = [...spark.logs, ...sparkLive];

  return (
    <div className="spark-log-section">
      <div className="spark-section-header">
        <span className="spark-section-icon">▸</span>
        <span className="spark-section-title">SPARK LOG</span>
      </div>
      <div className="spark-log" ref={logRef}>
        {allLogs.slice(-30).map((line, i) => (
          <div key={i} className="spark-log-line">
            {line}
          </div>
        ))}
        {allLogs.length === 0 && (
          <div className="spark-log-line dim">Awaiting ignition...</div>
        )}
      </div>
    </div>
  );
}

// ─── Thermodynamics Section ────────────────────────────────────

function ThermoSection() {
  const spark = useStore((s) => s.spark);
  const { thermo } = spark;
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!thermo.ignited) return;
    const id = setInterval(() => setPulse((p) => (p + 1) % 360), 50);
    return () => clearInterval(id);
  }, [thermo.ignited]);

  const pulseOpacity = thermo.ignited
    ? 0.5 + Math.sin((pulse * Math.PI) / 180) * 0.5
    : 0.2;

  return (
    <div className="spark-thermo">
      {/* Heartbeat */}
      <div className="spark-thermo-row">
        <div
          className={`spark-heartbeat ${thermo.ignited ? 'alive' : 'dead'}`}
          style={{ opacity: pulseOpacity }}
        >
          {thermo.ignited ? '●' : '○'}
        </div>
        <div className="spark-thermo-gauges">
          {/* Temperature */}
          <div className="spark-thermo-gauge">
            <span className="spark-thermo-label">TEMP</span>
            <div className="spark-thermo-bar">
              <div
                className="spark-thermo-fill temp"
                style={{ width: `${thermo.temperature * 100}%` }}
              />
            </div>
            <span className="spark-thermo-value">
              {(thermo.temperature * 100).toFixed(0)}°
            </span>
          </div>
          {/* Entropy */}
          <div className="spark-thermo-gauge">
            <span className="spark-thermo-label">ENTROPY</span>
            <div className="spark-thermo-bar">
              <div
                className="spark-thermo-fill entropy"
                style={{ width: `${thermo.entropy * 100}%` }}
              />
            </div>
            <span className="spark-thermo-value">
              {(thermo.entropy * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="spark-thermo-energy">
          <div className="spark-thermo-energy-value">
            {thermo.energy.toFixed(0)}
          </div>
          <div className="spark-thermo-energy-label">ENERGY</div>
        </div>
      </div>
      {/* Cycle counters */}
      <div className="spark-thermo-cycles">
        <span>Light: {thermo.cyclesLight}</span>
        <span>Medium: {thermo.cyclesMedium}</span>
        <span>Deep: {thermo.cyclesDeep}</span>
        <span>
          Beat: {(thermo.heartbeatMs / 1000).toFixed(0)}s
        </span>
      </div>
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────

export default function SparkPanel() {
  const spark = useStore((s) => s.spark);
  const memoryConsolidation = useStore((s) => s.memoryConsolidation);
  const runCycle = useStore((s) => s.sparkRunCycle);
  const runDeep = useStore((s) => s.sparkRunDeepThought);
  const ignite = useStore((s) => s.sparkIgnite);
  const extinguish = useStore((s) => s.sparkExtinguish);
  const resetSpark = useStore((s) => s.sparkReset);
  const [input, setInput] = useState('');

  const isProcessing =
    spark.phase === 'thinking' ||
    spark.phase === 'exploring' ||
    spark.phase === 'evolving';
  const isIgnited = spark.thermo.ignited;

  const handleProcess = () => {
    if (input.trim() && !isProcessing) {
      runCycle(input.trim());
      setInput('');
    }
  };

  return (
    <div className="panel spark-panel">
      {/* Header */}
      <div className="spark-header">
        <div className="spark-logo">
          <span className={`spark-logo-icon ${isIgnited ? 'ignited' : ''}`}>
            ⚡
          </span>
          <span className="spark-logo-text">S P A R K</span>
          {isIgnited && <span className="spark-alive-badge">ALIVE</span>}
        </div>
        <div className="spark-subtitle">
          Self-Propagating Autonomous Reasoning Kernel
        </div>

        {/* Thermodynamics */}
        <ThermoSection />

        <div className="spark-status-row">
          <span className={`spark-phase ${spark.phase}`}>
            {spark.phase.toUpperCase()}
          </span>
          <span className="spark-stat">Cycles: {spark.cycleCount}</span>
          <span className="spark-stat">
            Entities: {spark.worldModel.entities.length}
          </span>
          <span className="spark-stat">
            Relations: {spark.worldModel.relations.length}
          </span>
          <span className="spark-stat">
            Horizon plans: {spark.goals.horizonPlans.length}
          </span>
          <span className="spark-stat">
            Consolidation runs: {memoryConsolidation.totalRuns}
          </span>
          <span className="spark-stat">
            Metabolism: {spark.metabolism.circadianPhase}
          </span>
        </div>

        {/* Controls */}
        <div className="spark-controls">
          <button
            className={`spark-btn ignite ${isIgnited ? 'active' : ''}`}
            onClick={isIgnited ? extinguish : ignite}
            title={
              isIgnited
                ? 'Extinguish — stop the autonomous cognitive loop'
                : 'Ignite — start the always-on thermodynamic loop'
            }
          >
            {isIgnited ? '❄ EXTINGUISH' : '🔥 IGNITE'}
          </button>
          <button
            className="spark-btn deep-thought"
            onClick={runDeep}
            disabled={isProcessing}
            title="Autonomous deep thinking — the system reflects on itself"
          >
            {isProcessing && spark.phase === 'evolving'
              ? '◌ THINKING...'
              : '◈ DEEP THOUGHT'}
          </button>
          <button
            className="spark-btn reset"
            onClick={resetSpark}
            disabled={isProcessing}
            title="Reset SPARK kernel to initial state"
          >
            ↺ RESET
          </button>
        </div>

        {/* Input */}
        <div className="spark-input-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleProcess()}
            placeholder="Feed text to SPARK (or 'calculate 2^10 + 42')..."
            className="spark-main-input"
            disabled={isProcessing}
          />
          <button
            className="spark-btn process"
            onClick={handleProcess}
            disabled={isProcessing || !input.trim()}
          >
            {isProcessing && spark.phase === 'thinking'
              ? '◌ PROCESSING...'
              : '⚡ PROCESS'}
          </button>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="spark-dashboard">
        <div className="spark-grid">
          <WorldModelSection />
          <CuriositySection />
          <ReasonerSection />
          <GoalsSection />
          <MetaCognitionSection />
          <TemporalSection />
          <GenomeSection />
          <MetabolismSection />
          <SocialSection />
          <EcologySection />
          <NightCycleTimeline />
        </div>
        <SelfModSection />
        <SparkLog />
      </div>
    </div>
  );
}
