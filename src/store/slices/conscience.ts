import type { StoreSet, StoreGet } from '../types';
import { createDefaultConscienceState, checkConscience, reflectOnAction, recordOverride } from '../../prime/conscience';

export function createConscienceSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── CONSCIENCE — Ethical Reasoning Engine ────────────
    conscience: createDefaultConscienceState(),

    conscienceCheck: (action: string, context: any) => {
      const state = get();
      const judgment = checkConscience(
        action,
        {
          ...context,
          currentTrust: state.consciousness.trust,
        },
        state.conscience,
      );

      set((s: any) => ({
        conscience: {
          ...s.conscience,
          judgments: [...s.conscience.judgments, judgment].slice(-50),
          totalChecks: s.conscience.totalChecks + 1,
          proceeds: s.conscience.proceeds + (judgment.verdict === 'proceed' ? 1 : 0),
          cautions: s.conscience.cautions + (judgment.verdict === 'caution' ? 1 : 0),
          refusals: s.conscience.refusals + (judgment.verdict === 'refuse' ? 1 : 0),
          lastCheckAt: Date.now(),
        },
      }));

      return judgment;
    },

    conscienceReflect: (judgmentId: string, outcome: any) => {
      const state = get();
      const judgment = state.conscience.judgments.find((j: any) => j.id === judgmentId);
      if (!judgment) return;

      const updated = reflectOnAction(judgment, outcome, state.conscience);
      set({ conscience: updated });
    },

    conscienceOverride: (judgmentId: string) => {
      const state = get();
      const judgment = state.conscience.judgments.find((j: any) => j.id === judgmentId);
      if (!judgment) return;

      const updated = recordOverride(judgment, state.conscience);
      set({ conscience: updated });
    },

    conscienceToggle: (active: boolean) => {
      set((s: any) => ({
        conscience: { ...s.conscience, active },
      }));
    },
  };
}
