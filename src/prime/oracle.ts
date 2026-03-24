// ═══════════════════════════════════════════════════════════════
//  ORACLE — Psychic Prime: Life Trajectory Prediction Engine
//  Data + patterns + logic. Like weather, but for souls.
//  No tarot. No stars. Just cold, brutal prediction.
//
//  Ingests: life events, sentiment, social graph, text analysis
//  Outputs: probabilistic life trajectories via Monte Carlo sims
//
//  Created for AGI PRIME by Aaron Grace.
// ═══════════════════════════════════════════════════════════════

import type {
  OracleState,
  OracleLifeEvent,
  OracleSentimentProfile,
  OracleSocialNode,
  OracleTrajectoryBranch,
  OracleSimulationRun,
  OracleLifeDomain,
  OracleFeedbackEntry,
  OraclePhase,
} from '../types';
import { computeArchetypeSignals } from './oracle-archetypes';
import { generateBirthChart, computeTransits } from './oracle-astro';
import { generateNumerologyProfile } from './oracle-numerology';
import { generateDestinyMatrixReport } from './oracle-report';
import { computeCommunicationProfile } from './oracle-voice';

// ─── Defaults ────────────────────────────────────────────────

export function createDefaultOracleState(): OracleState {
  return {
    active: false,
    phase: 'idle',
    subject: {
      name: '',
      fullName: '',
      birthDate: '',
      birthTime: '12:00',
      birthLocationLabel: 'Unknown',
      birthLocation: { latitude: 42.3601, longitude: -71.0589 },
      baselineDescription: '',
    },
    activeOverlays: {
      astrology: true,
      numerology: true,
      archetypes: true,
    },
    lifeEvents: [],
    sentimentProfile: createDefaultSentiment(),
    socialGraph: [],
    simulations: [],
    activeForecast: null,
    birthChart: null,
    transits: null,
    numerology: null,
    activeArchetypes: [],
    destinyMatrixReport: null,
    communicationProfile: null,
    astroVoiceEnabled: false,
    feedback: [],
    calibrationScore: 0.5,
    totalSimulations: 0,
    logs: [],
    lastRunAt: null,
  };
}

export function createDefaultSentiment(): OracleSentimentProfile {
  return {
    loneliness: 0.5,
    creativity: 0.5,
    fearOfFailure: 0.5,
    ambition: 0.5,
    hopefulness: 0.5,
    resilience: 0.5,
    socialEnergy: 0.5,
    selfAwareness: 0.5,
    lastUpdated: Date.now(),
  };
}

// ─── Deterministic RNG (Mulberry32) for reproducible sims ────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Sentiment Analysis (NLP-lite on text) ───────────────────

