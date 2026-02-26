import { describe, expect, it } from 'vitest';
import { PrimeKernel } from './kernel';
import type { PolicySnapshot } from './gate';

const OPEN_POLICY: PolicySnapshot = {
  conscienceEnabled: true,
  requireConsentForRiskyActions: false,
  ethicalOverrideAllowed: true,
  allowNetworkCalls: true,
  allowFileSystemWrites: true,
  allowProcessExecution: true,
  allowScreenCapture: true,
  allowInputSimulation: true,
  allowToolCreation: true,
};

describe('prime kernel', () => {
  it('blocks creed mutation attempts before execution', async () => {
    const kernel = new PrimeKernel();
    const result = await kernel.dispatch(
      {
        id: 'act_1',
        type: 'write_file',
        payload: { path: 'src/prime/soul.ts', op: 'overwrite', text: 'DINO_BUDDY_CREED' },
      },
      { policy: OPEN_POLICY },
    );
    expect(result.ok).toBe(false);
    expect(result.stage).toBe('validate');
    expect(result.error).toContain('creed_mutation_block');
  });

  it('honors gate policy denies', async () => {
    const kernel = new PrimeKernel();
    const result = await kernel.dispatch(
      { id: 'act_2', type: 'web_search', payload: { query: 'hi' } },
      { policy: { ...OPEN_POLICY, allowNetworkCalls: false } },
    );
    expect(result.ok).toBe(false);
    expect(result.stage).toBe('authorize');
    expect(result.gate?.blocked).toBe(true);
  });

  it('runs recovery hook after execution failure', async () => {
    const kernel = new PrimeKernel();
    let recovered = false;
    const result = await kernel.dispatch(
      { id: 'act_3', type: 'read_file', payload: { path: 'x' } },
      { policy: OPEN_POLICY },
      {
        execute: async () => {
          throw new Error('boom');
        },
        recover: async () => {
          recovered = true;
        },
      },
    );
    expect(result.ok).toBe(false);
    expect(result.recovered).toBe(true);
    expect(result.stage).toBe('recover');
    expect(recovered).toBe(true);
  });

  it('handles concurrent dispatches with unique correlation ids', async () => {
    const kernel = new PrimeKernel();
    const [a, b] = await Promise.all([
      kernel.dispatch(
        { id: 'act_4', type: 'read_file', payload: { path: 'a' } },
        { policy: OPEN_POLICY },
      ),
      kernel.dispatch(
        { id: 'act_5', type: 'read_file', payload: { path: 'b' } },
        { policy: OPEN_POLICY },
      ),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.correlationId).not.toBe(b.correlationId);
  });
});
