import type { StoreSet, StoreGet } from '../types';
import type { OracleLifeEvent, OracleSocialNode, OracleFeedbackEntry } from '../../types';
import {
  createDefaultOracleState,
  extractLifeEventsFromText,
  analyzeSentimentFromText,
  runOraclePipeline,
  applyFeedback,
  type OracleRunParams,
} from '../../prime/oracle';

function logNonFatal(scope: string, error: unknown): void {
  console.warn(`[${scope}] non-fatal:`, error);
}

export function createOracleSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── ORACLE — Psychic Prime Forecast Engine ────────────
    oracle: createDefaultOracleState(),

    oracleSetSubject: (
      name: string,
      birthDate: string,
      birthTime: string = '12:00',
      birthLocation?: { label?: string; latitude: number; longitude: number },
    ) => {
      set((state: any) => ({
        oracle: {
          ...state.oracle,
          active: true,
          subject: {
            ...state.oracle.subject,
            name,
            fullName: state.oracle.subject.fullName || name,
            birthDate,
            birthTime: birthTime || state.oracle.subject.birthTime,
            birthLocationLabel: birthLocation?.label || state.oracle.subject.birthLocationLabel,
            birthLocation: birthLocation
              ? { latitude: birthLocation.latitude, longitude: birthLocation.longitude }
              : state.oracle.subject.birthLocation,
          },
          logs: [...state.oracle.logs, `[${new Date().toISOString()}] Subject set: ${name} (${birthDate}).`].slice(-80),
        },
      }));
    },

    oracleSetFullName: (fullName: string) => {
      set((state: any) => ({
        oracle: {
          ...state.oracle,
          subject: {
            ...state.oracle.subject,
            fullName,
          },
        },
      }));
    },

    oracleIngestText: (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      set((state: any) => ({
        moduleStates: { ...state.moduleStates, oracle: 'processing' },
        oracle: {
          ...state.oracle,
          phase: 'ingesting',
        },
      }));

      try {
        const newEvents = extractLifeEventsFromText(trimmed);
        set((state: any) => ({
          moduleStates: { ...state.moduleStates, oracle: 'online' },
          oracle: {
            ...state.oracle,
            phase: 'idle',
            lifeEvents: [...state.oracle.lifeEvents, ...newEvents].slice(-400),
            sentimentProfile: analyzeSentimentFromText(trimmed, state.oracle.sentimentProfile),
            logs: [
              ...state.oracle.logs,
              `[${new Date().toISOString()}] Ingested text (${trimmed.length} chars), +${newEvents.length} event(s).`,
            ].slice(-80),
          },
        }));
      } catch (error) {
        logNonFatal('oracle.ingest', error);
        set((state: any) => ({
          moduleStates: { ...state.moduleStates, oracle: 'online' },
          oracle: {
            ...state.oracle,
            phase: 'idle',
            logs: [
              ...state.oracle.logs,
              `[${new Date().toISOString()}] Ingest failed: ${(error as Error).message}`,
            ].slice(-80),
          },
        }));
      }
    },

    oracleAddLifeEvent: (event: OracleLifeEvent) => {
      set((state: any) => ({
        oracle: {
          ...state.oracle,
          lifeEvents: [
            ...state.oracle.lifeEvents,
            {
              ...event,
              id: event.id || `oracle_ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              timestamp: event.timestamp || Date.now(),
            },
          ].slice(-500),
        },
      }));
    },

    oracleAddSocialNode: (node: OracleSocialNode) => {
      set((state: any) => {
        const existingIndex = state.oracle.socialGraph.findIndex((n: OracleSocialNode) => n.id === node.id);
        if (existingIndex >= 0) {
          const next = [...state.oracle.socialGraph];
          next[existingIndex] = { ...next[existingIndex], ...node };
          return {
            oracle: {
              ...state.oracle,
              socialGraph: next,
            },
          };
        }
        return {
          oracle: {
            ...state.oracle,
            socialGraph: [...state.oracle.socialGraph, node].slice(-200),
          },
        };
      });
    },

    oracleRunForecast: (params: OracleRunParams) => {
      set((state: any) => ({
        moduleStates: { ...state.moduleStates, oracle: 'processing' },
        oracle: { ...state.oracle, phase: 'analyzing' },
      }));
      try {
        const next = runOraclePipeline(get().oracle, params);
        set((state: any) => ({
          moduleStates: { ...state.moduleStates, oracle: 'online' },
          oracle: next,
        }));
      } catch (error) {
        logNonFatal('oracle.forecast', error);
        set((state: any) => ({
          moduleStates: { ...state.moduleStates, oracle: 'online' },
          oracle: {
            ...state.oracle,
            phase: 'idle',
            logs: [
              ...state.oracle.logs,
              `[${new Date().toISOString()}] Forecast failed: ${(error as Error).message}`,
            ].slice(-80),
          },
        }));
      }
    },

    oracleSubmitFeedback: (entry: OracleFeedbackEntry) => {
      set((state: any) => ({
        oracle: applyFeedback(state.oracle, {
          predictionId: entry.predictionId,
          outcome: entry.outcome,
          notes: entry.notes,
          timestamp: entry.timestamp || Date.now(),
        }),
      }));
    },

    oracleToggleOverlay: (overlay: string, enabled: boolean) => {
      set((state: any) => ({
        oracle: {
          ...state.oracle,
          activeOverlays: {
            ...state.oracle.activeOverlays,
            [overlay]: enabled,
          },
        },
      }));
    },

    oracleToggleAstroVoice: (enabled: boolean) => {
      set((state: any) => ({
        oracle: {
          ...state.oracle,
          astroVoiceEnabled: enabled,
        },
      }));
    },
  };
}