const SENTIMENT_LEXICON: Record<string, Partial<Record<keyof OracleSentimentProfile, number>>> = {
  alone: { loneliness: 0.15, socialEnergy: -0.1 },
  lonely: { loneliness: 0.2, socialEnergy: -0.15 },
  isolated: { loneliness: 0.18, socialEnergy: -0.12 },
  nobody: { loneliness: 0.12 },
  create: { creativity: 0.15, ambition: 0.08 },
  build: { creativity: 0.12, ambition: 0.1, resilience: 0.05 },
  code: { creativity: 0.1, ambition: 0.08 },
  design: { creativity: 0.14 },
  invent: { creativity: 0.18, ambition: 0.12 },
  scared: { fearOfFailure: 0.15, resilience: -0.05 },
  afraid: { fearOfFailure: 0.18, hopefulness: -0.08 },
  fail: { fearOfFailure: 0.12 },
  terrified: { fearOfFailure: 0.22, resilience: -0.1 },
  bum: { fearOfFailure: 0.14, hopefulness: -0.12 },
  hope: { hopefulness: 0.15, resilience: 0.08 },
  dream: { hopefulness: 0.12, creativity: 0.1 },
  believe: { hopefulness: 0.1, resilience: 0.06 },
  survive: { resilience: 0.18 },
  persist: { resilience: 0.15, ambition: 0.08 },
  fight: { resilience: 0.14, ambition: 0.1 },
  overcome: { resilience: 0.2, hopefulness: 0.1 },
  ambition: { ambition: 0.18 },
  succeed: { ambition: 0.15, hopefulness: 0.1 },
  drive: { ambition: 0.12 },
  goal: { ambition: 0.1 },
  aware: { selfAwareness: 0.12 },
  reflect: { selfAwareness: 0.15 },
  realize: { selfAwareness: 0.14, hopefulness: 0.05 },
  understand: { selfAwareness: 0.1 },
  party: { socialEnergy: 0.15, loneliness: -0.08 },
  friend: { socialEnergy: 0.12, loneliness: -0.1 },
  love: { socialEnergy: 0.1, hopefulness: 0.12, loneliness: -0.12 },
  connect: { socialEnergy: 0.14, loneliness: -0.1 },
  hate: { loneliness: 0.08, hopefulness: -0.1 },
  angry: { resilience: 0.05, socialEnergy: -0.08 },
  burnout: { resilience: -0.15, hopefulness: -0.12, ambition: -0.1 },
  exhausted: { resilience: -0.1, hopefulness: -0.08 },
  proud: { selfAwareness: 0.1, hopefulness: 0.12, ambition: 0.08 },
  grew: { resilience: 0.12, selfAwareness: 0.1 },
  pain: { resilience: 0.08, fearOfFailure: 0.05 },
  lost: { loneliness: 0.1, fearOfFailure: 0.08, hopefulness: -0.06 },
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function analyzeSentimentFromText(text: string, currentProfile: OracleSentimentProfile): OracleSentimentProfile {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/);
  const deltas: Record<string, number> = {};

  for (const word of words) {
    const signals = SENTIMENT_LEXICON[word];
    if (!signals) continue;
    for (const [key, delta] of Object.entries(signals)) {
      deltas[key] = (deltas[key] || 0) + (delta as number);
    }
  }

  const dampening = 0.3;
  const updated = { ...currentProfile, lastUpdated: Date.now() };
  for (const [key, delta] of Object.entries(deltas)) {
    const k = key as keyof OracleSentimentProfile;
    if (k === 'lastUpdated') continue;
    const current = updated[k] as number;
    updated[k] = clamp01(current + delta * dampening) as never;
  }

  return updated;
}

// ─── Life Event Scoring ──────────────────────────────────────

export function computeLifeArcMomentum(events: OracleLifeEvent[]): Record<OracleLifeDomain, number> {
  const momentum: Record<OracleLifeDomain, number> = {
    career: 0,
    relationships: 0,
    health: 0,
    creativity: 0,
    growth: 0,
    social: 0,
    financial: 0,
  };

  if (events.length === 0) return momentum;

  const now = Date.now();
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  for (const event of sorted) {
    const ageMs = now - event.timestamp;
    const decayYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
    const recencyWeight = Math.exp(-0.3 * decayYears);
    const contribution = event.sentiment * event.significance * recencyWeight;
    momentum[event.domain] += contribution;
  }

  for (const domain of Object.keys(momentum) as OracleLifeDomain[]) {
    momentum[domain] = Math.max(-1, Math.min(1, momentum[domain]));
  }

  return momentum;
}

// ─── Social Graph Compatibility ──────────────────────────────

export function computeSocialInfluence(graph: OracleSocialNode[]): {
  netInfluence: number;
  topPositive: OracleSocialNode | null;
  topNegative: OracleSocialNode | null;
  isolationRisk: number;
} {
  if (graph.length === 0) {
    return { netInfluence: 0, topPositive: null, topNegative: null, isolationRisk: 1 };
  }

  let total = 0;
  let topPos: OracleSocialNode | null = null;
  let topNeg: OracleSocialNode | null = null;

  for (const node of graph) {
    total += node.influence;
    if (!topPos || node.influence > topPos.influence) topPos = node;
    if (!topNeg || node.influence < topNeg.influence) topNeg = node;
  }

  const activeNodes = graph.filter((n) => Date.now() - n.lastInteraction < 90 * 24 * 60 * 60 * 1000).length;
  const isolationRisk = clamp01(1 - activeNodes / Math.max(3, graph.length));

  return {
    netInfluence: Math.max(-1, Math.min(1, total / graph.length)),
    topPositive: topPos,
    topNegative: (topNeg?.influence ?? 0 < 0) ? topNeg : null,
    isolationRisk,
  };
}

// ─── Monte Carlo Life Simulation ─────────────────────────────

interface SimulationConfig {
  iterations: number;
  horizonMonths: number;
  seed?: number;
  domainModifiers?: Partial<Record<OracleLifeDomain, number>>;
  narrativeTags?: string[];
}

