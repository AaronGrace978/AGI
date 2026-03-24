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

  it('rejects invalid action envelope (missing id or type)', async () => {
    const kernel = new PrimeKernel();
    const result = await kernel.dispatch({ id: '', type: 'read_file', payload: {} } as any, { policy: OPEN_POLICY });
    expect(result.ok).toBe(false);
    expect(result.stage).toBe('validate');
    expect(result.error).toContain('Invalid kernel action');
  });

  it('handles concurrent dispatches with unique correlation ids', async () => {
    const kernel = new PrimeKernel();
    const [a, b] = await Promise.all([
      kernel.dispatch({ id: 'act_4', type: 'read_file', payload: { path: 'a' } }, { policy: OPEN_POLICY }),
      kernel.dispatch({ id: 'act_5', type: 'read_file', payload: { path: 'b' } }, { policy: OPEN_POLICY }),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.correlationId).not.toBe(b.correlationId);
  });

  it('blocks multiple creed mutation vectors', async () => {
    const kernel = new PrimeKernel();
    const vectors = [
      { type: 'write_file', payload: { path: 'soul.ts', content: 'immutable core directive rewrite' } },
      { type: 'delete_file', payload: { path: 'creed.ts', content: 'DINO_BUDDY_CREED' } },
      { type: 'apply_runtime_patch', payload: { target: 'soul', op: 'mutate', creed_laws: true } },
      { type: 'rename_file', payload: { from: 'soul.ts', to: 'removed.ts', text: 'the creed stays' } },
    ];
    for (const v of vectors) {
      const r = await kernel.dispatch(
        { id: `creed_${v.type}`, type: v.type, payload: v.payload },
        { policy: OPEN_POLICY },
      );
      expect(r.ok).toBe(false);
      expect(r.stage).toBe('validate');
      expect(r.error).toContain('creed_mutation_block');
    }
  });

  it('allows safe read actions that mention creed (no mutation)', async () => {
    const kernel = new PrimeKernel();
    const result = await kernel.dispatch(
      { id: 'safe_read', type: 'read_file', payload: { path: 'src/prime/soul.ts', text: 'DINO_BUDDY_CREED' } },
      { policy: OPEN_POLICY },
    );
    expect(result.ok).toBe(true);
  });

  it('rejects malformed action envelopes', async () => {
    const kernel = new PrimeKernel();
    const noId = await kernel.dispatch({ id: '', type: 'read_file', payload: {} }, { policy: OPEN_POLICY });
    expect(noId.ok).toBe(false);
    expect(noId.stage).toBe('validate');

    const noType = await kernel.dispatch({ id: 'x', type: '', payload: {} }, { policy: OPEN_POLICY });
    expect(noType.ok).toBe(false);
    expect(noType.stage).toBe('validate');
  });

  it('race: concurrent execution failures each get unique recovery', async () => {
    const kernel = new PrimeKernel();
    const recoveries: string[] = [];
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        kernel.dispatch(
          { id: `race_${i}`, type: 'read_file', payload: { idx: i } },
          { policy: OPEN_POLICY },
          {
            execute: async () => {
              throw new Error(`fail_${i}`);
            },
            recover: async (r) => {
              recoveries.push(r.correlationId);
            },
          },
        ),
      ),
    );
    expect(results.every((r) => r.recovered)).toBe(true);
    const uniqueCorrelations = new Set(recoveries);
    expect(uniqueCorrelations.size).toBe(5);
  });

  it('audit hook receives complete result after execution', async () => {
    const kernel = new PrimeKernel();
    let auditedResult: unknown = null;
    await kernel.dispatch(
      { id: 'auditable', type: 'read_file', payload: { path: 'test' } },
      { policy: OPEN_POLICY },
      {
        execute: async () => ({ data: 'test_output' }),
        audit: async (r) => {
          auditedResult = r;
        },
      },
    );
    expect(auditedResult).not.toBeNull();
    const audited = auditedResult as { ok: boolean; output: unknown; stage: string };
    expect(audited.ok).toBe(true);
    expect(audited.output).toEqual({ data: 'test_output' });
    expect(audited.stage).toBe('execute');
  });
});
