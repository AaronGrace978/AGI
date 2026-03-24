import type {
  OracleArchetypeId,
  OracleArchetypeSignal,
  OracleLifeDomain,
  OracleNumerologyProfile,
  OracleSentimentProfile,
  OracleTransitForecast,
  OracleTransitSignal,
} from '../types';

interface ArchetypeDef {
  id: OracleArchetypeId;
  label: string;
  domains: OracleLifeDomain[];
}

const ARCHETYPES: ArchetypeDef[] = [
  { id: 'magician', label: 'The Magician', domains: ['creativity', 'career'] },
  { id: 'high_priestess', label: 'The High Priestess', domains: ['growth', 'health'] },
  { id: 'empress', label: 'The Empress', domains: ['relationships', 'social'] },
  { id: 'emperor', label: 'The Emperor', domains: ['career', 'financial'] },
  { id: 'hierophant', label: 'The Hierophant', domains: ['growth', 'social'] },
  { id: 'lovers', label: 'The Lovers', domains: ['relationships'] },
  { id: 'chariot', label: 'The Chariot', domains: ['career', 'growth'] },
  { id: 'strength', label: 'Strength', domains: ['health', 'growth'] },
  { id: 'hermit', label: 'The Hermit', domains: ['growth', 'health'] },
  { id: 'wheel_of_fortune', label: 'Wheel of Fortune', domains: ['career', 'financial'] },
  { id: 'justice', label: 'Justice', domains: ['career', 'relationships'] },
  { id: 'hanged_man', label: 'The Hanged Man', domains: ['growth', 'career'] },
  { id: 'death', label: 'Death', domains: ['growth', 'career'] },
  { id: 'temperance', label: 'Temperance', domains: ['relationships', 'health'] },
  { id: 'devil', label: 'The Devil', domains: ['financial', 'relationships'] },
  { id: 'tower', label: 'The Tower', domains: ['career', 'relationships'] },
  { id: 'star', label: 'The Star', domains: ['health', 'growth', 'career'] },
  { id: 'moon', label: 'The Moon', domains: ['health', 'relationships'] },
  { id: 'sun', label: 'The Sun', domains: ['growth', 'social'] },
  { id: 'judgement', label: 'Judgement', domains: ['growth', 'career'] },
  { id: 'world', label: 'The World', domains: ['career', 'social'] },
  { id: 'five_of_pentacles', label: 'Five of Pentacles', domains: ['career', 'financial'] },
  { id: 'king_of_cups', label: 'King of Cups', domains: ['relationships', 'growth'] },
  { id: 'seven_of_cups_reversed', label: 'Seven of Cups (Reversed)', domains: ['growth', 'career'] },
  { id: 'three_of_pentacles_reversed', label: 'Three of Pentacles (Reversed)', domains: ['career', 'social'] },
  { id: 'hierophant_reversed', label: 'Hierophant (Reversed)', domains: ['career', 'social'] },
  { id: 'emperor_reversed', label: 'Emperor (Reversed)', domains: ['career'] },
  { id: 'six_of_wands_reversed', label: 'Six of Wands (Reversed)', domains: ['career', 'social'] },
  { id: 'queen_of_pentacles', label: 'Queen of Pentacles', domains: ['career', 'financial'] },
  { id: 'page_of_swords', label: 'Page of Swords', domains: ['social', 'career'] },
  { id: 'temperance_card', label: 'Temperance (Bridge Builder)', domains: ['relationships', 'career'] },
  { id: 'ace_of_pentacles', label: 'Ace of Pentacles', domains: ['career', 'financial'] },
  { id: 'two_of_wands', label: 'Two of Wands', domains: ['career', 'growth'] },
  { id: 'knight_of_pentacles', label: 'Knight of Pentacles', domains: ['career', 'health'] },
  { id: 'ten_of_wands', label: 'Ten of Wands', domains: ['health', 'career'] },
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function avg(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((s, n) => s + n, 0) / vals.length;
}

function recentTransitSignals(transits: OracleTransitForecast | null | undefined): OracleTransitSignal[] {
  if (!transits?.months?.length) return [];
  return transits.months.slice(0, 3).flatMap((m) => m.signals);
}

function transitBias(transits: OracleTransitForecast | null | undefined): { positive: number; negative: number } {
  const signals = recentTransitSignals(transits);
  if (!signals.length) return { positive: 0, negative: 0 };
  const positive = avg(signals.filter((s) => s.weight > 0).map((s) => s.weight));
  const negative = avg(signals.filter((s) => s.weight < 0).map((s) => Math.abs(s.weight)));
  return { positive: clamp01(positive), negative: clamp01(negative) };
}

function numerologyBias(numerology: OracleNumerologyProfile | null | undefined): {
  structure: number;
  freedom: number;
  relationship: number;
} {
  if (!numerology) return { structure: 0.5, freedom: 0.5, relationship: 0.5 };
  const core = numerology.personalYear.core;
  const structure = core === 4 || core === 8 ? 0.8 : core === 1 ? 0.65 : 0.5;
  const relationship = core === 2 || core === 6 ? 0.82 : 0.45;
  const freedom = numerology.hiddenPassions.includes(5) ? 0.8 : 0.45;
  return { structure, freedom, relationship };
}

function scoreArchetype(
  id: OracleArchetypeId,
  sentiment: OracleSentimentProfile,
  tBias: { positive: number; negative: number },
  nBias: { structure: number; freedom: number; relationship: number },
): number {
  const s = sentiment;
  switch (id) {
    case 'magician':
      return clamp01(s.creativity * 0.45 + s.ambition * 0.35 + s.resilience * 0.2);
    case 'strength':
      return clamp01(s.resilience * 0.4 + s.hopefulness * 0.3 + s.selfAwareness * 0.3);
    case 'star':
      return clamp01(s.hopefulness * 0.5 + s.selfAwareness * 0.3 + tBias.positive * 0.2);
    case 'hermit':
      return clamp01(s.loneliness * 0.5 + (1 - s.socialEnergy) * 0.3 + s.selfAwareness * 0.2);
    case 'five_of_pentacles':
      return clamp01(s.loneliness * 0.5 + s.fearOfFailure * 0.3 + (1 - s.hopefulness) * 0.2);
    case 'king_of_cups':
      return clamp01(s.selfAwareness * 0.45 + s.resilience * 0.3 + (1 - s.fearOfFailure) * 0.25);
    case 'seven_of_cups_reversed':
      return clamp01(
        s.selfAwareness * 0.35 + s.creativity * 0.25 + (1 - s.hopefulness) * 0.15 + nBias.structure * 0.25,
      );
    case 'three_of_pentacles_reversed':
      return clamp01((1 - s.socialEnergy) * 0.4 + s.ambition * 0.3 + s.loneliness * 0.3);
    case 'six_of_wands_reversed':
      return clamp01(s.ambition * 0.35 + s.loneliness * 0.35 + (1 - s.socialEnergy) * 0.3);
    case 'queen_of_pentacles':
      return clamp01(s.resilience * 0.35 + nBias.structure * 0.35 + s.hopefulness * 0.3);
    case 'page_of_swords':
      return clamp01(s.creativity * 0.3 + s.selfAwareness * 0.3 + s.socialEnergy * 0.15 + tBias.positive * 0.25);
    case 'temperance_card':
    case 'temperance':
      return clamp01(s.selfAwareness * 0.3 + s.socialEnergy * 0.25 + s.hopefulness * 0.2 + nBias.relationship * 0.25);
    case 'ace_of_pentacles':
      return clamp01(s.ambition * 0.35 + s.resilience * 0.25 + tBias.positive * 0.4);
    case 'two_of_wands':
      return clamp01(s.ambition * 0.4 + s.creativity * 0.25 + s.hopefulness * 0.2 + nBias.freedom * 0.15);
    case 'knight_of_pentacles':
      return clamp01(s.resilience * 0.35 + nBias.structure * 0.4 + (1 - s.socialEnergy) * 0.05 + s.ambition * 0.2);
    case 'ten_of_wands':
      return clamp01(s.ambition * 0.35 + s.fearOfFailure * 0.3 + s.loneliness * 0.2 + tBias.negative * 0.15);
    case 'tower':
      return clamp01(tBias.negative * 0.55 + s.fearOfFailure * 0.25 + (1 - s.hopefulness) * 0.2);
    case 'moon':
      return clamp01((1 - s.selfAwareness) * 0.3 + s.fearOfFailure * 0.4 + tBias.negative * 0.3);
    case 'sun':
      return clamp01(s.hopefulness * 0.45 + s.creativity * 0.25 + tBias.positive * 0.3);
    case 'emperor':
      return clamp01(nBias.structure * 0.45 + s.ambition * 0.35 + s.selfAwareness * 0.2);
    case 'emperor_reversed':
      return clamp01(tBias.negative * 0.35 + s.fearOfFailure * 0.35 + s.ambition * 0.3);
    case 'hierophant_reversed':
      return clamp01(s.selfAwareness * 0.3 + s.creativity * 0.2 + tBias.negative * 0.2 + nBias.freedom * 0.3);
    case 'world':
      return clamp01(s.hopefulness * 0.3 + s.resilience * 0.25 + tBias.positive * 0.45);
    case 'judgement':
      return clamp01(s.selfAwareness * 0.45 + s.hopefulness * 0.25 + nBias.structure * 0.3);
    case 'chariot':
      return clamp01(s.ambition * 0.45 + s.resilience * 0.35 + s.fearOfFailure * 0.05 + nBias.structure * 0.15);
    case 'devil':
      return clamp01(s.fearOfFailure * 0.4 + s.loneliness * 0.2 + tBias.negative * 0.4);
    case 'lovers':
      return clamp01(nBias.relationship * 0.45 + s.socialEnergy * 0.35 + s.hopefulness * 0.2);
    case 'high_priestess':
      return clamp01(s.selfAwareness * 0.5 + (1 - s.socialEnergy) * 0.15 + s.creativity * 0.2 + tBias.positive * 0.15);
    case 'empress':
      return clamp01(s.socialEnergy * 0.35 + s.hopefulness * 0.3 + nBias.relationship * 0.35);
    case 'hanged_man':
      return clamp01((1 - s.socialEnergy) * 0.2 + s.selfAwareness * 0.4 + tBias.negative * 0.4);
    case 'death':
      return clamp01(s.selfAwareness * 0.3 + s.resilience * 0.25 + tBias.negative * 0.2 + tBias.positive * 0.25);
    case 'justice':
      return clamp01(s.selfAwareness * 0.3 + nBias.structure * 0.45 + s.socialEnergy * 0.25);
    case 'wheel_of_fortune':
      return clamp01(tBias.positive * 0.5 + nBias.freedom * 0.2 + s.hopefulness * 0.3);
    default:
      return 0.2;
  }
}

function buildRationale(
  id: OracleArchetypeId,
  sentiment: OracleSentimentProfile,
  tBias: { positive: number; negative: number },
): string {
  if (id === 'five_of_pentacles') {
    return `High isolation pressure (loneliness ${(sentiment.loneliness * 100).toFixed(0)}%, fear ${(sentiment.fearOfFailure * 100).toFixed(0)}%).`;
  }
  if (id === 'magician') {
    return `Builder signature active (creativity ${(sentiment.creativity * 100).toFixed(0)}%, ambition ${(sentiment.ambition * 100).toFixed(0)}%).`;
  }
  if (id === 'ten_of_wands') {
    return `Load-bearing risk pattern detected (fear ${(sentiment.fearOfFailure * 100).toFixed(0)}%, negative transits ${(tBias.negative * 100).toFixed(0)}%).`;
  }
  if (id === 'star') {
    return `Recovery/hope signal is elevated (hope ${(sentiment.hopefulness * 100).toFixed(0)}%, positive transits ${(tBias.positive * 100).toFixed(0)}%).`;
  }
  return `Pattern match from sentiment + transit vectors.`;
}

export function computeArchetypeSignals(params: {
  sentiment: OracleSentimentProfile;
  transits?: OracleTransitForecast | null;
  numerology?: OracleNumerologyProfile | null;
  topK?: number;
}): OracleArchetypeSignal[] {
  const tBias = transitBias(params.transits);
  const nBias = numerologyBias(params.numerology);
  const scored = ARCHETYPES.map((a) => {
    const score = scoreArchetype(a.id, params.sentiment, tBias, nBias);
    return {
      id: a.id,
      label: a.label,
      score: Number(score.toFixed(3)),
      rationale: buildRationale(a.id, params.sentiment, tBias),
      domains: a.domains,
    } satisfies OracleArchetypeSignal;
  });
  const topK = Math.max(1, params.topK ?? 8);
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
