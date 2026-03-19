import type {
  OracleArchetypeSignal,
  OracleBirthChart,
  OracleDestinyMatrixReport,
  OracleDestinyMatrixSection,
  OracleLifeDomain,
  OracleNumerologyProfile,
  OracleNumerologyValue,
  OracleSimulationRun,
  OracleTransitForecast,
  OracleTransitSignal,
  OracleTrajectoryBranch,
} from '../types';

const DOMAIN_ORDER: OracleLifeDomain[] = [
  'career',
  'relationships',
  'health',
  'creativity',
  'growth',
  'social',
  'financial',
];

const DOMAIN_LABEL: Record<OracleLifeDomain, string> = {
  career: 'career',
  relationships: 'relationships',
  health: 'health',
  creativity: 'creativity',
  growth: 'growth',
  social: 'social',
  financial: 'finance',
};

function pct(v: number): string {
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}

function formatNumerologyValue(v: OracleNumerologyValue): string {
  return `${v.label} ${v.compound ? `${v.compound}/${v.core}` : v.core}`;
}

function planetSign(chart: OracleBirthChart | null | undefined, planetName: string): string | null {
  const planet = chart?.planets.find((p) => p.planet === planetName);
  return planet?.sign ?? null;
}

function ascSign(chart: OracleBirthChart | null | undefined): string | null {
  if (!chart?.houses?.length) return null;
  return chart.houses[0].sign;
}

function topArchetypes(
  archetypes: OracleArchetypeSignal[] | null | undefined,
  domain?: OracleLifeDomain,
  count = 3,
): OracleArchetypeSignal[] {
  const pool = archetypes || [];
  const filtered = domain
    ? pool.filter((a) => a.domains.includes(domain))
    : pool;
  return filtered.slice(0, count);
}

function branchForDomain(
  forecast: OracleSimulationRun | null | undefined,
  domain: OracleLifeDomain,
): OracleTrajectoryBranch | null {
  if (!forecast) return null;
  const branches = forecast.branches
    .filter((b) => b.domain === domain)
    .sort((a, b) => b.probability - a.probability);
  return branches[0] ?? null;
}

function riskBranchForDomain(
  forecast: OracleSimulationRun | null | undefined,
  domain: OracleLifeDomain,
): OracleTrajectoryBranch | null {
  if (!forecast) return null;
  const branches = forecast.branches
    .filter((b) => b.domain === domain && b.sentiment < 0)
    .sort((a, b) => b.probability - a.probability);
  return branches[0] ?? null;
}

function transitBias(
  transits: OracleTransitForecast | null | undefined,
  domain: OracleLifeDomain,
): { positive: number; negative: number; strongest: OracleTransitSignal | null } {
  const signals = (transits?.months || [])
    .slice(0, 6)
    .flatMap((m) => m.signals)
    .filter((s) => s.domain === domain);
  if (signals.length === 0) {
    return { positive: 0, negative: 0, strongest: null };
  }
  let positive = 0;
  let negative = 0;
  let strongest = signals[0];
  for (const signal of signals) {
    if (signal.weight >= 0) positive += signal.weight;
    else negative += Math.abs(signal.weight);
    if (Math.abs(signal.weight) > Math.abs(strongest.weight)) strongest = signal;
  }
  return { positive, negative, strongest };
}

function monthTransitDigest(transits: OracleTransitForecast | null | undefined): string {
  if (!transits?.months?.length) {
    return 'No major transit layer was available for this run, so timing windows are inferred from trajectory probabilities only.';
  }
  return transits.months
    .slice(0, 6)
    .map((m) => `${m.monthIso}: ${m.summary}`)
    .join('\n');
}

function buildOverviewSection(params: {
  subjectName: string;
  numerology: OracleNumerologyProfile | null | undefined;
  birthChart: OracleBirthChart | null | undefined;
  archetypes: OracleArchetypeSignal[] | null | undefined;
  forecast: OracleSimulationRun | null | undefined;
  horizonMonths: number;
}): OracleDestinyMatrixSection {
  const lines: string[] = [];
  const { numerology, birthChart, forecast } = params;

  lines.push(
    `Destiny matrix initialized for ${params.subjectName}. This report blends deterministic overlays with probabilistic simulation outputs.`,
  );

  if (numerology) {
    lines.push(
      `Core matrix axis is ${formatNumerologyValue(numerology.lifePath)} with ${formatNumerologyValue(
        numerology.expression,
      )}. This combination points to a builder profile that learns by shipping, then iterating from real feedback instead of abstract theory.`,
    );
  } else {
    lines.push(
      'Numerology layer is not active, so the matrix is anchored in sentiment, events, and simulation outputs only.',
    );
  }

  const sun = planetSign(birthChart, 'Sun');
  const moon = planetSign(birthChart, 'Moon');
  const asc = ascSign(birthChart);
  if (sun || moon || asc) {
    lines.push(
      `Astro signature snapshot: ${sun ? `Sun in ${sun}` : 'Sun unknown'}, ${
        moon ? `Moon in ${moon}` : 'Moon unknown'
      }, ${asc ? `Ascendant in ${asc}` : 'Ascendant unknown'}. This is used as a deterministic timing/context overlay rather than a mystical source.`,
    );
  }

  const topArc = topArchetypes(params.archetypes, undefined, 3);
  if (topArc.length) {
    lines.push(
      `Active archetype pressure is led by ${topArc
        .map((a) => `${a.label} (${pct(a.score)})`)
        .join(', ')}, which supplies narrative framing for current patterns.`,
    );
  }

  if (forecast) {
    const dominant = forecast.branches.find((b) => b.id === forecast.dominantBranch);
    if (dominant) {
      lines.push(
        `Current dominant trajectory over the next ${params.horizonMonths} months is "${dominant.label}" in ${DOMAIN_LABEL[dominant.domain]} (${pct(
          dominant.probability,
        )}).`,
      );
    }
  }

  return {
    id: 'overview',
    title: 'Destiny Matrix Signature',
    body: lines.join('\n\n'),
  };
}

