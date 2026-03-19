import type { OracleNumerologyProfile, OracleNumerologyValue } from '../types';

const LETTER_TO_NUMBER: Record<string, number> = {
  A: 1, J: 1, S: 1,
  B: 2, K: 2, T: 2,
  C: 3, L: 3, U: 3,
  D: 4, M: 4, V: 4,
  E: 5, N: 5, W: 5,
  F: 6, O: 6, X: 6,
  G: 7, P: 7, Y: 7,
  H: 8, Q: 8, Z: 8,
  I: 9, R: 9,
};

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

interface NumberMeaning {
  love: string;
  career: string;
  life: string;
}

const CORE_MEANINGS: Record<number, NumberMeaning> = {
  1: {
    love: 'Needs autonomy inside partnership; chooses commitment through respect.',
    career: 'Initiator energy; excels when owning direction and decisions.',
    life: 'Learns self-trust through action and independent leadership.',
  },
  2: {
    love: 'Learns mutuality, emotional cooperation, and clean communication.',
    career: 'Grows through collaboration, diplomacy, and strategic alliances.',
    life: 'Balances sensitivity with boundaries; receives support without collapse.',
  },
  3: {
    love: 'Bonding through expression, humor, and emotional openness.',
    career: 'Voice, storytelling, persuasion, and social intelligence drive outcomes.',
    life: 'Needs creativity and movement to prevent emotional stagnation.',
  },
  4: {
    love: 'Seeks reliable loyalty, routine, and practical commitment.',
    career: 'System-builder; thrives in consistency, structure, and mastery.',
    life: 'Finds peace in order, discipline, and sustainable foundations.',
  },
  5: {
    love: 'Needs freedom with honesty; connection must stay alive and adaptive.',
    career: 'Strong in dynamic environments, pivots, communication, and growth.',
    life: 'Learns intentional change over impulsive change.',
  },
  6: {
    love: 'Protective and devoted; must avoid over-carrying others.',
    career: 'Reliable service-leadership; succeeds with clear boundaries.',
    life: 'Builds home-base stability and values-led decisions.',
  },
  7: {
    love: 'Selective intimacy; trust forms through depth and authenticity.',
    career: 'Research, analysis, insight work, and deep problem solving.',
    life: 'Needs solitude, reflection, and meaning-making.',
  },
  8: {
    love: 'Loyalty + respect are non-negotiable; power must stay clean.',
    career: 'Leadership, resources, execution, and long-horizon authority.',
    life: 'Learns to hold responsibility without hardening.',
  },
  9: {
    love: 'Seeks mature bonds grounded in perspective and compassion.',
    career: 'Purpose-driven contribution; integrity outperforms ego games.',
    life: 'Closure, release, and values alignment restore balance.',
  },
};

function sanitizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, '');
}

function reduceNumber(n: number): { core: number; sequence: number[] } {
  const sequence = [n];
  let cur = n;
  while (cur > 9) {
    cur = String(cur)
      .split('')
      .reduce((s, d) => s + Number(d), 0);
    sequence.push(cur);
  }
  return { core: cur, sequence };
}

function valueForCore(core: number, label: string, compound?: number, sequence?: number[]): OracleNumerologyValue {
  const fallback: NumberMeaning = {
    love: 'Relationship themes are still forming.',
    career: 'Career themes are still forming.',
    life: 'Life themes are still forming.',
  };
  return {
    core,
    compound,
    sequence,
    label,
    interpretation: CORE_MEANINGS[core] || fallback,
  };
}

function toDateParts(birthDate: string): { year: number; month: number; day: number; digits: number[] } {
  const [y, m, d] = birthDate.split('-').map((p) => Number(p));
  const digits = `${String(y).padStart(4, '0')}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`
    .split('')
    .map((c) => Number(c));
  return { year: y, month: m, day: d, digits };
}

export function computeLifePath(birthDate: string): OracleNumerologyValue {
  const { digits } = toDateParts(birthDate);
  const total = digits.reduce((s, v) => s + v, 0);
  const reduced = reduceNumber(total);
  return valueForCore(reduced.core, 'Life Path', total, reduced.sequence);
}

export function computeExpression(fullName: string): OracleNumerologyValue {
  const clean = sanitizeName(fullName);
  const total = clean.split('').reduce((s, ch) => s + (LETTER_TO_NUMBER[ch] || 0), 0);
  const reduced = reduceNumber(total);
  return valueForCore(reduced.core, 'Expression', total, reduced.sequence);
}

