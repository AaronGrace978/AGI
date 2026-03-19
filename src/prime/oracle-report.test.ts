import { describe, expect, it } from 'vitest';
import { createDefaultOracleState, runOraclePipeline } from './oracle';
import { generateDestinyMatrixReport } from './oracle-report';

describe('oracle destiny matrix report', () => {
  it('builds a long-form report from pipeline outputs', () => {
    const state = {
      ...createDefaultOracleState(),
      subject: {
        ...createDefaultOracleState().subject,
        name: 'Aaron',
        fullName: 'AARON ALEXANDER GRACE',
        birthDate: '1992-11-03',
        birthTime: '12:00',
        birthLocationLabel: 'Boston',
        birthLocation: { latitude: 42.3601, longitude: -71.0589 },
      },
    };

    const next = runOraclePipeline(state, { iterations: 900, horizonMonths: 24, seed: 101, targetYear: 2026 });
    const report = next.destinyMatrixReport;
    expect(report).not.toBeNull();
    expect(report?.sections.some((s) => s.title === 'Love Field')).toBe(true);
    expect(report?.sections.some((s) => s.title === 'Career Vector')).toBe(true);
    expect(report?.narrative.includes('Trajectory Synthesis')).toBe(true);
  });

  it('returns a graceful fallback report without overlays', () => {
    const report = generateDestinyMatrixReport({
      subjectName: 'Test Subject',
      horizonMonths: 12,
    });

    expect(report.sections.length).toBeGreaterThan(0);
    expect(report.narrative).toContain('Trajectory Synthesis');
    expect(report.narrative).toContain('No simulation run detected yet');
  });
});

