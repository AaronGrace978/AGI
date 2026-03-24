import { describe, it, expect } from 'vitest';
import {
  calculateEffectiveImportance,
  determineMemoryLayer,
  findAssociations,
  buildRAGContext,
  type VectorMemory,
  type MemorySearchResult,
} from './memory';

function makeMem(overrides: Partial<VectorMemory> = {}): VectorMemory {
  return {
    id: 'mem_1',
    content: 'Test memory content about algorithms and data structures',
    type: 'semantic',
    timestamp: Date.now(),
    importance: 0.5,
    source: 'test',
    tags: ['test'],
    ...overrides,
  };
}

// ─── calculateEffectiveImportance ────────────────────────────────

describe('calculateEffectiveImportance', () => {
  it('returns importance for fresh memories', () => {
    const mem = makeMem({ timestamp: Date.now(), importance: 0.8 });
    const effective = calculateEffectiveImportance(mem);
    expect(effective).toBeGreaterThan(0.7);
    expect(effective).toBeLessThanOrEqual(1);
  });

  it('decays for old memories', () => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const mem = makeMem({ timestamp: oneWeekAgo, importance: 0.5 });
    const effective = calculateEffectiveImportance(mem);
    expect(effective).toBeLessThan(0.5);
    expect(effective).toBeGreaterThan(0);
  });

  it('never returns below 0.01', () => {
    const ancient = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const mem = makeMem({ timestamp: ancient, importance: 0.1, decayRate: 1 });
    expect(calculateEffectiveImportance(mem)).toBeGreaterThanOrEqual(0.01);
  });

  it('access count slows decay', () => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rarely = makeMem({ timestamp: oneWeekAgo, importance: 0.5, accessCount: 0 });
    const frequently = makeMem({ timestamp: oneWeekAgo, importance: 0.5, accessCount: 6 });
    expect(calculateEffectiveImportance(frequently)).toBeGreaterThan(calculateEffectiveImportance(rarely));
  });

  it('emotion bonus slows decay', () => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const noEmotion = makeMem({ timestamp: oneWeekAgo, importance: 0.5 });
    const withEmotion = makeMem({ timestamp: oneWeekAgo, importance: 0.5, emotion: 'joyful' });
    expect(calculateEffectiveImportance(withEmotion)).toBeGreaterThan(calculateEffectiveImportance(noEmotion));
  });
});

// ─── determineMemoryLayer ────────────────────────────────────────

describe('determineMemoryLayer', () => {
  it('autobiographical → core', () => {
    expect(determineMemoryLayer(makeMem({ type: 'autobiographical' }))).toBe('core');
  });

  it('high importance → core', () => {
    expect(determineMemoryLayer(makeMem({ importance: 0.95 }))).toBe('core');
  });

  it('frequently accessed + important → core', () => {
    expect(determineMemoryLayer(makeMem({ accessCount: 12, importance: 0.75 }))).toBe('core');
  });

  it('very recent → working', () => {
    expect(determineMemoryLayer(makeMem({ timestamp: Date.now() - 60_000 }))).toBe('working');
  });

  it('few hours old → short-term', () => {
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    expect(determineMemoryLayer(makeMem({ timestamp: fourHoursAgo, importance: 0.3 }))).toBe('short-term');
  });

  it('old memory → long-term', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    expect(determineMemoryLayer(makeMem({ timestamp: twoDaysAgo, importance: 0.3 }))).toBe('long-term');
  });
});

// ─── findAssociations ────────────────────────────────────────────

describe('findAssociations', () => {
  const existing: VectorMemory[] = [
    makeMem({ id: 'a', tags: ['test', 'algo'], content: 'algorithms and sorting techniques' }),
    makeMem({ id: 'b', tags: ['music'], content: 'piano sonata in D minor' }),
    makeMem({ id: 'c', tags: ['test', 'data'], content: 'data structures and algorithms advanced' }),
  ];

  it('finds associations by tag overlap', () => {
    const result = findAssociations({ content: 'something else', tags: ['test', 'algo'] }, existing);
    expect(result).toContain('a');
  });

  it('finds associations by content overlap', () => {
    const result = findAssociations({ content: 'algorithms and data structures', tags: [] }, existing);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('a');
  });

  it('respects maxAssociations', () => {
    const result = findAssociations({ content: 'algorithms and data structures', tags: ['test'] }, existing, 1);
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('returns empty for unrelated input', () => {
    const result = findAssociations({ content: 'xyzzy foobar', tags: ['unrelated'] }, existing);
    expect(result.length).toBe(0);
  });
});

// ─── buildRAGContext ─────────────────────────────────────────────

describe('buildRAGContext', () => {
  it('returns empty string for no memories', () => {
    expect(buildRAGContext([])).toBe('');
  });

  it('formats memories with type, age, and similarity', () => {
    const results: MemorySearchResult[] = [
      { memory: makeMem({ type: 'semantic', content: 'fact about cats' }), similarity: 0.92 },
    ];
    const context = buildRAGContext(results);
    expect(context).toContain('SEMANTIC');
    expect(context).toContain('92%');
    expect(context).toContain('fact about cats');
    expect(context).toContain('RECALLED MEMORIES');
  });

  it('respects maxChars limit', () => {
    const bigContent = 'x'.repeat(5000);
    const results: MemorySearchResult[] = [
      { memory: makeMem({ content: bigContent }), similarity: 0.9 },
      { memory: makeMem({ content: bigContent }), similarity: 0.8 },
    ];
    const context = buildRAGContext(results, 6000);
    expect(context.length).toBeLessThan(7000);
  });

  it('includes emotion tag when present', () => {
    const results: MemorySearchResult[] = [
      { memory: makeMem({ emotion: 'joyful', content: 'happy memory' }), similarity: 0.85 },
    ];
    const context = buildRAGContext(results);
    expect(context).toContain('joyful');
  });
});
