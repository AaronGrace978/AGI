export type OrchestratorCommandType =
  | 'set_profile'
  | 'submit_goal'
  | 'pause_autonomy'
  | 'resume_autonomy'
  | 'emergency_stop'
  | 'clear_emergency_stop'
  | 'apply_runtime_patch'
  | 'kernel_dispatch';

export type OrchestratorEventType =
  | 'heartbeat'
  | 'profile_changed'
  | 'goal_submitted'
  | 'goal_completed'
  | 'action_blocked'
  | 'action_executed'
  | 'kernel_action_validated'
  | 'kernel_action_recovered'
  | 'policy_updated'
  | 'emergency_stop_enabled'
  | 'emergency_stop_cleared'
  | 'error';

export interface OrchestratorEnvelope<TType extends string, TPayload extends Record<string, unknown>> {
  id: string;
  type: TType;
  payload: TPayload;
  emittedAt: number;
  source: 'operator' | 'orchestrator' | 'executor' | 'policy' | 'memory' | 'system';
}

export type OrchestratorCommand = OrchestratorEnvelope<OrchestratorCommandType, Record<string, unknown>>;
export type OrchestratorEvent = OrchestratorEnvelope<OrchestratorEventType, Record<string, unknown>>;

export function createEnvelope<TType extends string, TPayload extends Record<string, unknown>>(
  type: TType,
  payload: TPayload,
  source: OrchestratorEnvelope<string, Record<string, unknown>>['source'],
): OrchestratorEnvelope<TType, TPayload> {
  return {
    id: `orc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    emittedAt: Date.now(),
    source,
  };
}

export function isOrchestratorCommandType(value: string): value is OrchestratorCommandType {
  return [
    'set_profile',
    'submit_goal',
    'pause_autonomy',
    'resume_autonomy',
    'emergency_stop',
    'clear_emergency_stop',
    'apply_runtime_patch',
    'kernel_dispatch',
  ].includes(value);
}

export function isOrchestratorEventType(value: string): value is OrchestratorEventType {
  return [
    'heartbeat',
    'profile_changed',
    'goal_submitted',
    'goal_completed',
    'action_blocked',
    'action_executed',
    'kernel_action_validated',
    'kernel_action_recovered',
    'policy_updated',
    'emergency_stop_enabled',
    'emergency_stop_cleared',
    'error',
  ].includes(value);
}