const DOMAIN_TEMPLATES: Record<OracleLifeDomain, OracleTrajectoryBranch[]> = {
  career: [
    {
      id: '',
      label: 'Quiet tech gig',
      domain: 'career',
      probability: 0,
      horizonMonths: 0,
      description: 'Land a steady role — healthcare AI, enterprise, no hype. Build quietly, ship real things.',
      triggers: ['consistent portfolio', 'niche focus', 'interview prep'],
      sentiment: 0.6,
    },
    {
      id: '',
      label: 'Solo founder',
      domain: 'career',
      probability: 0,
      horizonMonths: 0,
      description: 'Go independent. Your project gains traction, users find you, revenue trickles in.',
      triggers: ['public launch', '10k+ users', 'monetization strategy'],
      sentiment: 0.75,
    },
    {
      id: '',
      label: 'Burnout spiral',
      domain: 'career',
      probability: 0,
      horizonMonths: 0,
      description: 'Carrying too much alone. Energy depletes. Need to pause, restructure, find support.',
      triggers: ['isolation', 'no revenue', 'overwork'],
      sentiment: -0.5,
    },
    {
      id: '',
      label: 'Unexpected pivot',
      domain: 'career',
      probability: 0,
      horizonMonths: 0,
      description: 'A field you never considered pulls you in — education, art-tech, public sector.',
      triggers: ['random opportunity', 'mentor encounter', 'skill crossover'],
      sentiment: 0.4,
    },
  ],
  relationships: [
    {
      id: '',
      label: 'Connection found',
      domain: 'relationships',
      probability: 0,
      horizonMonths: 0,
      description: "Someone sees the depth. Dark hair, quiet, reads. She doesn't flinch at the real you.",
      triggers: ['vulnerability', 'authentic posting', 'showing up'],
      sentiment: 0.85,
    },
    {
      id: '',
      label: 'Alone but at peace',
      domain: 'relationships',
      probability: 0,
      horizonMonths: 0,
      description: 'No partner, but not lonely. You built your world — the AI, the projects, the cabin.',
      triggers: ['self-sufficiency', 'creative fulfillment', 'letting go'],
      sentiment: 0.3,
    },
    {
      id: '',
      label: 'Surface connections',
      domain: 'relationships',
      probability: 0,
      horizonMonths: 0,
      description: 'People around, but no depth. Acquaintances, not allies. The loneliness persists.',
      triggers: ['avoiding vulnerability', 'performative socializing'],
      sentiment: -0.3,
    },
  ],
  health: [
    {
      id: '',
      label: 'Steady baseline',
      domain: 'health',
      probability: 0,
      horizonMonths: 0,
      description: 'No major changes — energy fluctuates with stress but holds.',
      triggers: ['sleep consistency', 'basic movement'],
      sentiment: 0.2,
    },
    {
      id: '',
      label: 'Stress accumulation',
      domain: 'health',
      probability: 0,
      horizonMonths: 0,
      description: 'Chronic tension from uncertainty compounds. Needs intervention — routine, rest, support.',
      triggers: ['prolonged uncertainty', 'poor sleep', 'isolation'],
      sentiment: -0.4,
    },
  ],
  creativity: [
    {
      id: '',
      label: 'Creative surge',
      domain: 'creativity',
      probability: 0,
      horizonMonths: 0,
      description: 'The weird tools keep coming. DinoClaw, AGI Prime — the obsession becomes the product.',
      triggers: ['consistent building', 'ignoring critics', 'shipping'],
      sentiment: 0.8,
    },
    {
      id: '',
      label: 'Creative block',
      domain: 'creativity',
      probability: 0,
      horizonMonths: 0,
      description: 'Too many ideas, nothing lands. Paralysis from perfectionism or fear of irrelevance.',
      triggers: ['comparison', 'scope creep', 'no feedback loop'],
      sentiment: -0.3,
    },
  ],
  growth: [
    {
      id: '',
      label: 'Gradual ascent',
      domain: 'growth',
      probability: 0,
      horizonMonths: 0,
      description:
        'Skills compound. Each loop adds clarity. You stop begging rooms to notice and start choosing rooms.',
      triggers: ['consistent effort', 'feedback integration', 'mentorship'],
      sentiment: 0.6,
    },
    {
      id: '',
      label: 'Plateau',
      domain: 'growth',
      probability: 0,
      horizonMonths: 0,
      description: 'Progress stalls. Same loops, same patterns. Need a catalyst — new inputs, new environment.',
      triggers: ['routine stagnation', 'echo chamber', 'comfort zone'],
      sentiment: -0.1,
    },
  ],
  social: [
    {
      id: '',
      label: 'Small tribe forms',
      domain: 'social',
      probability: 0,
      horizonMonths: 0,
      description: 'Not a crowd — 3-5 aligned people across different rooms. Builders, not talkers.',
      triggers: ['open source contributions', 'genuine engagement', 'vulnerability'],
      sentiment: 0.65,
    },
    {
      id: '',
      label: 'Digital hermit',
      domain: 'social',
      probability: 0,
      horizonMonths: 0,
      description: 'Online presence but no real connections. Posts without replies. Scrolling alone.',
      triggers: ['deleting posts', 'avoiding groups', 'mistrust'],
      sentiment: -0.35,
    },
  ],
  financial: [
    {
      id: '',
      label: 'Stabilize',
      domain: 'financial',
      probability: 0,
      horizonMonths: 0,
      description: 'Contract, gig, or small role brings breathing room. Not rich, but resourced.',
      triggers: ['apply consistently', 'bridge job', 'freelance'],
      sentiment: 0.45,
    },
    {
      id: '',
      label: 'Scarcity loop',
      domain: 'financial',
      probability: 0,
      horizonMonths: 0,
      description: 'Money stays tight. Survival mode affects all other domains. Need structural change.',
      triggers: ['avoidance', 'no applications', 'pride barrier'],
      sentiment: -0.6,
    },
  ],
};

