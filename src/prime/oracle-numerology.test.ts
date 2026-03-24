import { describe, expect, it } from 'vitest';
import {
  computeBalanceNumber,
  computeBirthdayNumber,
  computeExpression,
  computeHiddenPassions,
  computeKarmicLessons,
  computeLifePath,
  computeMaturity,
  computePersonalYear,
  computePersonality,
  computeSoulUrge,
  generateNumerologyProfile,
} from './oracle-numerology';

const NAME = 'AARON ALEXANDER GRACE';
const DOB = '1992-11-03';

describe('oracle numerology engine', () => {
  it('matches expected core numbers for Aaron profile', () => {
    const lifePath = computeLifePath(DOB);
    expect(lifePath.compound).toBe(26);
    expect(lifePath.core).toBe(8);

    const expression = computeExpression(NAME);
    expect(expression.compound).toBe(86);
    expect(expression.core).toBe(5);

    const soulUrge = computeSoulUrge(NAME);
    expect(soulUrge.compound).toBe(26);
    expect(soulUrge.core).toBe(8);

    const personality = computePersonality(NAME);
    expect(personality.compound).toBe(60);
    expect(personality.core).toBe(6);

    const birthday = computeBirthdayNumber(DOB);
    expect(birthday.core).toBe(3);

    const maturity = computeMaturity(lifePath, expression);
    expect(maturity.compound).toBe(13);
    expect(maturity.core).toBe(4);

    const personalYear = computePersonalYear(DOB, 2026);
    expect(personalYear.compound).toBe(15);
    expect(personalYear.core).toBe(6);
  });

  it('computes hidden passions, karmic lessons, and balance number', () => {
    expect(computeHiddenPassions(NAME)).toEqual([1, 5]);
    expect(computeKarmicLessons(NAME)).toEqual([2, 8]);
    expect(computeBalanceNumber(NAME)).toBe(9);
  });

  it('builds full numerology profile', () => {
    const profile = generateNumerologyProfile({
      fullName: NAME,
      birthDate: DOB,
      targetYear: 2026,
    });
    expect(profile.lifePath.core).toBe(8);
    expect(profile.personalYear.core).toBe(6);
    expect(profile.hiddenPassions).toEqual([1, 5]);
    expect(profile.karmicLessons).toEqual([2, 8]);
    expect(profile.synthesis.length).toBeGreaterThan(0);
  });
});