function buildLoveSection(params: {
  numerology: OracleNumerologyProfile | null | undefined;
  transits: OracleTransitForecast | null | undefined;
  archetypes: OracleArchetypeSignal[] | null | undefined;
  forecast: OracleSimulationRun | null | undefined;
}): OracleDestinyMatrixSection {
  const lines: string[] = [];
  const relTop = branchForDomain(params.forecast, 'relationships');
  const relRisk = riskBranchForDomain(params.forecast, 'relationships');

  if (params.numerology) {
    lines.push(
      `${formatNumerologyValue(params.numerology.soulUrge)} and ${formatNumerologyValue(
        params.numerology.personality,
      )} show that closeness has to feel authentic and emotionally intelligent. Love stabilizes when communication is direct, calm, and specific.`,
    );
  }

  if (relTop) {
    lines.push(
      `Primary relationship branch is "${relTop.label}" at ${pct(
        relTop.probability,
      )}. Trigger set: ${relTop.triggers.join(', ')}.`,
    );
  }
  if (relRisk) {
    lines.push(
      `Main relationship risk branch is "${relRisk.label}" (${pct(
        relRisk.probability,
      )}). This is usually activated by avoidance loops or over-defensive signaling.`,
    );
  }

  const bias = transitBias(params.transits, 'relationships');
  if (bias.strongest) {
    lines.push(
      `Transit window for relationships is ${
        bias.positive >= bias.negative ? 'supportive' : 'volatile'
      } in the near term (strongest signal: ${bias.strongest.message}).`,
    );
  }

  const arcs = topArchetypes(params.archetypes, 'relationships', 2);
  if (arcs.length) {
    lines.push(
      `Archetype overlay: ${arcs.map((a) => `${a.label} ${pct(a.score)}`).join(' | ')}.`,
    );
  }

  if (!lines.length) {
    lines.push(
      'Insufficient relationship signals for a full love profile. Add more narrative text and rerun to increase precision.',
    );
  }

  return {
    id: 'love',
    title: 'Love Field',
    body: lines.join('\n\n'),
  };
}

function buildCareerSection(params: {
  numerology: OracleNumerologyProfile | null | undefined;
  transits: OracleTransitForecast | null | undefined;
  archetypes: OracleArchetypeSignal[] | null | undefined;
  forecast: OracleSimulationRun | null | undefined;
}): OracleDestinyMatrixSection {
  const lines: string[] = [];
  const top = branchForDomain(params.forecast, 'career');
  const risk = riskBranchForDomain(params.forecast, 'career');

  if (params.numerology) {
    lines.push(
      `${formatNumerologyValue(params.numerology.expression)} with ${formatNumerologyValue(
        params.numerology.personalYear,
      )} suggests outcomes improve when work is framed in measurable value, clear scope, and repeatable delivery.`,
    );
  }

  if (top) {
    lines.push(
      `Top career branch is "${top.label}" at ${pct(top.probability)}. Current probability stack favors this path when the trigger sequence is executed: ${top.triggers.join(
        ', ',
      )}.`,
    );
  }
  if (risk) {
    lines.push(
      `Career warning branch is "${risk.label}" at ${pct(
        risk.probability,
      )}. This is generally a load-management problem, not a talent problem.`,
    );
  }

  const bias = transitBias(params.transits, 'career');
  if (bias.strongest) {
    lines.push(
      `Career transit pressure is currently ${
        bias.positive >= bias.negative ? 'constructive' : 'friction-heavy'
      }, led by: ${bias.strongest.message}.`,
    );
  }

  const arcs = topArchetypes(params.archetypes, 'career', 3);
  if (arcs.length) {
    lines.push(
      `Career archetypes in play: ${arcs.map((a) => `${a.label} (${pct(a.score)})`).join(', ')}.`,
    );
  }

  if (!lines.length) {
    lines.push(
      'Insufficient career signals for a full career vector. Add event history and social graph nodes for stronger branch separation.',
    );
  }

  return {
    id: 'career',
    title: 'Career Vector',
    body: lines.join('\n\n'),
  };
}

