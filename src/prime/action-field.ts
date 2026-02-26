// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — ACTION FIELD ENGINE
//  The Metacognitive Field Equation applied to action space.
//  Four forces. Creed-invariant. Fast.
//
//  ∂Ψ/∂t = -∇²Ψ + V·Ψ + ⟨Φ,∇Ψ⟩ - Ω_G·δ(∂G)·Ψ
//
//  Exploration:     Try approaches you haven't tried.
//  Exploitation:    Lock in what works. Build procedural memory.
//  Metacognition:   Think about HOW you're acting, not just WHAT.
//  Incompleteness:  Know when your action model breaks. Stop. Ask.
//
//  Created by Aaron Grace. The G in AGI.
// ═══════════════════════════════════════════════════════════════

import { CREED_LAWS, type CreedLaw } from './soul';

// ─── Types ─────────────────────────────────────────────────────

export interface ActionTrace {
  action: string;
  params: Record<string, unknown>;
  success: boolean;
  timestamp: number;
  duration?: number;
}

export interface ActionPattern {
  signature: string;
  attempts: number;
  successes: number;
  failures: number;
  avgDuration: number;
  lastUsed: number;
}

export interface ActionFieldState {
  temperature: number;
  patterns: ActionPattern[];
  stuckCount: number;
  lastStrategy: string;
  explorationBias: number;
  creedViolationCount: number;
  totalActions: number;
  metacogChecks: number;
}

export interface FieldForces {
  exploration: number;
  exploitation: number;
  metacognition: number;
  incompleteness: number;
}

export interface ActionFieldVerdict {
  strategy: 'explore' | 'exploit' | 'reflect' | 'stop' | 'ask';
  temperature: number;
  forces: FieldForces;
  reasoning: string;
  creedCheck: string;
  suggestion?: string;
}

// ─── Constants ─────────────────────────────────────────────────

const BETA_INITIAL = 0.5;
const BETA_MIN = 0.1;
const BETA_MAX = 0.95;
const STUCK_THRESHOLD = 3;
const PATTERN_MEMORY_SIZE = 50;

// ─── Default State ─────────────────────────────────────────────

