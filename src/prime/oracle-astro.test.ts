import { describe, expect, it } from 'vitest';
import {
  computeAspects,
  computePlanetaryPositions,
  computeTransits,
  computeZodiacSign,
  generateBirthChart,
} from './oracle-astro';

describe('oracle astro engine', () => {
  it('maps longitude to zodiac sign deterministically', () => {
    expect(computeZodiacSign(0)).toBe('Aries');
    expect(computeZodiacSign(29.9)).toBe('Aries');
    expect(computeZodiacSign(30)).toBe('Taurus');
    expect(computeZodiacSign(210)).toBe('Scorpio');
  });

  it('computes planetary longitudes in valid ranges', () => {
    const positions = computePlanetaryPositions(new Date('2026-04-12T12:00:00.000Z'));
    expect(Object.keys(positions)).toHaveLength(10);
    for (const lon of Object.values(positions)) {
      expect(lon).toBeGreaterThanOrEqual(0);
      expect(lon).toBeLessThan(360);
    }
  });

  it('generates a birth chart with houses and aspects', () => {
    const chart = generateBirthChart({
      birthDate: '1992-11-03',
      birthTime: '12:00',
      birthLocation: { latitude: 42.3601, longitude: -71.0589 },
    });
    expect(chart.planets).toHaveLength(10);
    expect(chart.houses).toHaveLength(12);
    expect(chart.summary.length).toBeGreaterThan(0);
    const sun = chart.planets.find((p) => p.planet === 'Sun');
    expect(sun).toBeDefined();
    expect(['Scorpio', 'Libra']).toContain(sun?.sign); // approximate ephemeris tolerance
    const aspects = computeAspects(chart.planets);
    expect(aspects.length).toBeGreaterThan(0);
  });

  it('computes monthly transit forecast', () => {
    const chart = generateBirthChart({
      birthDate: '1992-11-03',
      birthTime: '12:00',
      birthLocation: { latitude: 42.3601, longitude: -71.0589 },
    });
    const forecast = computeTransits({
      birthChart: chart,
      targetDate: new Date('2026-02-01T12:00:00.000Z'),
      months: 6,
    });
    expect(forecast.months).toHaveLength(6);
    expect(forecast.months[0].monthIso).toBe('2026-02');
  });
});
