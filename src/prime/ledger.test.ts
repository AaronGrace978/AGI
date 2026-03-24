// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Ledger Integrity Regression Tests
//  Verify hash chains, append ordering, and finalization.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { createLedgerRun, appendLedgerEntry, finalizeLedgerRun } from './ledger';

describe('createLedgerRun', () => {
  it('creates a run with correct initial state', () => {
    const run = createLedgerRun('test', { foo: 'bar' });
    expect(run.runId).toMatch(/^run_test_/);
    expect(run.kind).toBe('test');
    expect(run.status).toBe('running');
    expect(run.finishedAt).toBeNull();
    expect(run.entries).toHaveLength(0);
    expect(run.integrity.algorithm).toBe('fnv1a32-chain');
    expect(run.integrity.chainHead).toBe('');
    expect(run.integrity.entryCount).toBe(0);
    expect(run.metadata).toEqual({ foo: 'bar' });
  });
});

describe('appendLedgerEntry', () => {
  it('appends entries with correct hash chain', () => {
    let run = createLedgerRun('test');
    run = appendLedgerEntry(run, 'step_1', { value: 1 });

    expect(run.entries).toHaveLength(1);
    expect(run.integrity.entryCount).toBe(1);
    expect(run.entries[0].prevHash).toBe('');
    expect(run.entries[0].hash).toBeTruthy();
    expect(run.integrity.chainHead).toBe(run.entries[0].hash);

    // Second entry chains to the first
    run = appendLedgerEntry(run, 'step_2', { value: 2 });
    expect(run.entries).toHaveLength(2);
    expect(run.entries[1].prevHash).toBe(run.entries[0].hash);
    expect(run.integrity.chainHead).toBe(run.entries[1].hash);
    expect(run.integrity.entryCount).toBe(2);
  });

  it('each entry has a unique hash', () => {
    let run = createLedgerRun('test');
    const hashes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      run = appendLedgerEntry(run, `step_${i}`, { i });
      hashes.add(run.entries[run.entries.length - 1].hash);
    }
    expect(hashes.size).toBe(20);
  });

  it('chain integrity: prevHash always matches previous entry hash', () => {
    let run = createLedgerRun('integrity');
    for (let i = 0; i < 10; i++) {
      run = appendLedgerEntry(run, `e_${i}`, { i });
    }
    for (let i = 1; i < run.entries.length; i++) {
      expect(run.entries[i].prevHash).toBe(run.entries[i - 1].hash);
    }
    expect(run.entries[0].prevHash).toBe('');
  });
});

describe('finalizeLedgerRun', () => {
  it('sets status to completed and records finishedAt', () => {
    let run = createLedgerRun('test');
    run = appendLedgerEntry(run, 'a', {});
    run = finalizeLedgerRun(run, { result: 'ok' });
    expect(run.status).toBe('completed');
    expect(run.finishedAt).toBeGreaterThan(0);
    expect(run.summary).toEqual({ result: 'ok' });
  });

  it('preserves all entries after finalization', () => {
    let run = createLedgerRun('test');
    for (let i = 0; i < 5; i++) {
      run = appendLedgerEntry(run, `s_${i}`, {});
    }
    const count = run.entries.length;
    run = finalizeLedgerRun(run);
    expect(run.entries.length).toBe(count);
    expect(run.integrity.entryCount).toBe(count);
  });
});
