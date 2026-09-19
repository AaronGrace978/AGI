import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildSystemInfo } = require('../../electron/system-info.js') as {
  buildSystemInfo: (input?: Record<string, unknown>) => Record<string, unknown>;
};

describe('buildSystemInfo', () => {
  it('returns a slim host payload without soul or consciousness', () => {
    const info = buildSystemInfo({
      uptime: 12.5,
      platform: 'win32',
      arch: 'x64',
      version: '1.1.1',
      isPackaged: true,
      isSteamDeck: false,
      hostLabel: 'Windows',
      nodeVersion: 'v20.0.0',
      electronVersion: '33.2.1',
      memory: { rss: 1, heapTotal: 2, heapUsed: 3, external: 4, arrayBuffers: 5 },
      paths: { userData: 'C:\\Users\\x\\AppData\\Roaming\\AGI PRIME' },
      gpuHardwareAcceleration: false,
      gpuPolicyReason: 'windows-default',
      soul: { name: 'should-not-leak', trust: 1, huge: 'x'.repeat(1000) },
      consciousness: { currentEmotion: 'should-not-leak', insights: [1, 2, 3] },
    });

    expect(info).not.toHaveProperty('soul');
    expect(info).not.toHaveProperty('consciousness');
    expect(info.version).toBe('1.1.1');
    expect(info.platform).toBe('win32');
    expect(info.gpuHardwareAcceleration).toBe(false);
    expect(info.gpuPolicyReason).toBe('windows-default');
    expect(info.paths).toEqual(expect.objectContaining({ userData: 'C:\\Users\\x\\AppData\\Roaming\\AGI PRIME' }));
  });
});
