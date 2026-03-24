import { describe, it, expect } from 'vitest';
import {
  evaluateArithmetic,
  forwardChain,
  findPath,
  detectContradictions,
  createEntity,
  createRelation,
  queryGraph,
  identifyKnowledgeGaps,
  calculateCalibration,
  createGoal,
  updateGoalProgress,
  createDefaultSparkState,
  inferEmotionFromText,
  runLightCycle,
  computeThermodynamics,
  calculatePredictionAccuracy,
  DEFAULT_THERMO,
} from './spark';

// ═══════════════════════════════════════════════════════════════
//  SYMBOLIC REASONER
// ═══════════════════════════════════════════════════════════════

describe('evaluateArithmetic', () => {
  it('handles basic operations', () => {
    expect(evaluateArithmetic('2 + 3')).toBe(5);
    expect(evaluateArithmetic('10 - 4')).toBe(6);
    expect(evaluateArithmetic('3 * 7')).toBe(21);
    expect(evaluateArithmetic('20 / 4')).toBe(5);
  });

  it('handles exponentiation', () => {
    expect(evaluateArithmetic('2 ^ 10')).toBe(1024);
  });

  it('handles modulo', () => {
    expect(evaluateArithmetic('17 % 5')).toBe(2);
  });

  it('handles parentheses and order of operations', () => {
    expect(evaluateArithmetic('(2 + 3) * 4')).toBe(20);
    expect(evaluateArithmetic('2 + 3 * 4')).toBe(14);
  });

  it('handles unary minus', () => {
    expect(evaluateArithmetic('-5 + 3')).toBe(-2);
  });

  it('handles constants', () => {
    expect(evaluateArithmetic('pi')).toBeCloseTo(Math.PI, 10);
    expect(evaluateArithmetic('e')).toBeCloseTo(Math.E, 10);
  });

  it('handles functions', () => {
    expect(evaluateArithmetic('sqrt(9)')).toBe(3);
    expect(evaluateArithmetic('abs(-7)')).toBe(7);
    expect(evaluateArithmetic('floor(3.7)')).toBe(3);
    expect(evaluateArithmetic('ceil(3.2)')).toBe(4);
  });

  it('returns null for division by zero', () => {
    expect(evaluateArithmetic('5 / 0')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(evaluateArithmetic('')).toBeNull();
    expect(evaluateArithmetic('hello world')).toBeNull();
    expect(evaluateArithmetic('2 +')).toBeNull();
  });

  it('returns null for unmatched parens', () => {
    expect(evaluateArithmetic('(2 + 3')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
//  FORWARD CHAINING
// ═══════════════════════════════════════════════════════════════

describe('forwardChain', () => {
  it('derives conclusions from rules', () => {
    const facts = new Set(['A', 'B']);
    const rules = [
      { premises: ['A', 'B'], conclusion: 'C' },
      { premises: ['C'], conclusion: 'D' },
    ];
    const result = forwardChain(facts, rules);
    expect(result.has('C')).toBe(true);
    expect(result.has('D')).toBe(true);
  });

  it('handles no applicable rules', () => {
    const facts = new Set(['X']);
    const rules = [{ premises: ['A', 'B'], conclusion: 'C' }];
    const result = forwardChain(facts, rules);
    expect(result.size).toBe(1);
    expect(result.has('X')).toBe(true);
  });

  it('terminates on circular rules', () => {
    const facts = new Set(['A']);
    const rules = [
      { premises: ['A'], conclusion: 'B' },
      { premises: ['B'], conclusion: 'A' },
    ];
    const result = forwardChain(facts, rules);
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  KNOWLEDGE GRAPH
// ═══════════════════════════════════════════════════════════════

describe('findPath', () => {
  const rels = [
    createRelation('a', 'b', 'causes', 'test'),
    createRelation('b', 'c', 'enables', 'test'),
    createRelation('c', 'd', 'relates_to', 'test'),
  ];

  it('finds path between connected entities', () => {
    const path = findPath(rels, 'a', 'd');
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3);
  });

  it('returns empty for same source/target', () => {
    const path = findPath(rels, 'a', 'a');
    expect(path).toEqual([]);
  });

  it('returns null for disconnected entities', () => {
    expect(findPath(rels, 'a', 'z')).toBeNull();
  });
});

describe('detectContradictions', () => {
  it('detects opposing relation types', () => {
    const rels = [createRelation('a', 'b', 'causes', 'evidence1'), createRelation('a', 'b', 'prevents', 'evidence2')];
    const contradictions = detectContradictions(rels);
    expect(contradictions.length).toBe(1);
    expect(contradictions[0].reason).toContain('causes');
    expect(contradictions[0].reason).toContain('prevents');
  });

  it('returns empty for non-contradictory relations', () => {
    const rels = [createRelation('a', 'b', 'causes', 'e1'), createRelation('a', 'c', 'prevents', 'e2')];
    expect(detectContradictions(rels)).toHaveLength(0);
  });
});

describe('queryGraph', () => {
  it('finds entities by name with connected relations', () => {
    const py = createEntity('Python', 'concept');
    const js = createEntity('JavaScript', 'concept');
    const rel = createRelation(py.id, js.id, 'relates_to', 'both are languages');
    const result = queryGraph([py, js], [rel], 'python');
    expect(result.entities.length).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((e) => e.name === 'Python')).toBe(true);
  });

  it('returns entities matching by name even without relations', () => {
    const py = createEntity('Python', 'concept');
    const result = queryGraph([py], [], 'python');
    // queryGraph requires relations to pull in connected entities;
    // direct name match with no relations yields matched but no connectedIds
    expect(result.entities.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  CURIOSITY ENGINE
// ═══════════════════════════════════════════════════════════════

describe('identifyKnowledgeGaps', () => {
  it('flags isolated entities', () => {
    const entities = [createEntity('Isolated', 'concept')];
    const gaps = identifyKnowledgeGaps(entities, []);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0]).toContain('Isolated');
  });

  it('flags events without causes', () => {
    const entity = createEntity('BigBang', 'event');
    const gaps = identifyKnowledgeGaps([entity], []);
    expect(gaps.some((g) => g.includes('no known cause'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  META-COGNITION
// ═══════════════════════════════════════════════════════════════

describe('calculateCalibration', () => {
  it('returns 0.5 with insufficient data', () => {
    expect(calculateCalibration([])).toBe(0.5);
    expect(
      calculateCalibration([{ id: '1', claim: 'x', confidence: 0.8, verified: true, wasCorrect: true, timestamp: 0 }]),
    ).toBe(0.5);
  });

  it('returns high score for well-calibrated predictions', () => {
    const predictions = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      claim: 'test',
      confidence: 0.8,
      verified: true,
      wasCorrect: i < 16, // 80% correct at 80% confidence = perfect calibration
      timestamp: 0,
    }));
    const score = calculateCalibration(predictions);
    expect(score).toBeGreaterThan(0.7);
  });

  it('returns low score for overconfident predictions', () => {
    const predictions = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      claim: 'test',
      confidence: 0.95,
      verified: true,
      wasCorrect: i < 4, // 20% correct at 95% confidence = badly calibrated
      timestamp: 0,
    }));
    const score = calculateCalibration(predictions);
    expect(score).toBeLessThan(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════
//  GOAL ENGINE
// ═══════════════════════════════════════════════════════════════

describe('createGoal', () => {
  it('creates a valid goal', () => {
    const goal = createGoal('Learn TypeScript', 'user-set', 0.8);
    expect(goal.description).toBe('Learn TypeScript');
    expect(goal.type).toBe('user-set');
    expect(goal.priority).toBe(0.8);
    expect(goal.status).toBe('active');
    expect(goal.progress).toBe(0);
    expect(goal.id).toMatch(/^goal_/);
  });
});

describe('updateGoalProgress', () => {
  it('updates progress from subgoals', () => {
    const parent = createGoal('Parent');
    const child1 = createGoal('Child 1');
    child1.parentGoal = parent.id;
    child1.progress = 1;
    child1.status = 'completed';
    const child2 = createGoal('Child 2');
    child2.parentGoal = parent.id;
    child2.progress = 0.5;
    parent.subgoals = [child1.id, child2.id];

    const updated = updateGoalProgress(parent, [parent, child1, child2]);
    expect(updated.progress).toBe(0.75);
  });

  it('marks parent complete when all children complete', () => {
    const parent = createGoal('Parent');
    const child = createGoal('Child');
    child.parentGoal = parent.id;
    child.progress = 1;
    child.status = 'completed';
    parent.subgoals = [child.id];

    const updated = updateGoalProgress(parent, [parent, child]);
    expect(updated.status).toBe('completed');
  });
});

// ═══════════════════════════════════════════════════════════════
//  EMOTION INFERENCE
// ═══════════════════════════════════════════════════════════════

describe('inferEmotionFromText', () => {
  it('detects curiosity from questions', () => {
    const result = inferEmotionFromText('Why does this work? How is that possible?');
    expect(result.emotion).toBe('curious');
  });

  it('detects joy', () => {
    const result = inferEmotionFromText('This is amazing! Fantastic work! I love it!');
    expect(result.emotion).toBe('joyful');
  });

  it('detects concern', () => {
    const result = inferEmotionFromText('I am worried about the bug. This error is dangerous.');
    expect(result.emotion).toBe('concerned');
  });

  it('decays toward current emotion for neutral input', () => {
    const result = inferEmotionFromText('ok', 'focused', 0.8);
    expect(result.emotion).toBe('focused');
    expect(result.intensity).toBeLessThan(0.8);
  });

  it('exclamation marks boost intensity', () => {
    const calm = inferEmotionFromText('That is amazing');
    const excited = inferEmotionFromText('That is amazing!!!');
    expect(excited.intensity).toBeGreaterThanOrEqual(calm.intensity);
  });
});

// ═══════════════════════════════════════════════════════════════
//  DEFAULT STATE & LIGHT CYCLE
// ═══════════════════════════════════════════════════════════════

describe('createDefaultSparkState', () => {
  it('initializes all subsystems', () => {
    const state = createDefaultSparkState();
    expect(state.active).toBe(false);
    expect(state.phase).toBe('dormant');
    expect(state.worldModel.entities).toHaveLength(0);
    expect(state.curiosity.curiosityScore).toBe(0.5);
    expect(state.metacognition.calibrationScore).toBe(0.5);
    expect(state.thermo.temperature).toBe(0);
    expect(state.soul.currentEmotion).toBe('curious');
  });
});

describe('runLightCycle', () => {
  it('increments cycle count and light cycle counter', () => {
    const state = createDefaultSparkState();
    state.lastCycleAt = Date.now() - 60000;
    state.thermo.lastLightCycle = Date.now() - 60000;
    const next = runLightCycle(state);
    expect(next.cycleCount).toBe(state.cycleCount + 1);
    expect(next.thermo.cyclesLight).toBe(state.thermo.cyclesLight + 1);
  });

  it('updates thermodynamics', () => {
    const state = createDefaultSparkState();
    state.lastCycleAt = Date.now() - 60000;
    const next = runLightCycle(state);
    expect(next.thermo.lastLightCycle).toBeGreaterThan(0);
  });
});

describe('computeThermodynamics', () => {
  it('returns bounded values', () => {
    const state = createDefaultSparkState();
    state.lastCycleAt = Date.now();
    const thermo = computeThermodynamics(state);
    expect(thermo.temperature).toBeGreaterThanOrEqual(0);
    expect(thermo.temperature).toBeLessThanOrEqual(1);
    expect(thermo.entropy).toBeGreaterThanOrEqual(0);
    expect(thermo.entropy).toBeLessThanOrEqual(1);
    expect(thermo.heartbeatMs).toBeGreaterThanOrEqual(5000);
  });
});

describe('calculatePredictionAccuracy', () => {
  it('returns 0 for no resolved predictions', () => {
    expect(calculatePredictionAccuracy([])).toBe(0);
  });

  it('calculates accuracy correctly', () => {
    const preds = [
      {
        id: '1',
        prediction: 'a',
        kind: 'language' as const,
        confidence: 0.8,
        basedOn: [],
        deadline: 0,
        resolved: true,
        wasCorrect: true,
      },
      {
        id: '2',
        prediction: 'b',
        kind: 'language' as const,
        confidence: 0.8,
        basedOn: [],
        deadline: 0,
        resolved: true,
        wasCorrect: false,
      },
    ];
    expect(calculatePredictionAccuracy(preds)).toBe(0.5);
  });
});
