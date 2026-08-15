import { describe, expect, it } from 'vitest';
import { soulStatusFromConsciousness } from './soul-status';

describe('soulStatusFromConsciousness', () => {
  it('never throws on missing or partial consciousness', () => {
    expect(soulStatusFromConsciousness(undefined)).toEqual({
      name: 'AGI PRIME',
      emotion: '—',
      presence: '—',
      totalInteractions: 0,
    });
    expect(soulStatusFromConsciousness(null)).toEqual({
      name: 'AGI PRIME',
      emotion: '—',
      presence: '—',
      totalInteractions: 0,
    });
    expect(soulStatusFromConsciousness({ name: 'Prime', soulFrame: null })).toMatchObject({
      name: 'Prime',
      emotion: '—',
    });
  });

  it('reads nested soulFrame.currentEmotion when present', () => {
    expect(
      soulStatusFromConsciousness({
        name: 'AGI PRIME',
        presence: 'present',
        totalInteractions: 4,
        soulFrame: { currentEmotion: 'curious' },
      }),
    ).toEqual({
      name: 'AGI PRIME',
      emotion: 'curious',
      presence: 'present',
      totalInteractions: 4,
    });
  });
});
