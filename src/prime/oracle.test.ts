import { describe, expect, it } from 'vitest';
import type { OracleLifeEvent, OracleSentimentProfile, OracleSocialNode } from '../types';
import { computeDomainModifiers, createDefaultOracleState, runMonteCarloSimulation, runOraclePipeline } from './oracle';

const BASE_SENTIMENT: OracleSentimentProfile = {
  loneliness: 0.62,
  creativity: 0.84,
  fearOfFailure: 0.58,
  ambition: 0.78,
  hopefulness: 0.56,
  resilience: 0.61,
  socialEnergy: 0.42,
  selfAwareness: 0.74,
  lastUpdated: Date.now(),
};

const BASE_EVENTS: OracleLifeEvent[] = [
  {
    id: 'ev1',
    label: 'Strict family pressure around degree',
    domain: 'growth',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 365,
    sentiment: -0.4,
    significance: 0.8,
    description: 'Fear of failure from early expectations.',
  },
  {
    id: 'ev2',
    label: 'Built AGI project obsessively',
    domain: 'creativity',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30,
    sentiment: 0.5,
    significance: 0.9,
    description: 'Deep creative output despite stress.',
  },
];

const BASE_SOCIAL: OracleSocialNode[] = [
  {
    id: 'n1',
    label: 'Quiet supporter',
    relationship: 'friend',
    influence: 0.35,
    sentimentMatch: 0.8,
    lastInteraction: Date.now() - 1000 * 60 * 60 * 24 * 3,
    notes: 'Provides grounded perspective.',
  },
];

describe('oracle hybrid pipeline', () => {
  it('runs full forecast with overlays and produces outputs', () => {
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
      lifeEvents: BASE_EVENTS,
      sentimentProfile: BASE_SENTIMENT,
      socialGraph: BASE_SOCIAL,
    };

    const next = runOraclePipeline(state, { iterations: 1200, horizonMonths: 24, seed: 42, targetYear: 2026 });
    expect(next.activeForecast).not.toBeNull();
    expect(next.birthChart).not.toBeNull();
    expect(next.numerology).not.toBeNull();
    expect(next.transits).not.toBeNull();
    expect(next.activeArchetypes.length).toBeGreaterThan(0);
    expect(next.destinyMatrixReport).not.toBeNull();
    expect(next.destinyMatrixReport?.sections.length).toBeGreaterThanOrEqual(5);
    expect(next.logs.length).toBeGreaterThan(0);
  });

  it('domain modifiers are derived from overlays', () => {
    const state = runOraclePipeline(
      {
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
        lifeEvents: BASE_EVENTS,
        sentimentProfile: BASE_SENTIMENT,
        socialGraph: BASE_SOCIAL,
      },
      { iterations: 800, horizonMonths: 12, seed: 7, targetYear: 2026 },
    );
    const out = computeDomainModifiers(state);
    expect(Object.keys(out.modifiers).length).toBeGreaterThan(0);
    expect(out.narrativeTags.length).toBeGreaterThan(0);
  });

  it('positive career modifiers reduce burnout branch probability', () => {
    const base = runMonteCarloSimulation(
      { iterations: 3000, horizonMonths: 24, seed: 123 },
      BASE_EVENTS,
      BASE_SENTIMENT,
      BASE_SOCIAL,
    );
    const boosted = runMonteCarloSimulation(
      {
        iterations: 3000,
        horizonMonths: 24,
        seed: 123,
        domainModifiers: { career: 0.25 },
        narrativeTags: ['Career opportunity window'],
      },
      BASE_EVENTS,
      BASE_SENTIMENT,
      BASE_SOCIAL,
    );

    const burnoutBase = base.branches.find((b) => b.domain === 'career' && b.label === 'Burnout spiral');
    const burnoutBoosted = boosted.branches.find((b) => b.domain === 'career' && b.label === 'Burnout spiral');
    expect(burnoutBase).toBeDefined();
    expect(burnoutBoosted).toBeDefined();
    expect(burnoutBoosted?.probability || 0).toBeLessThan(burnoutBase?.probability || 1);
  });
});