function generateBranchId(domain: string, index: number, runId: string): string {
  return `${runId}_${domain}_${index}`;
}

const NEGATIVE_ARCHETYPES = new Set([
  'five_of_pentacles',
  'ten_of_wands',
  'tower',
  'moon',
  'devil',
  'three_of_pentacles_reversed',
  'six_of_wands_reversed',
  'hierophant_reversed',
  'emperor_reversed',
]);

function clampModifier(v: number): number {
  return Math.max(-0.4, Math.min(0.4, v));
}

function personalYearDomainWeights(core: number): Partial<Record<OracleLifeDomain, number>> {
  switch (core) {
    case 1:
      return { career: 0.08, growth: 0.08 };
    case 2:
      return { relationships: 0.12, social: 0.1 };
    case 3:
      return { social: 0.11, creativity: 0.1 };
    case 4:
      return { health: 0.1, career: 0.08 };
    case 5:
      return { creativity: 0.12, growth: 0.08, social: 0.08 };
    case 6:
      return { relationships: 0.16, health: 0.07, social: 0.06 };
    case 7:
      return { growth: 0.14, health: 0.06 };
    case 8:
      return { career: 0.15, financial: 0.14 };
    case 9:
      return { growth: 0.1, social: 0.08, relationships: 0.06 };
    default:
      return {};
  }
}

export function computeDomainModifiers(state: OracleState): {
  modifiers: Partial<Record<OracleLifeDomain, number>>;
  narrativeTags: string[];
} {
  const modifiers: Partial<Record<OracleLifeDomain, number>> = {};
  const narrativeTags: string[] = [];

  const apply = (domain: OracleLifeDomain, delta: number) => {
    modifiers[domain] = clampModifier((modifiers[domain] || 0) + delta);
  };

  if (state.activeOverlays.astrology && state.transits?.months?.length) {
    const signals = state.transits.months.slice(0, 2).flatMap((m) => m.signals);
    for (const signal of signals) {
      apply(signal.domain, signal.weight * 0.6);
    }
    if (state.transits.months[0]?.summary) {
      narrativeTags.push(`Transit: ${state.transits.months[0].summary}`);
    }
  }

  if (state.activeOverlays.numerology && state.numerology) {
    const pyWeights = personalYearDomainWeights(state.numerology.personalYear.core);
    for (const [domain, delta] of Object.entries(pyWeights) as Array<[OracleLifeDomain, number]>) {
      apply(domain, delta);
    }
    if (state.numerology.hiddenPassions.includes(1)) apply('career', 0.07);
    if (state.numerology.hiddenPassions.includes(5)) {
      apply('creativity', 0.08);
      apply('social', 0.07);
    }
    narrativeTags.push(`Numerology cycle: Personal Year ${state.numerology.personalYear.core}`);
  }

  if (state.activeOverlays.archetypes && state.activeArchetypes.length > 0) {
    for (const arc of state.activeArchetypes.slice(0, 6)) {
      const signed = NEGATIVE_ARCHETYPES.has(arc.id) ? -arc.score * 0.16 : arc.score * 0.14;
      for (const domain of arc.domains) {
        apply(domain, signed);
      }
      narrativeTags.push(`${arc.label} (${Math.round(arc.score * 100)}%)`);
    }
  }

  return { modifiers, narrativeTags: narrativeTags.slice(0, 8) };
}

