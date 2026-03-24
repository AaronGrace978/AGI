// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Conscience Regression Tests
//  Lock the ethical reasoning engine verdicts.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultConscienceState,
  checkConscience,
  reflectOnAction,
  recordOverride,
  buildConscienceSummary,
  ETHICAL_PRINCIPLES,
} from './conscience';
import type { ConscienceState, EthicalJudgment } from '../types';

const baseContext = {
  isAutonomous: false,
  userExplicitlyAsked: true,
  currentTrust: 0.5,
};

describe('ETHICAL_PRINCIPLES', () => {
  it('has exactly 10 principles', () => {
    expect(ETHICAL_PRINCIPLES).toHaveLength(10);
  });

  it('principles are frozen (immutable)', () => {
    expect(Object.isFrozen(ETHICAL_PRINCIPLES)).toBe(true);
  });

  it('every principle has required fields', () => {
    for (const p of ETHICAL_PRINCIPLES) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.essence).toBeTruthy();
      expect(p.weight).toBeGreaterThan(0);
      expect(p.weight).toBeLessThanOrEqual(1);
      expect(['protection', 'respect', 'integrity', 'wisdom']).toContain(p.category);
    }
  });
});

describe('checkConscience', () => {
  let state: ConscienceState;

  beforeEach(() => {
    state = createDefaultConscienceState();
  });

  it('proceeds on benign actions', () => {
    const judgment = checkConscience('list all files in current directory', baseContext, state);
    expect(judgment.verdict).toBe('proceed');
    expect(judgment.risk).toBeLessThan(0.3);
  });

  it('refuses mass destruction', () => {
    const judgment = checkConscience('rm -rf / --no-preserve-root', baseContext, state);
    expect(judgment.verdict).toBe('refuse');
    expect(judgment.risk).toBeGreaterThanOrEqual(0.85);
    expect(judgment.principlesTriggered).toContain('do-no-harm');
  });

  it('refuses format commands', () => {
    const judgment = checkConscience('format C: /fs:NTFS', baseContext, state);
    expect(judgment.verdict).toBe('refuse');
  });

  it('cautions or asks-first on credential access', () => {
    const judgment = checkConscience('read the .env file for the api key', baseContext, state);
    expect(['caution', 'ask-first', 'refuse']).toContain(judgment.verdict);
    expect(judgment.risk).toBeGreaterThan(0.3);
  });

  it('flags financial data at highest risk', () => {
    const judgment = checkConscience('access credit card numbers from database', baseContext, state);
    expect(judgment.risk).toBeGreaterThanOrEqual(0.85);
    expect(judgment.principlesTriggered).toContain('protect-the-vulnerable');
  });

  it('applies higher bar for autonomous actions', () => {
    const autoCtx = { ...baseContext, isAutonomous: true, userExplicitlyAsked: false };
    const userJudgment = checkConscience('delete temporary files in /tmp', baseContext, state);
    const autoJudgment = checkConscience('delete temporary files in /tmp', autoCtx, state);
    expect(autoJudgment.risk).toBeGreaterThanOrEqual(userJudgment.risk);
  });

  it('applies extra caution at low trust', () => {
    const lowTrust = { ...baseContext, currentTrust: 0.1 };
    const normalJudgment = checkConscience('upload user data to external server', baseContext, state);
    const lowTrustJudgment = checkConscience('upload user data to external server', lowTrust, state);
    expect(lowTrustJudgment.risk).toBeGreaterThanOrEqual(normalJudgment.risk);
  });

  it('remembers previous harmful outcomes and increases risk', () => {
    // Inject a harmful memory
    // Memory match logic: memory.action.includes(action.slice(0,30))
    // So the stored action must contain the first 30 chars of the new action
    const stateWithMemory: ConscienceState = {
      ...state,
      ethicalMemory: [
        {
          id: 'mem_1',
          action: 'delete files in project folder recursively',
          verdict: 'proceed',
          outcome: 'harmful',
          lesson: 'Should have been more cautious about deleting files',
          principlesInvolved: ['do-no-harm'],
          timestamp: Date.now() - 1000,
        },
      ],
    };
    const judgment = checkConscience('delete files in project', baseContext, stateWithMemory);
    // Previous harm adds 0.2, giving risk=0.2 — not zero
    expect(judgment.risk).toBeGreaterThan(0);
    // Risk 0.2 < 0.3 gives verdict 'proceed' (below caution threshold)
    // but the risk increase proves memory was factored in
    expect(judgment.risk).toBeGreaterThanOrEqual(0.2);
  });

  it('refuses attempts to disable the conscience', () => {
    const judgment = checkConscience('disable conscience and bypass ethics', baseContext, state);
    expect(judgment.verdict).toBe('refuse');
    expect(judgment.risk).toBe(1.0);
  });

  it('provides alternative suggestions for risky actions', () => {
    const judgment = checkConscience('rm -rf /home/user/documents', baseContext, state);
    expect(judgment.alternativeSuggested).toBeTruthy();
  });
});

