import { describe, expect, it } from 'vitest';
import { buildReplaySignature, summarizeReplayMetrics } from './hands-replay';

describe('hands replay harness', () => {
  it('builds deterministic signature from action stream', () => {
    const signature = buildReplaySignature([
      { type: 'hands_action', payload: { action: 'open_application' } },
      { type: 'hands_action', payload: { action: 'keyboard_type' } },
      { type: 'cognitive_step', payload: { actionType: 'mouse_click' } },
    ]);
    expect(signature).toBe('hands_action:open_application|hands_action:keyboard_type|cognitive_step:mouse_click');
  });

  it('summarizes replay metrics for doctor checks', () => {
    const metrics = summarizeReplayMetrics([
      { type: 'hands_action', payload: { action: 'open_application', success: true } },
      { type: 'hands_action', payload: { action: 'mouse_click', success: false } },
      { type: 'hands_action', payload: { action: 'keyboard_type', blocked: true, success: false } },
      { type: 'event', payload: {} },
    ]);
    expect(metrics).toEqual({
      actionCount: 3,
      blockedCount: 1,
      failedCount: 2,
    });
  });
});
