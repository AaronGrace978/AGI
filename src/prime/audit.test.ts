// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Audit Log Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  createAuditLog,
  appendAuditEntry,
  filterAuditLog,
  auditSummary,
} from './audit';

describe('createAuditLog', () => {
  it('creates an empty log', () => {
    const log = createAuditLog();
    expect(log.entries).toHaveLength(0);
    expect(log.version).toBe(1);
  });
});

describe('appendAuditEntry', () => {
  it('appends entries with correct metadata', () => {
    let log = createAuditLog();
    log = appendAuditEntry(log, 'gate_block', 'execute_command', 'Blocked rm -rf');
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].kind).toBe('gate_block');
    expect(log.entries[0].action).toBe('execute_command');
    expect(log.entries[0].detail).toBe('Blocked rm -rf');
    expect(log.entries[0].timestamp).toBeGreaterThan(0);
  });

  it('caps entries at 2000', () => {
    let log = createAuditLog();
    for (let i = 0; i < 2100; i++) {
      log = appendAuditEntry(log, 'gate_pass', `action_${i}`, `detail ${i}`);
    }
    expect(log.entries.length).toBeLessThanOrEqual(2000);
  });

  it('includes optional extra fields', () => {
    let log = createAuditLog();
    log = appendAuditEntry(log, 'conscience_override', 'delete_file', 'User overrode', {
      tier: 'high-risk',
      verdict: 'refuse',
      operator: 'Aaron',
    });
    expect(log.entries[0].tier).toBe('high-risk');
    expect(log.entries[0].verdict).toBe('refuse');
    expect(log.entries[0].operator).toBe('Aaron');
  });
});

describe('filterAuditLog', () => {
  it('filters by kind', () => {
    let log = createAuditLog();
    log = appendAuditEntry(log, 'gate_block', 'a', 'd1');
    log = appendAuditEntry(log, 'gate_pass', 'b', 'd2');
    log = appendAuditEntry(log, 'gate_block', 'c', 'd3');
    const filtered = filterAuditLog(log, { kind: 'gate_block' });
    expect(filtered).toHaveLength(2);
  });

  it('filters by timestamp', () => {
    let log = createAuditLog();
    log = appendAuditEntry(log, 'gate_pass', 'a', 'old');
    // Manually set the first entry to be old
    log.entries[0].timestamp = Date.now() - 86_400_000 * 10;
    log = appendAuditEntry(log, 'gate_pass', 'b', 'new');
    const filtered = filterAuditLog(log, { since: Date.now() - 86_400_000 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].detail).toBe('new');
  });

  it('limits results', () => {
    let log = createAuditLog();
    for (let i = 0; i < 20; i++) {
      log = appendAuditEntry(log, 'gate_pass', `a_${i}`, `d_${i}`);
    }
    const filtered = filterAuditLog(log, { limit: 5 });
    expect(filtered).toHaveLength(5);
  });
});

describe('auditSummary', () => {
  it('counts by kind', () => {
    let log = createAuditLog();
    log = appendAuditEntry(log, 'gate_block', 'a', 'd');
    log = appendAuditEntry(log, 'gate_block', 'b', 'd');
    log = appendAuditEntry(log, 'gate_pass', 'c', 'd');
    log = appendAuditEntry(log, 'emergency_stop', 'd', 'd');
    const summary = auditSummary(log);
    expect(summary.gate_block).toBe(2);
    expect(summary.gate_pass).toBe(1);
    expect(summary.emergency_stop).toBe(1);
  });
});