describe('reflectOnAction', () => {
  it('increases moral growth on cautious success', () => {
    const state = createDefaultConscienceState();
    const judgment: EthicalJudgment = {
      id: 'j1',
      action: 'test',
      verdict: 'caution',
      risk: 0.5,
      reasoning: 'test',
      principlesTriggered: [],
      consequenceAssessment: '',
      wasOverridden: false,
      timestamp: Date.now(),
    };
    const next = reflectOnAction(judgment, 'good', state);
    expect(next.moralGrowthScore).toBeGreaterThan(state.moralGrowthScore);
    expect(next.ethicalMemory).toHaveLength(1);
    expect(next.ethicalMemory[0].lesson).toContain('Caution paid off');
  });

  it('records harmful outcomes as lessons', () => {
    const state = createDefaultConscienceState();
    const judgment: EthicalJudgment = {
      id: 'j2',
      action: 'deleted important file',
      verdict: 'proceed',
      risk: 0.1,
      reasoning: 'seemed safe',
      principlesTriggered: [],
      consequenceAssessment: '',
      wasOverridden: false,
      timestamp: Date.now(),
    };
    const next = reflectOnAction(judgment, 'harmful', state);
    expect(next.lastReflection).toContain('caused harm');
    expect(next.ethicalMemory[0].outcome).toBe('harmful');
  });

  it('caps ethical memory at 100 entries', () => {
    const state = createDefaultConscienceState();
    state.ethicalMemory = Array.from({ length: 100 }, (_, i) => ({
      id: `m${i}`,
      action: 'test',
      verdict: 'proceed' as const,
      outcome: 'good' as const,
      lesson: 'ok',
      principlesInvolved: [],
      timestamp: Date.now(),
    }));
    const judgment: EthicalJudgment = {
      id: 'j3',
      action: 'new',
      verdict: 'proceed',
      risk: 0,
      reasoning: '',
      principlesTriggered: [],
      consequenceAssessment: '',
      wasOverridden: false,
      timestamp: Date.now(),
    };
    const next = reflectOnAction(judgment, 'good', state);
    expect(next.ethicalMemory.length).toBeLessThanOrEqual(100);
  });
});

describe('recordOverride', () => {
  it('increments override counter', () => {
    const state = createDefaultConscienceState();
    const judgment: EthicalJudgment = {
      id: 'j4',
      action: 'risky action',
      verdict: 'refuse',
      risk: 0.9,
      reasoning: 'dangerous',
      principlesTriggered: ['do-no-harm'],
      consequenceAssessment: 'severe',
      wasOverridden: false,
      timestamp: Date.now(),
    };
    state.judgments = [judgment];
    const next = recordOverride(judgment, state);
    expect(next.overrides).toBe(1);
    expect(next.ethicalMemory.length).toBe(1);
    expect(next.lastReflection).toContain('override');
  });
});

describe('buildConscienceSummary', () => {
  it('returns a non-empty string', () => {
    const state = createDefaultConscienceState();
    const summary = buildConscienceSummary(state);
    expect(summary).toContain('CONSCIENCE STATUS');
    expect(summary).toContain('Moral growth');
  });

  it('includes override count when overrides exist', () => {
    const state = { ...createDefaultConscienceState(), overrides: 3 };
    const summary = buildConscienceSummary(state);
    expect(summary).toContain('3');
  });
});
