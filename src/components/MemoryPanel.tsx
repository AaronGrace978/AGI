import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MemoryType, VectorMemory } from '../prime/memory';
import { getLegacyMemorySummary, getMemoryStats, listVectorMemories, searchMemories } from '../prime/memory';
import { useStore } from '../store';
import { Button, Card } from './ui';

type FilterType = 'all' | MemoryType;
type SortType = 'newest' | 'oldest' | 'importance';

interface DisplayMemory {
  memory: VectorMemory;
  similarity?: number;
}

const PAGE_SIZE = 60;
const SEARCH_TOPK = 40;
const CONTENT_PREVIEW_CHARS = 320;
const LEGACY_PREVIEW_COUNT = 12;

function formatTimestamp(ts: number): string {
  if (!ts) return 'n/a';
  return new Date(ts).toLocaleString();
}

function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function previewUnknown(value: unknown, max = 180): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'string') return value.slice(0, max);
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return '[unserializable]';
  }
}

export default function MemoryPanel() {
  const heartEmotion = useStore((s) => s.consciousness.soulFrame.currentEmotion);
  const heartIntensity = useStore((s) => s.consciousness.soulFrame.emotionIntensity);

  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> }>({
    total: 0,
    byType: {},
  });
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof getLegacyMemorySummary>>>(null);
  const [memories, setMemories] = useState<DisplayMemory[]>([]);
  const [totalMemories, setTotalMemories] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('newest');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');

  const normalizedQuery = debouncedQuery.trim();
  const isSearching = normalizedQuery.length > 0;

  const loadOverview = useCallback(async () => {
    const [statsResult, snapshotResult] = await Promise.all([
      getMemoryStats(),
      getLegacyMemorySummary(LEGACY_PREVIEW_COUNT),
    ]);
    setStats({ total: statsResult.total, byType: statsResult.byType || {} });
    setSnapshot(snapshotResult);
  }, []);

  const loadMemories = useCallback(
    async (append: boolean) => {
      setLoading(true);
      setError('');
      try {
        if (isSearching) {
          const results = await searchMemories(
            normalizedQuery,
            SEARCH_TOPK,
            filterType === 'all' ? undefined : filterType,
            { emotion: heartEmotion, intensity: heartIntensity },
          );
          const mapped: DisplayMemory[] = results.map((r) => ({
            memory: r.memory,
            similarity: r.similarity,
          }));
          setMemories(mapped);
          setTotalMemories(mapped.length);
          setExpanded({});
          return;
        }

        const nextOffset = append ? memories.length : 0;
        const result = await listVectorMemories({
          typeFilter: filterType === 'all' ? null : filterType,
          limit: PAGE_SIZE,
          offset: nextOffset,
          sortBy,
        });

        const mapped: DisplayMemory[] = result.memories.map((memory) => ({ memory }));
        setMemories((prev) => (append ? [...prev, ...mapped] : mapped));
        setTotalMemories(result.total);
        if (!append) setExpanded({});
      } catch {
        setError('Unable to load memories right now.');
      } finally {
        setLoading(false);
      }
    },
    [filterType, isSearching, normalizedQuery, sortBy, memories.length, heartEmotion, heartIntensity],
  );

  useEffect(() => {
    void loadOverview();
    const unsubscribe = window.api?.nightmind?.onInsight?.(() => {
      void loadOverview();
      if (!isSearching) void loadMemories(false);
    });
    return () => {
      unsubscribe?.();
    };
  }, [loadOverview, loadMemories, isSearching]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    void loadMemories(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, sortBy, normalizedQuery]);

  const canLoadMore = !isSearching && memories.length < totalMemories;
  const factsCount = snapshot?.counts?.facts ?? (Array.isArray(snapshot?.facts) ? snapshot.facts.length : 0);
  const conversationsCount =
    snapshot?.counts?.conversations ?? (Array.isArray(snapshot?.conversations) ? snapshot.conversations.length : 0);
  const insights = Array.isArray(snapshot?.consciousness?.insights) ? snapshot?.consciousness?.insights || [] : [];
  const soulTrust = snapshot?.soul?.trust ?? 0;
  const soulIntimacy = snapshot?.soul?.intimacy ?? 0;

  const byTypeEntries = useMemo(() => Object.entries(stats.byType || {}).sort((a, b) => b[1] - a[1]), [stats.byType]);

  const handleExport = useCallback(async () => {
    if (!window.api?.memory?.export) {
      setError('Export not available');
      return;
    }
    setExporting(true);
    setExportStatus('');
    try {
      const result = await window.api.memory.export();
      if (result.success) {
        setExportStatus(`Exported ${result.count} memories to G:\\AGIPRIME\\Memory`);
        setTimeout(() => setExportStatus(''), 5000);
      } else {
        setError(result.error || 'Export failed');
      }
    } catch (e) {
      setError(`Export error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!window.api?.memory?.import) {
      setError('Import not available');
      return;
    }
    setImporting(true);
    setExportStatus('');
    setError('');
    try {
      const result = await window.api.memory.import();
      if (result.success) {
        setExportStatus(
          `Imported: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped (total: ${result.total})`,
        );
        setTimeout(() => setExportStatus(''), 8000);
        // Reload memories and overview
        await loadOverview();
        await loadMemories(false);
      } else {
        setError(result.error || 'Import failed');
      }
    } catch (e) {
      setError(`Import error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  }, [loadOverview, loadMemories]);

  return (
    <div className="memory-panel">
      <div className="memory-browser-header">
        <h2>MEMORY - Chronicle</h2>
        <p>Inspect learned knowledge, conversation traces, and semantic memories.</p>
      </div>

      <div className="memory-overview-grid">
        <Card compact glow="cyan" className="memory-overview-card">
          <div className="memory-overview-label">Vector memories</div>
          <div className="memory-overview-value">{stats.total}</div>
        </Card>
        <Card compact glow="green" className="memory-overview-card">
          <div className="memory-overview-label">Facts</div>
          <div className="memory-overview-value">{factsCount}</div>
        </Card>
        <Card compact className="memory-overview-card">
          <div className="memory-overview-label">Conversations</div>
          <div className="memory-overview-value">{conversationsCount}</div>
        </Card>
        <Card compact className="memory-overview-card">
          <div className="memory-overview-label">Insights</div>
          <div className="memory-overview-value">{insights.length}</div>
        </Card>
        <Card compact glow="magenta" className="memory-overview-card">
          <div className="memory-overview-label">Soul trust</div>
          <div className="memory-overview-value">{formatPercent(soulTrust)}</div>
        </Card>
        <Card compact glow="purple" className="memory-overview-card">
          <div className="memory-overview-label">Soul intimacy</div>
          <div className="memory-overview-value">{formatPercent(soulIntimacy)}</div>
        </Card>
      </div>

      <div className="memory-type-row">
        {byTypeEntries.length === 0 ? (
          <span className="memory-type-chip">no typed memory yet</span>
        ) : (
          byTypeEntries.map(([type, count]) => (
            <span key={type} className="memory-type-chip">
              {type}: {count}
            </span>
          ))
        )}
      </div>

      <div className="memory-controls">
        <input
          className="memory-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memory by meaning (semantic lookup)..."
        />
        <select
          className="memory-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as FilterType)}
        >
          <option value="all">all types</option>
          <option value="episodic">episodic</option>
          <option value="semantic">semantic</option>
          <option value="procedural">procedural</option>
          <option value="reflective">reflective</option>
          <option value="autobiographical">autobiographical</option>
        </select>
        <select
          className="memory-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortType)}
          disabled={isSearching}
        >
          <option value="newest">newest first</option>
          <option value="oldest">oldest first</option>
          <option value="importance">highest importance</option>
        </select>
        <Button
          size="sm"
          onClick={() => {
            void loadOverview();
            void loadMemories(false);
          }}
          disabled={loading}
        >
          refresh
        </Button>
        <Button size="sm" variant="accent" onClick={handleExport} disabled={exporting || loading} loading={exporting}>
          {exporting ? 'exporting...' : 'export'}
        </Button>
        <Button size="sm" variant="accent" onClick={handleImport} disabled={importing || loading} loading={importing}>
          {importing ? 'importing...' : 'import'}
        </Button>
      </div>

      <div className="memory-list-meta">
        <span>
          Showing {memories.length} of {totalMemories || stats.total}
          {isSearching ? ' search matches' : ' stored memories'}
        </span>
        {loading && <span>loading...</span>}
        {exportStatus && <span style={{ color: '#86efac' }}>{exportStatus}</span>}
        {error && <span className="memory-error">{error}</span>}
      </div>

      <div className="memory-list">
        {memories.length === 0 ? (
          <div className="memory-empty">
            {isSearching ? 'No semantic matches found.' : 'No stored vector memories yet.'}
          </div>
        ) : (
          memories.map(({ memory, similarity }) => (
            <div key={memory.id} className="memory-item">
              <div className="memory-item-top">
                <span className="memory-badge type">{memory.type}</span>
                <span className="memory-badge source">{memory.source}</span>
                <span className="memory-badge imp">importance: {formatPercent(memory.importance || 0)}</span>
                {typeof similarity === 'number' && (
                  <span className="memory-badge sim">match: {formatPercent(similarity)}</span>
                )}
                {memory.content.length > CONTENT_PREVIEW_CHARS && (
                  <Button size="sm" onClick={() => setExpanded((prev) => ({ ...prev, [memory.id]: !prev[memory.id] }))}>
                    {expanded[memory.id] ? 'collapse' : 'expand'}
                  </Button>
                )}
              </div>
              <div className="memory-content">
                {expanded[memory.id]
                  ? memory.content
                  : memory.content.slice(0, CONTENT_PREVIEW_CHARS) +
                    (memory.content.length > CONTENT_PREVIEW_CHARS ? '…' : '')}
              </div>
              <div className="memory-item-bottom">
                <span>{formatTimestamp(memory.timestamp)}</span>
                {memory.emotion && <span>emotion: {memory.emotion}</span>}
                {!!memory.tags?.length && <span>tags: {memory.tags.join(', ')}</span>}
                {memory.layer && <span>layer: {memory.layer}</span>}
                {typeof memory.accessCount === 'number' && <span>retrieved: {memory.accessCount}x</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {canLoadMore && (
        <div className="memory-load-more-row">
          <Button size="sm" onClick={() => void loadMemories(true)} disabled={loading}>
            load more
          </Button>
        </div>
      )}

      <div className="memory-legacy-grid">
        <Card title="Recent insights" compact className="memory-legacy-card">
          {insights.length === 0 ? (
            <div className="memory-legacy-empty">none yet</div>
          ) : (
            insights
              .slice(-5)
              .reverse()
              .map((insight, idx) => (
                <div key={`${idx}-${previewUnknown(insight, 24)}`} className="memory-legacy-row">
                  {previewUnknown(insight)}
                </div>
              ))
          )}
        </Card>

        <Card title="Recent facts" compact className="memory-legacy-card">
          {factsCount === 0 ? (
            <div className="memory-legacy-empty">none yet</div>
          ) : (
            (snapshot?.facts || [])
              .slice(-5)
              .reverse()
              .map((fact, idx) => (
                <div key={`${idx}-${previewUnknown(fact, 24)}`} className="memory-legacy-row">
                  {previewUnknown(fact)}
                </div>
              ))
          )}
        </Card>

        <Card title="Recent conversations" compact className="memory-legacy-card">
          {conversationsCount === 0 ? (
            <div className="memory-legacy-empty">none yet</div>
          ) : (
            (snapshot?.conversations || [])
              .slice(-5)
              .reverse()
              .map((conv, idx) => (
                <div key={`${idx}-${previewUnknown(conv, 24)}`} className="memory-legacy-row">
                  {previewUnknown(conv)}
                </div>
              ))
          )}
        </Card>
      </div>
    </div>
  );
}
