import { describe, expect, it } from 'vitest';
import { SOVEREIGN_POLICY, toPolicySnapshot } from './policy';

describe('policy snapshot adapter', () => {
  it('maps owner policy to gate policy snapshot', () => {
    const snapshot = toPolicySnapshot(SOVEREIGN_POLICY);
    expect(snapshot.conscienceEnabled).toBe(SOVEREIGN_POLICY.conscienceEnabled);
    expect(snapshot.allowNetworkCalls).toBe(SOVEREIGN_POLICY.allowNetworkCalls);
    expect(snapshot.allowLimitedExecOnly).toBe(SOVEREIGN_POLICY.allowLimitedExecOnly);
    expect(snapshot.allowToolCreation).toBe(SOVEREIGN_POLICY.allowToolCreation);
  });
});
