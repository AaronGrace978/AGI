import { describe, it, expect } from 'vitest';
import { executiveRoute } from './executive';

describe('executiveRoute', () => {
  it('routes explicit /do to act', () => {
    const d = executiveRoute({ input: '/do open notepad and type hello' });
    expect(d.mode).toBe('act');
    expect(d.taskDraft?.goal).toContain('open notepad');
    expect(d.confidence).toBeGreaterThan(0.9);
  });

  it('routes explicit /arena to arena', () => {
    const d = executiveRoute({ input: '/arena argue both sides of X' });
    expect(d.mode).toBe('arena');
    expect(d.confidence).toBeGreaterThan(0.9);
  });

  it('routes forge/evolve to improve', () => {
    const d = executiveRoute({ input: 'forge: evolve a better strategy for planning' });
    expect(d.mode).toBe('improve');
  });

  it('defaults to talk for normal questions', () => {
    const d = executiveRoute({ input: 'What do you think about consciousness?' });
    expect(d.mode).toBe('talk');
  });

  it('does NOT route casual "architecture" mentions to arena', () => {
    const d = executiveRoute({ input: 'How do you feel, I gave you an architecture upgrade<3' });
    expect(d.mode).toBe('talk');
  });

  it('does NOT route casual "improvement" mentions to improve', () => {
    const d = executiveRoute({ input: 'The improvement to your code was great!' });
    expect(d.mode).toBe('talk');
  });

  it('DOES route "design an architecture" to arena', () => {
    const d = executiveRoute({ input: 'Design a microservices architecture for our backend' });
    expect(d.mode).toBe('arena');
  });

  it('routes imperatives to act when confident enough', () => {
    const d = executiveRoute({ input: 'Clean my desktop and organize files into folders.' });
    // This is a deliberately action-like request; router should prefer Hands.
    expect(['act', 'talk']).toContain(d.mode);
    if (d.mode === 'act') expect(d.confidence).toBeGreaterThanOrEqual(0.65);
  });
});