export function computeSoulUrge(fullName: string): OracleNumerologyValue {
  const clean = sanitizeName(fullName);
  const total = clean
    .split('')
    .filter((ch) => VOWELS.has(ch))
    .reduce((s, ch) => s + (LETTER_TO_NUMBER[ch] || 0), 0);
  const reduced = reduceNumber(total);
  return valueForCore(reduced.core, 'Soul Urge', total, reduced.sequence);
}

export function computePersonality(fullName: string): OracleNumerologyValue {
  const clean = sanitizeName(fullName);
  const total = clean
    .split('')
    .filter((ch) => !VOWELS.has(ch))
    .reduce((s, ch) => s + (LETTER_TO_NUMBER[ch] || 0), 0);
  const reduced = reduceNumber(total);
  return valueForCore(reduced.core, 'Personality', total, reduced.sequence);
}

export function computeBirthdayNumber(birthDate: string): OracleNumerologyValue {
  const { day } = toDateParts(birthDate);
  const reduced = reduceNumber(day);
  return valueForCore(reduced.core, 'Birthday', day, reduced.sequence);
}

export function computeMaturity(
  lifePath: OracleNumerologyValue,
  expression: OracleNumerologyValue,
): OracleNumerologyValue {
  const compound = lifePath.core + expression.core;
  const reduced = reduceNumber(compound);
  return valueForCore(reduced.core, 'Maturity', compound, reduced.sequence);
}

export function computePersonalYear(birthDate: string, targetYear: number): OracleNumerologyValue {
  const { month, day } = toDateParts(birthDate);
  const universalYear = reduceNumber(String(targetYear).split('').reduce((s, d) => s + Number(d), 0)).core;
  const compound = universalYear + month + day;
  const reduced = reduceNumber(compound);
  return valueForCore(reduced.core, `Personal Year ${targetYear}`, compound, reduced.sequence);
}

export function computeHiddenPassions(fullName: string): number[] {
  const clean = sanitizeName(fullName);
  const freq = new Map<number, number>();
  for (const ch of clean) {
    const n = LETTER_TO_NUMBER[ch];
    if (!n) continue;
    freq.set(n, (freq.get(n) || 0) + 1);
  }
  let max = 0;
  for (const count of freq.values()) max = Math.max(max, count);
  return [...freq.entries()]
    .filter(([, count]) => count === max)
    .map(([num]) => num)
    .sort((a, b) => a - b);
}

export function computeKarmicLessons(fullName: string): number[] {
  const clean = sanitizeName(fullName);
  const present = new Set<number>();
  for (const ch of clean) {
    const n = LETTER_TO_NUMBER[ch];
    if (n) present.add(n);
  }
  const missing: number[] = [];
  for (let i = 1; i <= 9; i += 1) {
    if (!present.has(i)) missing.push(i);
  }
  return missing;
}

export function computeBalanceNumber(fullName: string): number {
  const initials = fullName
    .trim()
    .split(/\s+/)
    .map((part) => sanitizeName(part).slice(0, 1))
    .filter(Boolean);
  const total = initials.reduce((s, ch) => s + (LETTER_TO_NUMBER[ch] || 0), 0);
  return reduceNumber(total).core;
}

export function generateNumerologyProfile(params: {
  fullName: string;
  birthDate: string;
  targetYear?: number;
}): OracleNumerologyProfile {
  const targetYear = params.targetYear ?? new Date().getUTCFullYear();
  const lifePath = computeLifePath(params.birthDate);
  const expression = computeExpression(params.fullName);
  const soulUrge = computeSoulUrge(params.fullName);
  const personality = computePersonality(params.fullName);
  const birthday = computeBirthdayNumber(params.birthDate);
  const maturity = computeMaturity(lifePath, expression);
  const personalYear = computePersonalYear(params.birthDate, targetYear);
  const hiddenPassions = computeHiddenPassions(params.fullName);
  const karmicLessons = computeKarmicLessons(params.fullName);
  const balanceNumber = computeBalanceNumber(params.fullName);

  return {
    generatedAt: Date.now(),
    fullName: params.fullName,
    lifePath,
    expression,
    soulUrge,
    personality,
    birthday,
    maturity,
    personalYear,
    hiddenPassions,
    karmicLessons,
    balanceNumber,
    synthesis: [
      `Core axis: Life Path ${lifePath.compound ?? lifePath.core}/${lifePath.core}, Expression ${expression.compound ?? expression.core}/${expression.core}.`,
      `Current cycle: Personal Year ${personalYear.compound ?? personalYear.core}/${personalYear.core}.`,
      `Hidden passions: ${hiddenPassions.join(', ') || 'none'}; karmic lessons: ${karmicLessons.join(', ') || 'none'}.`,
    ],
  };
}

