import { describe, it, expect } from 'vitest';
import { applySystemAddendum, buildSystemAddendum, heartSnapshotFromConsciousness } from './context';
import { createDefaultConscienceState } from './conscience';

describe('context pack', () => {
  it('buildSystemAddendum includes current date and time', () => {
    const add = buildSystemAddendum({});
    expect(add).toContain('=== TODAY (USE THIS — DO NOT GUESS) ===');
    expect(add).toContain('Today is');
    expect(add).toContain('RUNTIME DIRECTIVE');
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const hasWeekday = weekdays.some((d) => add.includes(d));
    expect(hasWeekday).toBe(true);
  });

  it('buildSystemAddendum composes champion + rag', () => {
    const add = buildSystemAddendum({
      ragContext: 'RAG: memory snippet',
      championPrompt: 'Be precise.',
    });
    expect(add).toContain('RAG: memory snippet');
    expect(add).toContain('EVOLVED COGNITIVE STRATEGY');
    expect(add).toContain('Be precise.');
  });

  it('buildSystemAddendum includes conscience when active', () => {
    const conscience = createDefaultConscienceState();
    const add = buildSystemAddendum({ conscienceState: conscience });
    expect(add).toContain('ETHICAL CONSCIENCE');
    expect(add).toContain('CONSCIENCE STATUS');
  });

  it('buildSystemAddendum includes heart attunement', () => {
    const add = buildSystemAddendum({
      heartContext: {
        emotion: 'concerned',
        intensity: 0.7,
        presence: 'thinking',
        trust: 0.4,
        intimacy: 0.35,
      },
    });
    expect(add).toContain('=== HEART');
    expect(add).toContain('concerned');
    expect(add).toMatch(/careful|verifiable/i);
  });

  it('heartSnapshotFromConsciousness maps store consciousness', () => {
    const snap = heartSnapshotFromConsciousness({
      soulFrame: { currentEmotion: 'warmth', emotionIntensity: 0.66, emotionHistory: [] },
      presence: 'present',
      trust: 0.5,
      intimacy: 0.4,
      totalInteractions: 0,
      birthTimestamp: 0,
      insights: [],
      name: 'AGI PRIME',
    });
    expect(snap.emotion).toBe('warmth');
    expect(snap.intensity).toBe(0.66);
    const add = buildSystemAddendum({ heartContext: snap });
    expect(add).toContain('warmth');
  });

  it('applySystemAddendum appends to existing system message', () => {
    const msgs = [
      { role: 'system', content: 'base' },
      { role: 'user', content: 'hi' },
    ];
    const out = applySystemAddendum(msgs, 'extra');
    expect(out[0].role).toBe('system');
    expect(out[0].content).toContain('base');
    expect(out[0].content).toContain('extra');
  });

  it('applySystemAddendum prepends system message if missing', () => {
    const msgs = [{ role: 'user', content: 'hi' }];
    const out = applySystemAddendum(msgs, 'extra');
    expect(out[0].role).toBe('system');
    expect(out[0].content).toContain('extra');
  });

  it('buildSystemAddendum includes host platform when provided', () => {
    const add = buildSystemAddendum({
      platformContext: { label: 'Steam Deck', platform: 'linux', compact: true },
    });
    expect(add).toContain('=== HOST ===');
    expect(add).toContain('Steam Deck');
    expect(add).toMatch(/compact|concise/i);
  });
});
