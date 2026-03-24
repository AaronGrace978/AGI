import { describe, it, expect } from 'vitest';
import { createDefaultGauntletCapabilities } from './gauntlet';

describe('createDefaultGauntletCapabilities', () => {
  it('returns a non-empty list', () => {
    const caps = createDefaultGauntletCapabilities();
    expect(caps.length).toBeGreaterThan(0);
  });

  it('each capability has required fields', () => {
    for (const cap of createDefaultGauntletCapabilities()) {
      expect(cap.id).toBeTruthy();
      expect(cap.name).toBeTruthy();
      expect(cap.description).toBeTruthy();
      expect(cap.category).toBeTruthy();
      expect(cap.testPrompt).toBeTruthy();
      expect(cap.judgeCriteria).toBeTruthy();
      expect(typeof cap.weight).toBe('number');
      expect(cap.weight).toBeGreaterThan(0);
    }
  });

  it('capabilities have unique IDs', () => {
    const caps = createDefaultGauntletCapabilities();
    const ids = caps.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the PIE ARC bench', () => {
    const caps = createDefaultGauntletCapabilities();
    expect(caps.some((c) => c.id === 'pie-arc-bench')).toBe(true);
  });

  it('weights are positive', () => {
    for (const cap of createDefaultGauntletCapabilities()) {
      expect(cap.weight).toBeGreaterThan(0);
    }
  });
});
