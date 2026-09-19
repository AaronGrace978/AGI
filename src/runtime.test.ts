import { describe, it, expect } from 'vitest';
import { shouldUseCompactChrome, getRuntimeInfo } from './runtime';

describe('runtime chrome', () => {
  it('honors an explicit compactMode toggle', () => {
    expect(shouldUseCompactChrome(true)).toBe(true);
    expect(shouldUseCompactChrome(false)).toBe(false);
  });

  it('defaults to comfortable in Node tests without Electron runtime', () => {
    expect(getRuntimeInfo().platform).toBe('web');
    expect(shouldUseCompactChrome(undefined)).toBe(false);
  });
});
