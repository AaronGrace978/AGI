import type { StoreSet, StoreGet } from '../types';
import type { OperatorProfile, OperatorObservation, SynthesisSessionState } from '../../types';

export function createOperatorSlice(set: StoreSet, get: StoreGet) {
  return {
    // ─── HANDS — Operator Synthesis Engine ──────────────────
    operatorProfile: {
      observations: [],
      rhythm: {
        avgTypingDelayMs: 0,
        avgSessionLengthMin: 0,
        peakHours: [],
        preferredApps: [],
        correctionRate: 0,
        lastUpdated: 0,
      },
      preferences: {},
      totalObservations: 0,
      totalSessions: 0,
      synthesisNotes: [],
      lastSynthesisAt: null,
    } as OperatorProfile,
    synthesisSession: {
      active: false,
      startedAt: null,
      observationCount: 0,
      intervalId: null,
      intervalMs: 15000,
      lastSnapshotAt: null,
      paused: false,
      error: null,
    } as SynthesisSessionState,

    synthesisStart: (intervalMs = 15000) => {
      const existing = get().synthesisSession;
      if (existing.active && existing.intervalId) return;

      const safeInterval = Math.max(8000, intervalMs);
      const id = window.setInterval(() => {
        const session = get().synthesisSession;
        if (!session.active || session.paused) return;
        void get().synthesisRunSnapshot();
      }, safeInterval);

      set((s: any) => ({
        synthesisSession: {
          ...s.synthesisSession,
          active: true,
          startedAt: Date.now(),
          intervalId: id,
          intervalMs: safeInterval,
          paused: false,
          error: null,
        },
        operatorProfile: {
          ...s.operatorProfile,
          totalSessions: s.operatorProfile.totalSessions + 1,
        },
      }));
    },

    synthesisStop: () => {
      const session = get().synthesisSession;
      if (session.intervalId) window.clearInterval(session.intervalId);
      set((s: any) => ({
        synthesisSession: {
          ...s.synthesisSession,
          active: false,
          intervalId: null,
          paused: false,
        },
      }));
      void get().persistOperatorProfile();
    },

    synthesisPause: () => {
      set((s: any) => ({
        synthesisSession: { ...s.synthesisSession, paused: true },
      }));
    },

    synthesisResume: () => {
      set((s: any) => ({
        synthesisSession: { ...s.synthesisSession, paused: false },
      }));
    },

    synthesisAddObservation: (obs: Omit<OperatorObservation, 'id' | 'timestamp'>) => {
      const entry: OperatorObservation = {
        ...obs,
        id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      };
      set((s: any) => ({
        operatorProfile: {
          ...s.operatorProfile,
          observations: [...s.operatorProfile.observations.slice(-200), entry],
          totalObservations: s.operatorProfile.totalObservations + 1,
        },
        synthesisSession: {
          ...s.synthesisSession,
          observationCount: s.synthesisSession.observationCount + 1,
          lastSnapshotAt: Date.now(),
        },
      }));
    },

    synthesisAddPreference: (key: string, value: string) => {
      set((s: any) => ({
        operatorProfile: {
          ...s.operatorProfile,
          preferences: { ...s.operatorProfile.preferences, [key]: value },
        },
      }));
      void get().persistOperatorProfile();
    },

    synthesisRunSnapshot: async () => {
      const session = get().synthesisSession;
      if (!session.active || session.paused) return;
      if (!window.api?.agent?.getForegroundWindow || !window.api?.agent?.getMousePosition) return;

      try {
        const [fgRaw, mouseRaw] = await Promise.all([
          window.api.agent.getForegroundWindow(),
          window.api.agent.getMousePosition(),
        ]);
        const fg = (fgRaw && typeof fgRaw === 'object' ? fgRaw : {}) as Record<string, unknown>;
        const mouse = (mouseRaw && typeof mouseRaw === 'object' ? mouseRaw : {}) as Record<string, unknown>;

        const foregroundApp = String(fg.output || 'unknown').slice(0, 120);
        const mousePos = String(mouse.output || 'unknown');
        const hour = new Date().getHours();

        const prevObs = get().operatorProfile.observations;
        const lastApp = prevObs.length > 0 ? prevObs[prevObs.length - 1].foregroundApp : null;
        const isAppSwitch = lastApp !== null && lastApp !== foregroundApp;

        get().synthesisAddObservation({
          type: isAppSwitch ? 'app_switch' : 'screen_snapshot',
          summary: isAppSwitch
            ? `Switched from "${lastApp}" to "${foregroundApp}"`
            : `Active: "${foregroundApp}" | Mouse: ${mousePos}`,
          foregroundApp,
          details: `mouse=${mousePos} hour=${hour}`,
        });

        set((s: any) => {
          const rhythm = { ...s.operatorProfile.rhythm };
          if (!rhythm.peakHours.includes(hour)) {
            rhythm.peakHours = [...rhythm.peakHours.slice(-12), hour];
          }
          const apps = rhythm.preferredApps;
          if (!apps.includes(foregroundApp) && foregroundApp !== 'unknown') {
            rhythm.preferredApps = [...apps.slice(-20), foregroundApp];
          }
          rhythm.lastUpdated = Date.now();
          return {
            operatorProfile: { ...s.operatorProfile, rhythm },
          };
        });

        const obsCount = get().synthesisSession.observationCount;
        if (obsCount > 0 && obsCount % 10 === 0) {
          const recent = get().operatorProfile.observations.slice(-10);
          const appSummary = [...new Set(recent.map((o: OperatorObservation) => o.foregroundApp).filter(Boolean))].join(
            ', ',
          );
          const switches = recent.filter((o: OperatorObservation) => o.type === 'app_switch').length;
          const note = `Operator synthesis (${obsCount} obs): apps=[${appSummary}], ${switches} app switches in last 10 samples, hour=${hour}.`;
          if (window.api?.memory?.storeVector) {
            void window.api.memory.storeVector({
              content: note,
              type: 'procedural',
              source: 'operator-synthesis',
              importance: 0.45,
              tags: ['operator', 'rhythm', 'synthesis'],
            });
          }
          set((s: any) => ({
            operatorProfile: {
              ...s.operatorProfile,
              synthesisNotes: [...s.operatorProfile.synthesisNotes.slice(-50), note],
            },
          }));
          if (obsCount % 20 === 0) void get().persistOperatorProfile();
        }
      } catch (e: unknown) {
        set((s: any) => ({
          synthesisSession: {
            ...s.synthesisSession,
            error: e instanceof Error ? e.message : 'Snapshot failed',
          },
        }));
      }
    },

    synthesisDigest: async () => {
      const profile = get().operatorProfile;
      if (profile.observations.length < 5) return;

      const recentObs = profile.observations.slice(-30);
      const apps = [...new Set(recentObs.map((o: OperatorObservation) => o.foregroundApp).filter(Boolean))];
      const switches = recentObs.filter((o: OperatorObservation) => o.type === 'app_switch').length;
      const hours = [...new Set(recentObs.map((o: OperatorObservation) => new Date(o.timestamp).getHours()))].sort(
        (a, b) => (a as number) - (b as number),
      );
      const prefs = Object.entries(profile.preferences)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');

      const digest = [
        `Operator digest (${profile.totalObservations} total observations, ${profile.totalSessions} sessions):`,
        `Active apps: ${apps.join(', ') || 'none recorded'}`,
        `App switches (last 30): ${switches}`,
        `Active hours: ${hours.join(', ') || 'none'}`,
        `Preferences: ${prefs || 'none set'}`,
        `Rhythm: avg typing ${profile.rhythm.avgTypingDelayMs}ms, correction rate ${(profile.rhythm.correctionRate * 100).toFixed(0)}%`,
      ].join('\n');

      if (window.api?.memory?.storeVector) {
        void window.api.memory.storeVector({
          content: digest,
          type: 'procedural',
          source: 'operator-synthesis',
          importance: 0.65,
          tags: ['operator', 'digest', 'profile'],
        });
      }

      set((s: any) => ({
        operatorProfile: {
          ...s.operatorProfile,
          synthesisNotes: [...s.operatorProfile.synthesisNotes.slice(-50), digest],
          lastSynthesisAt: Date.now(),
        },
      }));
      void get().persistOperatorProfile();
    },

    persistOperatorProfile: async () => {
      try {
        const profile = get().operatorProfile;
        if (window.api?.operatorProfile?.save) await window.api.operatorProfile.save(profile);
      } catch {
        // non-fatal
      }
    },

    loadOperatorProfile: async () => {
      try {
        if (!window.api?.operatorProfile?.get) return;
        const profile = await window.api.operatorProfile.get();
        if (profile && typeof profile === 'object') {
          set((s: any) => ({
            operatorProfile: {
              observations: Array.isArray((profile as any).observations)
                ? (profile as any).observations
                : s.operatorProfile.observations,
              rhythm:
                (profile as any).rhythm && typeof (profile as any).rhythm === 'object'
                  ? (profile as any).rhythm
                  : s.operatorProfile.rhythm,
              preferences:
                (profile as any).preferences && typeof (profile as any).preferences === 'object'
                  ? (profile as any).preferences
                  : s.operatorProfile.preferences,
              totalObservations: Number((profile as any).totalObservations) || s.operatorProfile.totalObservations,
              totalSessions: Number((profile as any).totalSessions) || s.operatorProfile.totalSessions,
              synthesisNotes: Array.isArray((profile as any).synthesisNotes)
                ? (profile as any).synthesisNotes
                : s.operatorProfile.synthesisNotes,
              lastSynthesisAt: (profile as any).lastSynthesisAt ?? s.operatorProfile.lastSynthesisAt,
            },
          }));
        }
      } catch {
        // non-fatal
      }
    },
  };
}
