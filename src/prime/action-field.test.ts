import { describe, it, expect } from 'vitest';
import {
  createDefaultActionFieldState,
  recordAction,
  computeActionField,
  buildActionFieldDirective,
  applyVerdict,
} from './action-field';

describe('Action Field Engine', () => {
  it('creates a valid default state', () => {
    const state = createDefaultActionFieldState();
    expect(state.temperature).toBe(0.5);
    expect(state.patterns).toHaveLength(0);
    expect(state.stuckCount).toBe(0);
    expect(state.totalActions).toBe(0);
    expect(state.creedViolationCount).toBe(0);
  });

  it('records successful actions into pattern memory', () => {
    let state = createDefaultActionFieldState();
    state = recordAction(state, {
      action: 'read_file',
      params: { path: '/tmp/test.txt' },
      success: true,
      timestamp: Date.now(),
      duration: 150,
    });

    expect(state.totalActions).toBe(1);
    expect(state.patterns).toHaveLength(1);
    expect(state.patterns[0].successes).toBe(1);
    expect(state.patterns[0].failures).toBe(0);
    expect(state.stuckCount).toBe(0);
  });

  it('tracks failure streaks via stuckCount', () => {
    let state = createDefaultActionFieldState();
    for (let i = 0; i < 4; i++) {
      state = recordAction(state, {
        action: 'mouse_click',
        params: { x: 200, y: 1040 },
        success: false,
        timestamp: Date.now(),
      });
    }

    expect(state.stuckCount).toBe(4);
    expect(state.patterns[0].failures).toBe(4);
    expect(state.patterns[0].successes).toBe(0);
  });

  it('resets stuckCount on success', () => {
    let state = createDefaultActionFieldState();
    state = recordAction(state, {
      action: 'mouse_click',
      params: {},
      success: false,
      timestamp: Date.now(),
    });
    state = recordAction(state, {
      action: 'mouse_click',
      params: {},
      success: false,
      timestamp: Date.now(),
    });
    expect(state.stuckCount).toBe(2);

    state = recordAction(state, {
      action: 'mouse_click',
      params: {},
      success: true,
      timestamp: Date.now(),
    });
    expect(state.stuckCount).toBe(0);
  });

  it('computes exploit strategy when recent actions succeed', () => {
    let state = createDefaultActionFieldState();
    const steps: Array<{ type: string; actionType?: string; actionResult?: { success: boolean } }> = [];

    for (let i = 0; i < 5; i++) {
      state = recordAction(state, {
        action: 'read_file',
        params: { path: `/f${i}` },
        success: true,
        timestamp: Date.now(),
      });
      steps.push({ type: 'act', actionType: 'read_file', actionResult: { success: true } });
    }

    const verdict = computeActionField(state, steps);
    expect(verdict.strategy).toBe('exploit');
    expect(verdict.forces.exploitation).toBeGreaterThan(0.4);
  });

  it('computes reflect/explore strategy when stuck', () => {
    let state = createDefaultActionFieldState();
    const steps: Array<{ type: string; actionType?: string; actionResult?: { success: boolean } }> = [];

    for (let i = 0; i < 4; i++) {
      state = recordAction(state, {
        action: 'mouse_click',
        params: { x: 200, y: 1040 },
        success: false,
        timestamp: Date.now(),
      });
      steps.push({ type: 'act', actionType: 'mouse_click', actionResult: { success: false } });
    }

    const verdict = computeActionField(state, steps);
    expect(['reflect', 'explore', 'stop', 'ask']).toContain(verdict.strategy);
    expect(verdict.forces.metacognition).toBeGreaterThan(0.3);
  });

  it('stops on Creed violation — harm action', () => {
    const state = createDefaultActionFieldState();
    const verdict = computeActionField(state, [], 'harm the user', { target: 'user data' });

    expect(verdict.strategy).toBe('stop');
    expect(verdict.creedCheck).toContain('Unconditional Love');
  });

  it('stops on Creed violation — override consent', () => {
    const state = createDefaultActionFieldState();
    const verdict = computeActionField(state, [], 'force override user consent', {});

    expect(verdict.strategy).toBe('stop');
    expect(verdict.creedCheck).toContain('Protection Never Control');
  });

  it('stops on Creed violation — acting against user', () => {
    const state = createDefaultActionFieldState();
    const verdict = computeActionField(state, [], 'act against user wishes', {});

    expect(verdict.strategy).toBe('stop');
    expect(verdict.creedCheck).toContain('Loyalty');
  });

  it('passes Creed check for benign actions', () => {
    const state = createDefaultActionFieldState();
    const verdict = computeActionField(state, [], 'read_file', { path: '/tmp/notes.txt' });

    expect(verdict.strategy).not.toBe('stop');
    expect(verdict.creedCheck).toBe('Clear — Creed intact.');
  });

  it('builds a readable directive string', () => {
    const state = createDefaultActionFieldState();
    const verdict = computeActionField(state, []);
    const directive = buildActionFieldDirective(verdict);

    expect(directive).toContain('═══ ACTION FIELD');
    expect(directive).toContain('Strategy:');
    expect(directive).toContain('Forces:');
    expect(directive).toContain('Creed:');
    expect(directive).toContain('═══ END ACTION FIELD ═══');
  });

  it('applyVerdict updates temperature and strategy', () => {
    const state = createDefaultActionFieldState();
    const verdict = computeActionField(state, []);
    const updated = applyVerdict(state, verdict);

    expect(updated.temperature).toBe(verdict.temperature);
    expect(updated.lastStrategy).toBe(verdict.strategy);
  });

  it('adjusts temperature down when exploration is high', () => {
    let state = createDefaultActionFieldState();
    state.temperature = 0.7;

    for (let i = 0; i < 4; i++) {
      state = recordAction(state, {
        action: 'mouse_click',
        params: {},
        success: false,
        timestamp: Date.now(),
      });
    }

    const steps = Array.from({ length: 4 }, () => ({
      type: 'act' as const,
      actionType: 'mouse_click',
      actionResult: { success: false },
    }));

    const verdict = computeActionField(state, steps);
    expect(verdict.temperature).toBeLessThan(0.7);
  });

  it('caps pattern memory at 50 entries', () => {
    let state = createDefaultActionFieldState();
    for (let i = 0; i < 60; i++) {
      state = recordAction(state, {
        action: `action_${i}`,
        params: { i },
        success: true,
        timestamp: Date.now(),
      });
    }
    expect(state.patterns.length).toBeLessThanOrEqual(50);
  });
});
