// ═══════════════════════════════════════════════════════════════
//  Hardening Health Panel — Release Posture Checklist
//  Shows a 10-point pre-flight checklist with pass/warn/fail
//  status, overall score, and actionable fix suggestions.
//  Mounted inside the SOVEREIGN panel.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useState } from 'react';
import { useStore } from '../store';
import type { CheckStatus, HealthCheckItem } from '../prime/hardening';

const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: '●',
  warn: '◐',
  fail: '○',
  unknown: '◌',
};

const STATUS_COLORS: Record<CheckStatus, string> = {
  pass: '#00ff41',
  warn: '#ffd700',
  fail: '#ff006e',
  unknown: '#666',
};

export default function HardeningPanel() {
  const report = useStore((s) => s.hardening.report);
  const tests = useStore((s) => s.hardening.tests);
  const hardeningRunCheck = useStore((s) => s.hardeningRunCheck);
  const markTestsPassed = useStore((s) => s.hardeningMarkTestsPassed);
  const markTestsFailed = useStore((s) => s.hardeningMarkTestsFailed);

  const runCheck = useCallback(() => {
    hardeningRunCheck();
  }, [hardeningRunCheck]);

  return (
    <div className="hardening-panel">
      <div className="hardening-header">
        <h3>⛨ HARDENING HEALTH</h3>
        <p>Pre-flight checklist — verify safety posture before runs</p>
      </div>

      <div className="hardening-controls">
        <button className="hardening-btn primary" onClick={runCheck}>
          RUN HEALTH CHECK
        </button>
        <button
          className="hardening-btn"
          onClick={() => markTestsPassed(tests.count || 105)}
          title="Mark tests as passed (after running npm test externally)"
        >
          TESTS PASSED
        </button>
        <button
          className="hardening-btn danger"
          onClick={() => markTestsFailed(tests.count || 105)}
          title="Mark tests as failed"
        >
          TESTS FAILED
        </button>
      </div>

      {report && (
        <div className="hardening-results">
          {/* Score banner */}
          <div className={`hardening-score hardening-score-${report.overallStatus}`}>
            <div className="hardening-score-number">{report.score}</div>
            <div className="hardening-score-label">
              <span>/ 100 HEALTH SCORE</span>
              <span className="hardening-score-status">
                {report.overallStatus === 'pass' ? 'ALL CLEAR' :
                 report.overallStatus === 'warn' ? 'WARNINGS' : 'ISSUES FOUND'}
              </span>
            </div>
          </div>

          {/* Checklist */}
          <div className="hardening-checklist">
            {report.items.map((item) => (
              <ChecklistItem key={item.id} item={item} />
            ))}
          </div>

          <div className="hardening-timestamp">
            Checked at {new Date(report.checkedAt).toLocaleTimeString()}
          </div>
        </div>
      )}

      {!report && (
        <div className="hardening-empty">
          Run a health check to see the safety posture checklist.
        </div>
      )}
    </div>
  );
}

function ChecklistItem({ item }: { item: HealthCheckItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`hardening-item hardening-item-${item.status}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="hardening-item-row">
        <span
          className="hardening-item-icon"
          style={{ color: STATUS_COLORS[item.status] }}
        >
          {STATUS_ICONS[item.status]}
        </span>
        <span className="hardening-item-label">{item.label}</span>
        <span
          className="hardening-item-status"
          style={{ color: STATUS_COLORS[item.status] }}
        >
          {item.status.toUpperCase()}
        </span>
      </div>
      {expanded && (
        <div className="hardening-item-detail">
          <div className="hardening-item-desc">{item.description}</div>
          <div className="hardening-item-info">{item.detail}</div>
        </div>
      )}
    </div>
  );
}
