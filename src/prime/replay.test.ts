// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Replay Determinism Tests
//  Same ledger data must always produce the same timeline.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildReplayTimeline, clampReplayCursor } from './replay';
import { createLedgerRun, appendLedgerEntry, finalizeLedgerRun } from './ledger';
import type { LedgerRun } from '../types';

function buildTestLedger(): LedgerRun {
  let run = createLedgerRun('cognitive', { goal: 'test goal' });
  run = appendLedgerEntry(run, 'cognitive_step', {
    type: 'observe',
    content: 'Initial observation',
    timestamp: 1000,
  });
  run = appendLedgerEntry(run, 'cognitive_step', {
    type: 'think',
    content: 'Planning...',
    timestamp: 2000,
  });
  run = appendLedgerEntry(run, 'cognitive_step', {
    type: 'act',
    content: 'Executing command',
    timestamp: 3000,
    actionType: 'execute_command',
    goalProgress: 0.5,
    actionResult: { success: true, output: 'done' },
  });
  run = appendLedgerEntry(run, 'cognitive_step', {
    type: 'reflect',
    content: 'Command succeeded',
    timestamp: 4000,
  });
  run = appendLedgerEntry(run, 'non_cognitive_event', { ignored: true });
  run = finalizeLedgerRun(run, { success: true });
  return run;
}

describe('buildReplayTimeline', () => {
  it('extracts only cognitive_step entries', () => {
    const run = buildTestLedger();
    const timeline = buildReplayTimeline(run);
    expect(timeline.steps).toHaveLength(4);
    // The non_cognitive_event should be excluded
  });

  it('preserves step types in order', () => {
    const timeline = buildReplayTimeline(buildTestLedger());
    expect(timeline.steps.map((s) => s.type)).toEqual(['observe', 'think', 'act', 'reflect']);
  });

  it('preserves action metadata', () => {
    const timeline = buildReplayTimeline(buildTestLedger());
    const actStep = timeline.steps.find((s) => s.type === 'act');
    expect(actStep?.actionType).toBe('execute_command');
    expect(actStep?.goalProgress).toBe(0.5);
    expect(actStep?.actionResult?.success).toBe(true);
  });

  it('is deterministic: same input always produces same output', () => {
    const run = buildTestLedger();
    const t1 = buildReplayTimeline(run);
    const t2 = buildReplayTimeline(run);
    expect(t1.steps.length).toBe(t2.steps.length);
    for (let i = 0; i < t1.steps.length; i++) {
      expect(t1.steps[i].type).toBe(t2.steps[i].type);
      expect(t1.steps[i].content).toBe(t2.steps[i].content);
      expect(t1.steps[i].timestamp).toBe(t2.steps[i].timestamp);
    }
  });

  it('copies run metadata', () => {
    const run = buildTestLedger();
    const timeline = buildReplayTimeline(run);
    expect(timeline.runId).toBe(run.runId);
    expect(timeline.kind).toBe('cognitive');
    expect(timeline.startedAt).toBe(run.startedAt);
  });

  it('handles empty ledger', () => {
    const run = createLedgerRun('empty');
    const timeline = buildReplayTimeline(run);
    expect(timeline.steps).toHaveLength(0);
  });
});

describe('clampReplayCursor', () => {
  it('clamps negative to 0', () => {
    expect(clampReplayCursor(-1, 10)).toBe(0);
    expect(clampReplayCursor(-100, 5)).toBe(0);
  });

  it('clamps above length to last index', () => {
    expect(clampReplayCursor(10, 5)).toBe(4);
    expect(clampReplayCursor(100, 3)).toBe(2);
  });

  it('returns 0 for empty timeline', () => {
    expect(clampReplayCursor(0, 0)).toBe(0);
    expect(clampReplayCursor(5, 0)).toBe(0);
  });

  it('passes valid indices through', () => {
    expect(clampReplayCursor(0, 5)).toBe(0);
    expect(clampReplayCursor(2, 5)).toBe(2);
    expect(clampReplayCursor(4, 5)).toBe(4);
  });
});