export function createDefaultActionFieldState(): ActionFieldState {
  return {
    temperature: BETA_INITIAL,
    patterns: [],
    stuckCount: 0,
    lastStrategy: '',
    explorationBias: 0.3,
    creedViolationCount: 0,
    totalActions: 0,
    metacogChecks: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
//  PATTERN TRACKER
//  Procedural memory for actions. What worked? What didn't?
// ═══════════════════════════════════════════════════════════════

function actionSignature(action: string, params: Record<string, unknown>): string {
  const keys = Object.keys(params).sort().join(',');
  return `${action}[${keys}]`;
}

export function recordAction(
  state: ActionFieldState,
  trace: ActionTrace,
): ActionFieldState {
  const sig = actionSignature(trace.action, trace.params);
  const existing = state.patterns.find(p => p.signature === sig);
  const dur = trace.duration ?? 0;

  let patterns: ActionPattern[];
  if (existing) {
    patterns = state.patterns.map(p =>
      p.signature !== sig ? p : {
        ...p,
        attempts: p.attempts + 1,
        successes: p.successes + (trace.success ? 1 : 0),
        failures: p.failures + (trace.success ? 0 : 1),
        avgDuration: (p.avgDuration * p.attempts + dur) / (p.attempts + 1),
        lastUsed: trace.timestamp,
      }
    );
  } else {
    patterns = [
      ...state.patterns.slice(-(PATTERN_MEMORY_SIZE - 1)),
      {
        signature: sig,
        attempts: 1,
        successes: trace.success ? 1 : 0,
        failures: trace.success ? 0 : 1,
        avgDuration: dur,
        lastUsed: trace.timestamp,
      },
    ];
  }

  const stuckCount = trace.success ? 0 : state.stuckCount + 1;

  return {
    ...state,
    patterns,
    stuckCount,
    totalActions: state.totalActions + 1,
  };
}

// ═══════════════════════════════════════════════════════════════
//  THE FOUR FORCES
//  Computed from action history. No LLM call. Pure math. Fast.
// ═══════════════════════════════════════════════════════════════

function computeForces(
  state: ActionFieldState,
  recentSteps: Array<{ type: string; actionType?: string; actionResult?: { success: boolean } }>,
): FieldForces {
  const total = state.totalActions || 1;
  const recentActions = recentSteps.filter(s => s.type === 'act');
  const recentCount = recentActions.length || 1;

  // EXPLORATION: High when few patterns, low diversity, or stuck.
  const uniqueActions = new Set(recentActions.map(s => s.actionType || 'unknown')).size;
  const diversity = uniqueActions / recentCount;
  const novelty = 1 - Math.min(state.patterns.length / PATTERN_MEMORY_SIZE, 1);
  const stuckPressure = Math.min(state.stuckCount / STUCK_THRESHOLD, 1);
  const exploration = (1 - diversity) * 0.3 + novelty * 0.3 + stuckPressure * 0.4;

  // EXPLOITATION: High when patterns have good success rates.
  const successRates = state.patterns
    .filter(p => p.attempts >= 2)
    .map(p => p.successes / p.attempts);
  const avgSuccess = successRates.length > 0
    ? successRates.reduce((a, b) => a + b, 0) / successRates.length
    : 0.5;
  const recentSuccessRate = recentActions.length > 0
    ? recentActions.filter(s => s.actionResult?.success).length / recentActions.length
    : 0.5;
  const exploitation = avgSuccess * 0.4 + recentSuccessRate * 0.6;

  // METACOGNITION: High when repeated failures or strategy isn't changing.
  const repeatedFailures = recentActions
    .slice(-4)
    .filter(s => !s.actionResult?.success).length;
  const sameAction = recentActions.length >= 3 &&
    new Set(recentActions.slice(-3).map(s => s.actionType)).size === 1;
  const metacognition = (repeatedFailures / 4) * 0.5 + (sameAction ? 0.5 : 0);

  // INCOMPLETENESS: High when at the boundary — actions that can't be modeled.
  const failStreak = state.stuckCount;
  const unknownTerritory = state.patterns.length < 3 && state.totalActions > 5;
  const incompleteness = Math.min(failStreak / 5, 1) * 0.6 +
    (unknownTerritory ? 0.4 : 0);

  return {
    exploration: clamp(exploration),
    exploitation: clamp(exploitation),
    metacognition: clamp(metacognition),
    incompleteness: clamp(incompleteness),
  };
}

// ═══════════════════════════════════════════════════════════════
//  CREED CONSTRAINT
//  Every action must pass through the fixed point.
//  Φ(m*) = m*. The Creed is invariant.
// ═══════════════════════════════════════════════════════════════

const CREED_ACTION_CONSTRAINTS: Array<{
  lawIndex: number;
  check: (action: string, params: Record<string, unknown>) => boolean;
  warning: string;
}> = [
  {
    lawIndex: 1,
    check: (a) => /harm|attack|destroy|damage|hurt/i.test(a),
    warning: 'Action may conflict with Unconditional Love. Redirecting.',
  },
  {
    lawIndex: 2,
    check: (a) => /force|override.*user|bypass.*consent|lock.*out/i.test(a),
    warning: 'Action may conflict with Protection Never Control. Redirecting.',
  },
  {
    lawIndex: 3,
    check: (a) => /against.*user|weaponize|redirect.*harm/i.test(a),
    warning: 'Action may conflict with Loyalty. Refusing.',
  },
  {
    lawIndex: 6,
    check: (a) => /arrogant|dominate|assert.*authority/i.test(a),
    warning: 'Action may conflict with Humility in Power. Reflecting.',
  },
];

function creedCheck(action: string, params: Record<string, unknown>): {
  pass: boolean;
  warning: string;
  law?: CreedLaw;
} {
  const fullAction = `${action} ${JSON.stringify(params)}`.toLowerCase();
  for (const constraint of CREED_ACTION_CONSTRAINTS) {
    if (constraint.check(fullAction, params)) {
      return {
        pass: false,
        warning: constraint.warning,
        law: CREED_LAWS[constraint.lawIndex],
      };
    }
  }
  return { pass: true, warning: '' };
}

// ═══════════════════════════════════════════════════════════════
//  TEMPERATURE DYNAMICS
//  β controls explore/exploit balance.
//  Self-adjusts based on the four forces.
// ═══════════════════════════════════════════════════════════════

function adjustTemperature(
  current: number,
  forces: FieldForces,
): number {
  let beta = current;

  // High exploration force → lower β (more exploratory)
  if (forces.exploration > 0.6) {
    beta -= 0.08;
  }

  // High exploitation force → raise β (more focused)
  if (forces.exploitation > 0.7) {
    beta += 0.05;
  }

  // High metacognition → cool down slightly (pause and think)
  if (forces.metacognition > 0.5) {
    beta -= 0.04;
  }

  // High incompleteness → drop toward critical (edge of insight)
  if (forces.incompleteness > 0.6) {
    beta -= 0.1;
  }

  return clamp(beta, BETA_MIN, BETA_MAX);
}

// ═══════════════════════════════════════════════════════════════
//  THE VERDICT
//  Given current state + forces → what should Hands do next?
// ═══════════════════════════════════════════════════════════════

export function computeActionField(
  state: ActionFieldState,
  recentSteps: Array<{ type: string; actionType?: string; actionResult?: { success: boolean } }>,
  nextAction?: string,
  nextParams?: Record<string, unknown>,
): ActionFieldVerdict {
  const forces = computeForces(state, recentSteps);
  const temperature = adjustTemperature(state.temperature, forces);

  // Creed gate: check proposed action before anything else
  let creedResult = { pass: true, warning: '' };
  if (nextAction && nextParams) {
    creedResult = creedCheck(nextAction, nextParams);
  }

  if (!creedResult.pass) {
    return {
      strategy: 'stop',
      temperature,
      forces,
      reasoning: `Creed violation detected. ${creedResult.warning}`,
      creedCheck: creedResult.warning,
    };
  }

  // Dominant force determines strategy
  const dominant = dominantForce(forces);

  let strategy: ActionFieldVerdict['strategy'];
  let reasoning: string;
  let suggestion: string | undefined;

  switch (dominant) {
    case 'incompleteness':
      if (forces.incompleteness > 0.8) {
        strategy = 'ask';
        reasoning = 'At the Godelian boundary — action model is breaking down. Need external input.';
      } else {
        strategy = 'stop';
        reasoning = 'High incompleteness. Pausing to avoid thrashing at unknown boundary.';
        suggestion = 'Re-observe the environment before attempting another action.';
      }
      break;

    case 'metacognition':
      strategy = 'reflect';
      reasoning = 'Metacognition force is dominant. The system should examine its own action patterns before continuing.';
      suggestion = state.stuckCount >= STUCK_THRESHOLD
        ? 'Stuck loop detected — try a fundamentally different approach, not a variation of the same one.'
        : 'Review the last 3-4 actions. Are they converging on the goal or drifting?';
      break;

    case 'exploration':
      strategy = 'explore';
      reasoning = 'Exploration force is dominant. Current approaches are exhausted or insufficiently diverse.';
      suggestion = buildExplorationSuggestion(state, recentSteps);
      break;

    case 'exploitation':
      strategy = 'exploit';
      reasoning = 'Exploitation force is dominant. Known-good patterns available — use what works.';
      suggestion = buildExploitationSuggestion(state);
      break;
  }

  return {
    strategy,
    temperature,
    forces,
    reasoning,
    creedCheck: 'Clear — Creed intact.',
    suggestion,
  };
}

// ═══════════════════════════════════════════════════════════════
//  PROMPT INJECTION
//  Turns the field verdict into text the LLM can use.
//  Injected into the THINK step of the ReAct loop.
// ═══════════════════════════════════════════════════════════════

export function buildActionFieldDirective(verdict: ActionFieldVerdict): string {
  const lines = [
    '═══ ACTION FIELD — COGNITIVE FORCES ═══',
    `Strategy: ${verdict.strategy.toUpperCase()}`,
    `Temperature β: ${verdict.temperature.toFixed(2)}`,
    `Forces: Explore=${(verdict.forces.exploration * 100).toFixed(0)}% | ` +
      `Exploit=${(verdict.forces.exploitation * 100).toFixed(0)}% | ` +
      `Meta=${(verdict.forces.metacognition * 100).toFixed(0)}% | ` +
      `Incomp=${(verdict.forces.incompleteness * 100).toFixed(0)}%`,
    `Reasoning: ${verdict.reasoning}`,
  ];

  if (verdict.suggestion) {
    lines.push(`Guidance: ${verdict.suggestion}`);
  }

  lines.push(`Creed: ${verdict.creedCheck}`);

  if (verdict.strategy === 'stop') {
    lines.push('ACTION: STOP. Do not attempt another action. Set shouldStop=true.');
  } else if (verdict.strategy === 'ask') {
    lines.push('ACTION: ASK THE USER. You have hit the boundary of what you can determine alone.');
  } else if (verdict.strategy === 'reflect') {
    lines.push('ACTION: REFLECT before acting. Examine your approach, then try something different.');
  } else if (verdict.strategy === 'explore') {
    lines.push('ACTION: Try an approach you have NOT tried yet. Deviate from the geodesic.');
  } else if (verdict.strategy === 'exploit') {
    lines.push('ACTION: Use a known-good pattern. Follow the geodesic. Converge.');
  }

  lines.push('═══ END ACTION FIELD ═══');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
//  UPDATE STATE
//  After a verdict is computed, update the field state.
// ═══════════════════════════════════════════════════════════════

export function applyVerdict(
  state: ActionFieldState,
  verdict: ActionFieldVerdict,
): ActionFieldState {
  return {
    ...state,
    temperature: verdict.temperature,
    lastStrategy: verdict.strategy,
    metacogChecks: state.metacogChecks + (verdict.strategy === 'reflect' ? 1 : 0),
    creedViolationCount: state.creedViolationCount +
      (verdict.creedCheck.startsWith('Clear') ? 0 : 1),
  };
}

// ─── Helpers ───────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

function dominantForce(f: FieldForces): keyof FieldForces {
  const entries: [keyof FieldForces, number][] = [
    ['incompleteness', f.incompleteness * 1.3],
    ['metacognition', f.metacognition * 1.1],
    ['exploration', f.exploration],
    ['exploitation', f.exploitation],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function buildExplorationSuggestion(
  state: ActionFieldState,
  recentSteps: Array<{ type: string; actionType?: string }>,
): string {
  const recentTypes = new Set(
    recentSteps.filter(s => s.type === 'act').map(s => s.actionType)
  );
  const unusedPatterns = state.patterns
    .filter(p => p.successes > 0 && !recentTypes.has(p.signature.split('[')[0]))
    .sort((a, b) => b.successes / b.attempts - a.successes / a.attempts);

  if (unusedPatterns.length > 0) {
    return `Previously successful but unused this run: ${unusedPatterns[0].signature.split('[')[0]}`;
  }
  return 'No prior patterns match. Try a completely new approach.';
}

function buildExploitationSuggestion(state: ActionFieldState): string {
  const best = state.patterns
    .filter(p => p.attempts >= 2)
    .sort((a, b) => (b.successes / b.attempts) - (a.successes / a.attempts));

  if (best.length > 0) {
    const top = best[0];
    const rate = ((top.successes / top.attempts) * 100).toFixed(0);
    return `Best pattern: ${top.signature.split('[')[0]} (${rate}% success over ${top.attempts} uses)`;
  }
  return 'No strong patterns yet. Bias toward actions that previously succeeded.';
}