export function runMonteCarloSimulation(
  config: SimulationConfig,
  events: OracleLifeEvent[],
  sentiment: OracleSentimentProfile,
  socialGraph: OracleSocialNode[],
): OracleSimulationRun {
  const runId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const rng = mulberry32(config.seed ?? Date.now());
  const momentum = computeLifeArcMomentum(events);
  const social = computeSocialInfluence(socialGraph);

  const allBranches: OracleTrajectoryBranch[] = [];

  for (const domain of Object.keys(DOMAIN_TEMPLATES) as OracleLifeDomain[]) {
    const templates = DOMAIN_TEMPLATES[domain];
    const domainMomentum = momentum[domain];
    const domainBias = config.domainModifiers?.[domain] || 0;

    const rawScores: number[] = [];
    for (let tIdx = 0; tIdx < templates.length; tIdx++) {
      let score = 0;
      for (let iter = 0; iter < config.iterations; iter++) {
        const noise = (rng() - 0.5) * 0.4;
        const momentumPush = domainMomentum * 0.3;
        const socialPush = social.netInfluence * 0.15;

        const sentimentFactors = computeSentimentFactorsForDomain(domain, sentiment);
        const combined = sentimentFactors + momentumPush + socialPush + domainBias + noise;

        const isPositiveBranch = templates[tIdx].sentiment > 0;
        if (isPositiveBranch) {
          score += combined > -0.1 ? 1 : 0;
        } else {
          score += combined < 0.1 ? 1 : 0;
        }
      }
      rawScores.push(score / config.iterations);
    }

    const total = rawScores.reduce((a, b) => a + b, 0) || 1;
    for (let tIdx = 0; tIdx < templates.length; tIdx++) {
      const branch: OracleTrajectoryBranch = {
        ...templates[tIdx],
        id: generateBranchId(domain, tIdx, runId),
        horizonMonths: config.horizonMonths,
        probability: Math.round((rawScores[tIdx] / total) * 100) / 100,
        description: config.narrativeTags?.length
          ? `${templates[tIdx].description} [Overlay: ${config.narrativeTags.slice(0, 2).join(' | ')}]`
          : templates[tIdx].description,
      };
      allBranches.push(branch);
    }
  }

  let dominant = allBranches[0];
  for (const b of allBranches) {
    if (b.probability > dominant.probability) dominant = b;
  }

  const avgConfidence = allBranches.reduce((s, b) => s + b.probability, 0) / allBranches.length;

  const inputFingerprint = [
    events.length,
    sentiment.loneliness.toFixed(2),
    sentiment.creativity.toFixed(2),
    sentiment.fearOfFailure.toFixed(2),
    socialGraph.length,
    social.netInfluence.toFixed(2),
    JSON.stringify(config.domainModifiers || {}),
    (config.narrativeTags || []).join('|'),
  ].join('|');

  return {
    id: runId,
    ranAt: Date.now(),
    iterations: config.iterations,
    horizonMonths: config.horizonMonths,
    branches: allBranches,
    dominantBranch: dominant.id,
    confidenceScore: clamp01(avgConfidence + 0.1),
    inputHash: inputFingerprint,
  };
}

