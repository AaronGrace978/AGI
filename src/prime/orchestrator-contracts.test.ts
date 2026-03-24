import { describe, expect, it } from 'vitest';
import { createEnvelope, isOrchestratorCommandType, isOrchestratorEventType } from './orchestrator-contracts';

describe('orchestrator contracts', () => {
  it('creates a strongly shaped envelope', () => {
    const env = createEnvelope('heartbeat', { beat: 1 }, 'orchestrator');
    expect(env.id).toMatch(/^orc_/);
    expect(env.type).toBe('heartbeat');
    expect(env.payload).toEqual({ beat: 1 });
    expect(env.source).toBe('orchestrator');
    expect(typeof env.emittedAt).toBe('number');
  });

  it('validates command type guards', () => {
    expect(isOrchestratorCommandType('set_profile')).toBe(true);
    expect(isOrchestratorCommandType('submit_goal')).toBe(true);
    expect(isOrchestratorCommandType('kernel_dispatch')).toBe(true);
    expect(isOrchestratorCommandType('unknown')).toBe(false);
  });

  it('validates event type guards', () => {
    expect(isOrchestratorEventType('heartbeat')).toBe(true);
    expect(isOrchestratorEventType('profile_changed')).toBe(true);
    expect(isOrchestratorEventType('kernel_action_validated')).toBe(true);
    expect(isOrchestratorEventType('invalid')).toBe(false);
  });
});