function buildLifeSection(params: {
  numerology: OracleNumerologyProfile | null | undefined;
  forecast: OracleSimulationRun | null | undefined;
}): OracleDestinyMatrixSection {
  const lines: string[] = [];
  const growthTop = branchForDomain(params.forecast, 'growth');
  const healthTop = branchForDomain(params.forecast, 'health');

  if (params.numerology) {
    lines.push(
      `${formatNumerologyValue(params.numerology.lifePath)} and ${formatNumerologyValue(
        params.numerology.maturity,
      )} describe the long arc: depth + execution + eventual strategic simplification.`,
    );
    lines.push(
      `Hidden passions: ${params.numerology.hiddenPassions.join(', ') || 'none'}; karmic lessons: ${
        params.numerology.karmicLessons.join(', ') || 'none'
      }; balance number: ${params.numerology.balanceNumber}.`,
    );
  }

  if (growthTop || healthTop) {
    lines.push(
      `Life-cycle trajectory currently leans toward ${
        growthTop ? `"${growthTop.label}" (${pct(growthTop.probability)})` : 'growth-neutral movement'
      } and ${
        healthTop ? `"${healthTop.label}" (${pct(healthTop.probability)})` : 'health-neutral movement'
      }.`,
    );
  }

  if (!lines.length) {
    lines.push(
      'Life cycle insight is limited without numerology or branch outputs. Run a forecast after setting birth date and ingestion text.',
    );
  }

  return {
    id: 'life',
    title: 'Life Arc and Internal Cycles',
    body: lines.join('\n\n'),
  };
}

function buildTransitSection(params: {
  transits: OracleTransitForecast | null | undefined;
}): OracleDestinyMatrixSection {
  const digest = monthTransitDigest(params.transits);
  return {
    id: 'transits',
    title: 'Transit Timing Calendar',
    body: `Monthly timing windows (next 6 months):\n${digest}`,
  };
}

function buildTrajectorySection(params: {
  forecast: OracleSimulationRun | null | undefined;
  horizonMonths: number;
}): OracleDestinyMatrixSection {
  const lines: string[] = [];
  if (!params.forecast) {
    return {
      id: 'trajectory',
      title: 'Trajectory Synthesis',
      body: 'No simulation run detected yet. Execute forecast to synthesize multi-domain branch probabilities.',
    };
  }

  for (const domain of DOMAIN_ORDER) {
    const top = branchForDomain(params.forecast, domain);
    if (!top) continue;
    lines.push(
      `${DOMAIN_LABEL[domain]}: ${top.label} (${pct(top.probability)}) over ${params.horizonMonths} months.`,
    );
  }

  const dominant = params.forecast.branches
    .slice()
    .sort((a, b) => b.probability - a.probability)[0];
  if (dominant) {
    lines.push(
      `Dominant branch execution checklist: ${dominant.triggers.join(
        ', ',
      )}. This is the minimum set of actions that most reliably pushes toward the highest-probability upside.`,
    );
  }

  return {
    id: 'trajectory',
    title: 'Trajectory Synthesis',
    body: lines.join('\n\n'),
  };
}

export function generateDestinyMatrixReport(params: {
  subjectName: string;
  horizonMonths: number;
  birthChart?: OracleBirthChart | null;
  numerology?: OracleNumerologyProfile | null;
  transits?: OracleTransitForecast | null;
  archetypes?: OracleArchetypeSignal[];
  forecast?: OracleSimulationRun | null;
}): OracleDestinyMatrixReport {
  const sections: OracleDestinyMatrixSection[] = [
    buildOverviewSection({
      subjectName: params.subjectName,
      numerology: params.numerology,
      birthChart: params.birthChart,
      archetypes: params.archetypes,
      forecast: params.forecast,
      horizonMonths: params.horizonMonths,
    }),
    buildLoveSection({
      numerology: params.numerology,
      transits: params.transits,
      archetypes: params.archetypes,
      forecast: params.forecast,
    }),
    buildCareerSection({
      numerology: params.numerology,
      transits: params.transits,
      archetypes: params.archetypes,
      forecast: params.forecast,
    }),
    buildLifeSection({
      numerology: params.numerology,
      forecast: params.forecast,
    }),
    buildTransitSection({ transits: params.transits }),
    buildTrajectorySection({
      forecast: params.forecast,
      horizonMonths: params.horizonMonths,
    }),
  ];

  const narrative = sections
    .map((s) => `## ${s.title}\n${s.body}`)
    .join('\n\n');

  return {
    generatedAt: Date.now(),
    subjectName: params.subjectName,
    horizonMonths: params.horizonMonths,
    sections,
    narrative,
  };
}

