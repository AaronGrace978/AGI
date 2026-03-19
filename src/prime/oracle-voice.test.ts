import { describe, expect, it } from 'vitest';
import { createDefaultOracleState, runOraclePipeline } from './oracle';
import { computeCommunicationProfile, formatCommunicationProfileForPrompt } from './oracle-voice';

describe('oracle astro-voice communication profile', () => {
  it('generates a profile from a Scorpio Sun birth chart', () => {
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
      },
      { iterations: 500, horizonMonths: 12, seed: 42, targetYear: 2026 },
    );

    const profile = computeCommunicationProfile(state);
    expect(profile).not.toBeNull();
    expect(profile!.active).toBe(true);
    expect(profile!.sunSign).toBe('Scorpio');
    expect(profile!.toneDirectives.length).toBeGreaterThan(3);
    expect(profile!.emphasisAreas.length).toBeGreaterThan(0);
    expect(profile!.avoidPatterns.length).toBeGreaterThan(0);
    expect(profile!.pace).toBe('slow');
  });

  it('returns null when no chart or numerology exists', () => {
    const state = createDefaultOracleState();
    const profile = computeCommunicationProfile(state);
    expect(profile).toBeNull();
  });

  it('formats a profile into a system prompt block', () => {
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
      },
      { iterations: 500, horizonMonths: 12, seed: 7, targetYear: 2026 },
    );

    const profile = computeCommunicationProfile(state);
    expect(profile).not.toBeNull();

    const formatted = formatCommunicationProfileForPrompt(profile!);
    expect(formatted).toContain('ORACLE ASTRO-VOICE');
    expect(formatted).toContain('TONE DIRECTIVES');
    expect(formatted).toContain('Scorpio');
    expect(formatted).toContain('AVOID');
    expect(formatted).toContain('END ASTRO-VOICE');
  });

  it('includes sentiment calibration when loneliness is high', () => {
    const state = runOraclePipeline(
      {
        ...createDefaultOracleState(),
        subject: {
          ...createDefaultOracleState().subject,
          name: 'Test',
          fullName: 'TEST SUBJECT',
          birthDate: '1992-11-03',
          birthTime: '12:00',
          birthLocationLabel: 'Boston',
          birthLocation: { latitude: 42.3601, longitude: -71.0589 },
        },
        sentimentProfile: {
          loneliness: 0.8,
          creativity: 0.9,
          fearOfFailure: 0.7,
          ambition: 0.8,
          hopefulness: 0.3,
          resilience: 0.6,
          socialEnergy: 0.2,
          selfAwareness: 0.75,
          lastUpdated: Date.now(),
        },
      },
      { iterations: 500, horizonMonths: 12, seed: 99, targetYear: 2026 },
    );

    const profile = computeCommunicationProfile(state);
    expect(profile).not.toBeNull();

    const directives = profile!.toneDirectives.join(' ');
    expect(directives).toContain('Loneliness is elevated');
    expect(directives).toContain('Creativity is strong');
    expect(directives).toContain('Social energy is low');
  });
});
