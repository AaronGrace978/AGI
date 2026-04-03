import type { StoreGet, StoreSet } from '../types';
import {
  discoverRepos,
  ingestBatch,
  getDefaultRepoIngestConfig,
  type RepoCandidate,
  type RepoIngestConfig,
  type RepoIngestProgress,
  type RepoIngestResult,
} from '../../prime/repo-ingestor';

function nowLabel(): string {
  return new Date().toLocaleTimeString();
}

function pushLog(set: StoreSet, line: string) {
  set((state: any) => ({
    repoIngestor: {
      ...state.repoIngestor,
      logs: [...state.repoIngestor.logs.slice(-299), `[${nowLabel()}] ${line}`],
    },
  }));
}

function summarizeProgress(evt: RepoIngestProgress): string {
  const repo = evt.repoFullName ? `${evt.repoFullName} — ` : '';
  return `[${evt.stage.toUpperCase()}] ${repo}${evt.message}`;
}

export function createRepoIngestorSlice(set: StoreSet, get: StoreGet) {
  return {
    repoIngestor: {
      phase: 'idle' as 'idle' | 'discovering' | 'ingesting' | 'complete' | 'error',
      running: false,
      topic: 'agent frameworks',
      selectedCandidates: [] as string[],
      candidates: [] as RepoCandidate[],
      results: [] as RepoIngestResult[],
      stats: {
        scanned: 0,
        accepted: 0,
        rejected: 0,
        storedMemories: 0,
        dedupedMemories: 0,
      },
      config: getDefaultRepoIngestConfig() as RepoIngestConfig,
      logs: ['Repo ingestor ready.'],
      lastError: null as string | null,
      lastRunAt: null as number | null,
    },

    repoIngestorSetTopic: (topic: string) => {
      set((state: any) => ({
        repoIngestor: {
          ...state.repoIngestor,
          topic,
        },
      }));
    },

    repoIngestorUpdateConfig: (partial: Partial<RepoIngestConfig>) => {
      set((state: any) => ({
        repoIngestor: {
          ...state.repoIngestor,
          config: { ...state.repoIngestor.config, ...partial },
        },
      }));
    },

    repoIngestorToggleCandidate: (fullName: string) => {
      set((state: any) => {
        const selected = new Set<string>(state.repoIngestor.selectedCandidates);
        if (selected.has(fullName)) selected.delete(fullName);
        else selected.add(fullName);
        return {
          repoIngestor: {
            ...state.repoIngestor,
            selectedCandidates: [...selected],
          },
        };
      });
    },

    repoIngestorSelectAllCandidates: () => {
      set((state: any) => ({
        repoIngestor: {
          ...state.repoIngestor,
          selectedCandidates: state.repoIngestor.candidates.map((candidate: RepoCandidate) => candidate.fullName),
        },
      }));
    },

    repoIngestorClearSelection: () => {
      set((state: any) => ({
        repoIngestor: {
          ...state.repoIngestor,
          selectedCandidates: [],
        },
      }));
    },

    repoIngestorClearLogs: () => {
      set((state: any) => ({
        repoIngestor: {
          ...state.repoIngestor,
          logs: [],
        },
      }));
    },

    repoIngestorStop: () => {
      set((state: any) => ({
        repoIngestor: {
          ...state.repoIngestor,
          running: false,
          phase: 'idle',
          lastError: 'Stopped by operator (current request may still finish in background).',
        },
      }));
      pushLog(set, '[WARN] Stop requested by operator.');
    },

    repoIngestorDiscover: async (topicOverride?: string) => {
      const state = get();
      if (state.repoIngestor.running) return;

      const topic = (topicOverride || state.repoIngestor.topic || '').trim();
      if (!topic) {
        pushLog(set, '[ERROR] Discovery topic is empty.');
        return;
      }

      set((s: any) => ({
        repoIngestor: {
          ...s.repoIngestor,
          phase: 'discovering',
          running: true,
          lastError: null,
          topic,
        },
      }));
      pushLog(set, `Discovering repositories for topic "${topic}"...`);

      try {
        const candidates = await discoverRepos(topic, state.repoIngestor.config, (evt) => {
          pushLog(set, summarizeProgress(evt));
        });

        set((s: any) => ({
          repoIngestor: {
            ...s.repoIngestor,
            phase: 'complete',
            running: false,
            candidates,
            selectedCandidates: candidates.map((candidate) => candidate.fullName),
            stats: {
              ...s.repoIngestor.stats,
              scanned: candidates.length,
            },
            lastRunAt: Date.now(),
          },
        }));
        pushLog(set, `Discovery complete. ${candidates.length} candidate repos available.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((s: any) => ({
          repoIngestor: {
            ...s.repoIngestor,
            phase: 'error',
            running: false,
            lastError: message,
          },
        }));
        pushLog(set, `[ERROR] Discovery failed: ${message}`);
      }
    },

    repoIngestorIngestSelected: async () => {
      const state = get();
      if (state.repoIngestor.running) return;

      const selected = new Set(state.repoIngestor.selectedCandidates);
      const targets = state.repoIngestor.candidates
        .filter((candidate: RepoCandidate) => selected.has(candidate.fullName))
        .slice(0, state.repoIngestor.config.maxReposPerSession);

      if (targets.length === 0) {
        pushLog(set, '[WARN] No selected repositories to ingest.');
        return;
      }

      set((s: any) => ({
        repoIngestor: {
          ...s.repoIngestor,
          phase: 'ingesting',
          running: true,
          lastError: null,
        },
      }));
      pushLog(set, `Starting ingest for ${targets.length} repo(s)...`);

      try {
        const batch = await ingestBatch(targets, state.repoIngestor.config, (evt) => {
          pushLog(set, summarizeProgress(evt));
        });

        set((s: any) => ({
          repoIngestor: {
            ...s.repoIngestor,
            phase: 'complete',
            running: false,
            results: batch.results,
            stats: {
              scanned: s.repoIngestor.candidates.length,
              accepted: batch.accepted,
              rejected: batch.rejected,
              storedMemories: batch.storedMemories,
              dedupedMemories: batch.dedupedMemories,
            },
            lastRunAt: Date.now(),
          },
        }));
        pushLog(
          set,
          `Batch complete. Accepted ${batch.accepted}/${batch.total}; stored ${batch.storedMemories}, deduped ${batch.dedupedMemories}.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((s: any) => ({
          repoIngestor: {
            ...s.repoIngestor,
            phase: 'error',
            running: false,
            lastError: message,
          },
        }));
        pushLog(set, `[ERROR] Batch ingest failed: ${message}`);
      }
    },
  };
}
