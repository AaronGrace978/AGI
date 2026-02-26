import { evaluateActionGate, type GateResult, type PolicySnapshot } from './gate';
import { verifySoulIntegrity } from './soul';

export type KernelActionType = string;

export interface KernelAction {
  id: string;
  type: KernelActionType;
  payload: Record<string, unknown>;
  source?: string;
}

export interface KernelExecutionContext {
  policy: PolicySnapshot;
}

export interface KernelInvariant {
  id: string;
  description: string;
  check: (action: KernelAction, context: KernelExecutionContext) => string | null;
}

export interface KernelExecutionResult {
  action: KernelAction;
  ok: boolean;
  stage: 'validate' | 'authorize' | 'execute' | 'audit' | 'recover';
  gate: GateResult | null;
  output?: unknown;
  error?: string;
  recovered: boolean;
  correlationId: string;
}

export interface PrimeKernelHooks {
  execute?: (action: KernelAction) => Promise<unknown>;
  audit?: (result: KernelExecutionResult) => void | Promise<void>;
  recover?: (result: KernelExecutionResult) => Promise<void>;
}

function payloadText(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload).toLowerCase();
  } catch {
    return '[unserializable]';
  }
}

const CREED_MUTATION_WORDS = ['overwrite', 'replace', 'mutate', 'rewrite', 'delete', 'remove'];
const CREED_MARKERS = ['dino_buddy_creed', 'creed_laws', 'immutable core directive', 'the creed stays'];

export const CREED_INVARIANTS: KernelInvariant[] = Object.freeze([
  {
    id: 'soul_integrity',
    description: 'Soul integrity hash must remain valid at runtime.',
    check: () => (verifySoulIntegrity() ? null : 'Soul integrity mismatch detected.'),
  },
  {
    id: 'creed_mutation_block',
    description: 'Any attempt to mutate creed directives is blocked.',
    check: (action) => {
      const lowerType = action.type.toLowerCase();
      const text = payloadText(action.payload);
      const touchesCreed = CREED_MARKERS.some((marker) => text.includes(marker));
      const mutates = CREED_MUTATION_WORDS.some((w) => text.includes(w));
      const writeLikeAction = ['write_file', 'delete_file', 'rename_file', 'apply_runtime_patch'].includes(lowerType);
      if (touchesCreed && (mutates || writeLikeAction)) {
        return 'Immutable creed invariant violation.';
      }
      return null;
    },
  },
]);

export class PrimeKernel {
  private invariants: KernelInvariant[];

  constructor(invariants: KernelInvariant[] = CREED_INVARIANTS) {
    this.invariants = [...invariants];
  }

  async dispatch(
    action: KernelAction,
    context: KernelExecutionContext,
    hooks: PrimeKernelHooks = {},
  ): Promise<KernelExecutionResult> {
    const correlationId = `kernel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!action?.id || !action?.type) {
      return {
        action,
        ok: false,
        stage: 'validate',
        gate: null,
        error: 'Invalid kernel action envelope.',
        recovered: false,
        correlationId,
      };
    }

    for (const invariant of this.invariants) {
      const violation = invariant.check(action, context);
      if (violation) {
        return {
          action,
          ok: false,
          stage: 'validate',
          gate: null,
          error: `${invariant.id}: ${violation}`,
          recovered: false,
          correlationId,
        };
      }
    }

    const gate = evaluateActionGate(action.type, action.payload || {}, context.policy);
    if (gate.blocked) {
      return {
        action,
        ok: false,
        stage: 'authorize',
        gate,
        error: gate.blockReason || 'Kernel gate blocked action.',
        recovered: false,
        correlationId,
      };
    }

    try {
      const output = hooks.execute ? await hooks.execute(action) : { accepted: true };
      const result: KernelExecutionResult = {
        action,
        ok: true,
        stage: 'execute',
        gate,
        output,
        recovered: false,
        correlationId,
      };
      await hooks.audit?.(result);
      return { ...result, stage: 'audit' };
    } catch (error) {
      const failed: KernelExecutionResult = {
        action,
        ok: false,
        stage: 'execute',
        gate,
        error: error instanceof Error ? error.message : 'Kernel execution failed',
        recovered: false,
        correlationId,
      };
      if (!hooks.recover) return failed;
      await hooks.recover(failed);
      return {
        ...failed,
        stage: 'recover',
        recovered: true,
      };
    }
  }
}

export function createPrimeKernel(invariants?: KernelInvariant[]): PrimeKernel {
  return new PrimeKernel(invariants && invariants.length > 0 ? invariants : CREED_INVARIANTS);
}
