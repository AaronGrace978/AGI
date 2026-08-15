import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveGpuPolicy, gpuOffSwitches } = require('../../electron/gpu-policy.js') as {
  resolveGpuPolicy: (input?: { platform?: string; env?: Record<string, string | undefined>; argv?: string[] }) => {
    disableHardwareAcceleration: boolean;
    reason: string;
    switches: string[][];
  };
  gpuOffSwitches: (platform: string) => string[][];
};

describe('resolveGpuPolicy', () => {
  it('disables hardware acceleration by default on Windows', () => {
    const policy = resolveGpuPolicy({ platform: 'win32', env: {}, argv: ['electron'] });
    expect(policy.disableHardwareAcceleration).toBe(true);
    expect(policy.reason).toBe('windows-default');
    expect(policy.switches.map((s) => s[0])).toEqual(
      expect.arrayContaining(['disable-gpu', 'disable-gpu-compositing', 'disable-direct-composition']),
    );
  });

  it('keeps GPU on for macOS and Linux by default', () => {
    expect(resolveGpuPolicy({ platform: 'darwin', env: {}, argv: ['electron'] })).toMatchObject({
      disableHardwareAcceleration: false,
      reason: 'default',
      switches: [],
    });
    expect(resolveGpuPolicy({ platform: 'linux', env: {}, argv: ['electron'] })).toMatchObject({
      disableHardwareAcceleration: false,
      reason: 'default',
      switches: [],
    });
  });

  it('honors --safe-mode and AGI_PRIME_DISABLE_GPU even when opt-in is set', () => {
    const safeArg = resolveGpuPolicy({
      platform: 'darwin',
      env: { AGI_PRIME_ENABLE_GPU: '1' },
      argv: ['electron', '--safe-mode'],
    });
    expect(safeArg.disableHardwareAcceleration).toBe(true);
    expect(safeArg.reason).toBe('safe-mode');

    const safeEnv = resolveGpuPolicy({
      platform: 'win32',
      env: { AGI_PRIME_DISABLE_GPU: '1', AGI_PRIME_ENABLE_GPU: '1' },
      argv: ['electron'],
    });
    expect(safeEnv.disableHardwareAcceleration).toBe(true);
    expect(safeEnv.reason).toBe('safe-mode');
  });

  it('allows AGI_PRIME_ENABLE_GPU=1 to opt into hardware acceleration on Windows', () => {
    const policy = resolveGpuPolicy({
      platform: 'win32',
      env: { AGI_PRIME_ENABLE_GPU: '1' },
      argv: ['electron'],
    });
    expect(policy.disableHardwareAcceleration).toBe(false);
    expect(policy.reason).toBe('opt-in');
    expect(policy.switches).toEqual([]);
  });

  it('does not emit ozone-platform-hint on Linux', () => {
    const policy = resolveGpuPolicy({ platform: 'linux', env: {}, argv: ['electron'] });
    expect(policy.switches.some((s) => s[0] === 'ozone-platform-hint')).toBe(false);
    expect(gpuOffSwitches('linux').some((s) => s[0] === 'ozone-platform-hint')).toBe(false);
  });
});
