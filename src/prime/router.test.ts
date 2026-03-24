import { describe, it, expect } from 'vitest';
import { routeToBrain, buildSlowBrainDirective, type RouterInput } from './router';

function makeInput(overrides: Partial<RouterInput> = {}): RouterInput {
  return {
    prompt: 'hello',
    recentTurns: [{ role: 'user', content: 'hi' }],
    complexityThreshold: 0.5,
    uncertaintyThreshold: 0.5,
    ...overrides,
  };
}

describe('routeToBrain', () => {
  it('routes short simple prompts to fast', () => {
    const result = routeToBrain(makeInput({ prompt: 'What time is it?' }));
    expect(result.route).toBe('fast');
    expect(result.complexity).toBeLessThan(0.5);
    expect(result.uncertainty).toBeLessThan(0.5);
  });

  it('routes complex multi-step prompts to slow', () => {
    const result = routeToBrain(
      makeInput({
        prompt:
          'Plan the architecture and implement a full benchmark suite, then evaluate each phase and refactor the module step by step while verifying tradeoffs.',
      }),
    );
    expect(result.route).toBe('slow');
    expect(result.reason).toContain('Complex');
  });

  it('routes high-uncertainty prompts to slow', () => {
    const result = routeToBrain(
      makeInput({
        prompt: 'Maybe try this novel approach? Not sure if it could work with adversarial inputs.',
        recentTurns: [],
      }),
    );
    expect(result.route).toBe('slow');
    expect(result.reason).toContain('uncertainty');
  });

  it('respects custom thresholds', () => {
    const prompt = 'Implement a step-by-step plan.';
    const lax = routeToBrain(makeInput({ prompt, complexityThreshold: 0.99 }));
    const strict = routeToBrain(makeInput({ prompt, complexityThreshold: 0.01 }));
    expect(lax.route).toBe('fast');
    expect(strict.route).toBe('slow');
  });

  it('returns complexity and uncertainty as 0-1', () => {
    const result = routeToBrain(
      makeInput({
        prompt: 'plan implement architecture evaluate benchmark step phase verify',
      }),
    );
    expect(result.complexity).toBeGreaterThanOrEqual(0);
    expect(result.complexity).toBeLessThanOrEqual(1);
    expect(result.uncertainty).toBeGreaterThanOrEqual(0);
    expect(result.uncertainty).toBeLessThanOrEqual(1);
  });

  it('short context increases uncertainty', () => {
    const withContext = routeToBrain(
      makeInput({
        prompt: 'hello',
        recentTurns: [
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'b' },
          { role: 'user', content: 'c' },
        ],
      }),
    );
    const noContext = routeToBrain(makeInput({ prompt: 'hello', recentTurns: [] }));
    expect(noContext.uncertainty).toBeGreaterThan(withContext.uncertainty);
  });

  it('empty prompt routes to fast', () => {
    const result = routeToBrain(makeInput({ prompt: '' }));
    expect(result.route).toBe('fast');
    expect(result.complexity).toBe(0);
  });
});

describe('buildSlowBrainDirective', () => {
  it('returns a non-empty string', () => {
    const directive = buildSlowBrainDirective();
    expect(directive.length).toBeGreaterThan(0);
  });

  it('includes planning and verification instructions', () => {
    const directive = buildSlowBrainDirective();
    expect(directive).toContain('Plan');
    expect(directive).toContain('verification');
  });
});
