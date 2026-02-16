import { describe, it, expect } from 'vitest';
import { applySystemAddendum, buildSystemAddendum } from './context';
import { createDefaultConscienceState } from './conscience';

describe('context pack', () => {
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
});