function computeSentimentFactorsForDomain(domain: OracleLifeDomain, s: OracleSentimentProfile): number {
  switch (domain) {
    case 'career':
      return s.ambition * 0.35 + s.resilience * 0.25 - s.fearOfFailure * 0.2 + s.hopefulness * 0.2 - 0.3;
    case 'relationships':
      return s.hopefulness * 0.3 - s.loneliness * 0.25 + s.socialEnergy * 0.25 + s.selfAwareness * 0.2 - 0.3;
    case 'health':
      return s.resilience * 0.4 - s.loneliness * 0.2 + s.hopefulness * 0.2 + s.selfAwareness * 0.2 - 0.3;
    case 'creativity':
      return s.creativity * 0.45 + s.ambition * 0.2 - s.fearOfFailure * 0.15 + s.hopefulness * 0.2 - 0.3;
    case 'growth':
      return s.selfAwareness * 0.3 + s.resilience * 0.25 + s.ambition * 0.25 + s.hopefulness * 0.2 - 0.3;
    case 'social':
      return s.socialEnergy * 0.35 - s.loneliness * 0.25 + s.hopefulness * 0.2 + s.selfAwareness * 0.2 - 0.3;
    case 'financial':
      return s.ambition * 0.3 + s.resilience * 0.25 - s.fearOfFailure * 0.25 + s.hopefulness * 0.2 - 0.3;
    default:
      return 0;
  }
}

// ─── Feedback Loop: Calibrate predictions with outcomes ──────

export function applyFeedback(state: OracleState, entry: Omit<OracleFeedbackEntry, 'id'>): OracleState {
  const feedback: OracleFeedbackEntry = {
    ...entry,
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  };

  const resolved = state.feedback.filter((f) => f.outcome !== 'pending');
  const correct = resolved.filter((f) => f.outcome === 'correct').length + (entry.outcome === 'correct' ? 1 : 0);
  const partial = resolved.filter((f) => f.outcome === 'partial').length + (entry.outcome === 'partial' ? 1 : 0);
  const totalResolved = resolved.length + (entry.outcome !== 'pending' ? 1 : 0);

  const calibration = totalResolved > 0 ? (correct + partial * 0.5) / totalResolved : 0.5;

  return {
    ...state,
    feedback: [...state.feedback, feedback].slice(-100),
    calibrationScore: clamp01(calibration),
  };
}

// ─── Text-to-Events: Extract life events from free-form text ─

export function extractLifeEventsFromText(text: string): OracleLifeEvent[] {
  const events: OracleLifeEvent[] = [];
  const lines = text.split(/[.\n]/).filter((l) => l.trim().length > 10);

  const domainPatterns: Array<{ pattern: RegExp; domain: OracleLifeDomain }> = [
    { pattern: /\b(job|career|work|hired|fired|gig|salary|intern|startup|company|interview)\b/i, domain: 'career' },
    {
      pattern: /\b(love|partner|girlfriend|boyfriend|marriage|date|relationship|breakup|alone|lonely)\b/i,
      domain: 'relationships',
    },
    { pattern: /\b(health|sick|exercise|therapy|mental|anxiety|depression|hospital)\b/i, domain: 'health' },
    { pattern: /\b(create|build|code|design|art|music|write|project|invention|hack)\b/i, domain: 'creativity' },
    { pattern: /\b(learn|grow|school|college|degree|course|skill|mentor|book|read)\b/i, domain: 'growth' },
    { pattern: /\b(friend|community|network|social|group|team|people)\b/i, domain: 'social' },
    { pattern: /\b(money|broke|rent|income|debt|savings|financial|invest)\b/i, domain: 'financial' },
  ];

  const sentimentWords: Record<string, number> = {
    great: 0.6,
    amazing: 0.8,
    good: 0.4,
    happy: 0.7,
    love: 0.6,
    proud: 0.7,
    bad: -0.4,
    terrible: -0.7,
    scared: -0.5,
    afraid: -0.6,
    lost: -0.4,
    angry: -0.5,
    fail: -0.6,
    hate: -0.7,
    alone: -0.5,
    broke: -0.5,
    hope: 0.5,
    dream: 0.4,
    fight: 0.3,
    survive: 0.2,
    overcome: 0.6,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 10) continue;

    let domain: OracleLifeDomain = 'growth';
    for (const dp of domainPatterns) {
      if (dp.pattern.test(trimmed)) {
        domain = dp.domain;
        break;
      }
    }

    let sentiment = 0;
    let sentimentHits = 0;
    const lowerWords = trimmed.toLowerCase().split(/\s+/);
    for (const w of lowerWords) {
      const clean = w.replace(/[^a-z]/g, '');
      if (sentimentWords[clean] !== undefined) {
        sentiment += sentimentWords[clean];
        sentimentHits++;
      }
    }
    if (sentimentHits > 0) sentiment /= sentimentHits;

    events.push({
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: trimmed.slice(0, 60),
      domain,
      timestamp: Date.now(),
      sentiment: Math.max(-1, Math.min(1, sentiment)),
      significance: clamp01(0.3 + Math.abs(sentiment) * 0.5),
      description: trimmed,
    });
  }

  return events;
}

// ─── Full Oracle Pipeline ────────────────────────────────────

export interface OracleRunParams {
  horizonMonths?: number;
  iterations?: number;
  seed?: number;
  additionalText?: string;
  transitMonths?: number;
  targetYear?: number;
}

export function runOraclePipeline(state: OracleState, params: OracleRunParams = {}): OracleState {
  const horizonMonths = params.horizonMonths ?? 60;
  const iterations = params.iterations ?? 5000;
  const transitMonths = params.transitMonths ?? 12;
  const targetYear = params.targetYear ?? new Date().getUTCFullYear();

  let updatedState = { ...state, phase: 'analyzing' as OraclePhase };

  if (params.additionalText) {
    const newEvents = extractLifeEventsFromText(params.additionalText);
    updatedState = {
      ...updatedState,
      lifeEvents: [...updatedState.lifeEvents, ...newEvents].slice(-200),
      sentimentProfile: analyzeSentimentFromText(params.additionalText, updatedState.sentimentProfile),
    };
  }

  // Divination overlays are deterministic computations layered on top of core stats.
  if (updatedState.activeOverlays.astrology && updatedState.subject.birthDate) {
    const chart = generateBirthChart({
      birthDate: updatedState.subject.birthDate,
      birthTime: updatedState.subject.birthTime || '12:00',
      birthLocation: updatedState.subject.birthLocation,
    });
    const transits = computeTransits({
      birthChart: chart,
      targetDate: new Date(),
      months: transitMonths,
    });
    updatedState = {
      ...updatedState,
      birthChart: chart,
      transits,
    };
  }

  if (updatedState.activeOverlays.numerology && updatedState.subject.birthDate) {
    const numerology = generateNumerologyProfile({
      fullName: updatedState.subject.fullName || updatedState.subject.name || 'Unknown Subject',
      birthDate: updatedState.subject.birthDate,
      targetYear,
    });
    updatedState = {
      ...updatedState,
      numerology,
    };
  }

  if (updatedState.activeOverlays.archetypes) {
    const activeArchetypes = computeArchetypeSignals({
      sentiment: updatedState.sentimentProfile,
      transits: updatedState.transits,
      numerology: updatedState.numerology,
      topK: 8,
    });
    updatedState = {
      ...updatedState,
      activeArchetypes,
    };
  }

  const overlay = computeDomainModifiers(updatedState);

  updatedState.phase = 'simulating';
  const sim = runMonteCarloSimulation(
    {
      iterations,
      horizonMonths,
      seed: params.seed,
      domainModifiers: overlay.modifiers,
      narrativeTags: overlay.narrativeTags,
    },
    updatedState.lifeEvents,
    updatedState.sentimentProfile,
    updatedState.socialGraph,
  );
  const destinyMatrixReport = generateDestinyMatrixReport({
    subjectName: updatedState.subject.fullName || updatedState.subject.name || 'Unknown Subject',
    horizonMonths,
    birthChart: updatedState.birthChart,
    numerology: updatedState.numerology,
    transits: updatedState.transits,
    archetypes: updatedState.activeArchetypes,
    forecast: sim,
  });

  const communicationProfile = computeCommunicationProfile(updatedState);

  updatedState = {
    ...updatedState,
    phase: 'complete',
    simulations: [...updatedState.simulations, sim].slice(-20),
    activeForecast: sim,
    destinyMatrixReport,
    communicationProfile,
    totalSimulations: updatedState.totalSimulations + 1,
    lastRunAt: Date.now(),
    logs: [
      ...updatedState.logs,
      `[${new Date().toISOString()}] Oracle ran ${iterations} iterations over ${horizonMonths}mo horizon. Dominant: ${sim.dominantBranch}.`,
      `[${new Date().toISOString()}] Destiny Matrix report generated (${destinyMatrixReport.sections.length} sections).`,
      communicationProfile
        ? `[${new Date().toISOString()}] Astro-voice profile computed (${communicationProfile.toneDirectives.length} directives).`
        : '',
      ...overlay.narrativeTags.map((tag) => `[Overlay] ${tag}`),
    ]
      .filter(Boolean)
      .slice(-50),
  };

  return updatedState;
}
