import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Button } from './ui';

export default function RepoIngestorPanel() {
  const repoIngestor = useStore((s) => s.repoIngestor);
  const setTopic = useStore((s) => s.repoIngestorSetTopic);
  const updateConfig = useStore((s) => s.repoIngestorUpdateConfig);
  const discover = useStore((s) => s.repoIngestorDiscover);
  const ingestSelected = useStore((s) => s.repoIngestorIngestSelected);
  const toggleCandidate = useStore((s) => s.repoIngestorToggleCandidate);
  const selectAll = useStore((s) => s.repoIngestorSelectAllCandidates);
  const clearSelection = useStore((s) => s.repoIngestorClearSelection);
  const clearLogs = useStore((s) => s.repoIngestorClearLogs);
  const stop = useStore((s) => s.repoIngestorStop);

  const [topicDraft, setTopicDraft] = useState(repoIngestor.topic);

  const selectedSet = useMemo(() => new Set(repoIngestor.selectedCandidates), [repoIngestor.selectedCandidates]);
  const selectedCount = repoIngestor.selectedCandidates.length;

  const config = repoIngestor.config;
  const running = repoIngestor.running;

  const sortedCandidates = useMemo(
    () => [...repoIngestor.candidates].sort((a, b) => b.stars - a.stars),
    [repoIngestor.candidates],
  );

  const handleDiscover = async () => {
    const nextTopic = topicDraft.trim();
    if (!nextTopic) return;
    setTopic(nextTopic);
    await discover(nextTopic);
  };

  const qualityRows = useMemo(
    () =>
      [...repoIngestor.results]
        .filter((result) => result.repo)
        .sort((a, b) => (b.repo?.stars || 0) - (a.repo?.stars || 0)),
    [repoIngestor.results],
  );

  return (
    <div className="panel repo-ingestor-panel">
      <div className="repo-ingestor-header">
        <h2>GITHUB REPO KNOWLEDGE INGESTOR</h2>
        <p>
          Discover high-quality repos, run multi-layer gates, distill engineering knowledge, and store it into semantic
          memory.
        </p>
      </div>

      <div className="repo-ingestor-controls">
        <div className="repo-ingestor-control-row">
          <label className="repo-ingestor-label">Topic / Query</label>
          <input
            className="settings-input repo-ingestor-input"
            value={topicDraft}
            onChange={(e) => setTopicDraft(e.target.value)}
            placeholder="e.g. agent frameworks, llm inference, reinforcement learning"
          />
          <Button variant="primary" onClick={handleDiscover} disabled={running || !topicDraft.trim()}>
            Discover
          </Button>
          <Button variant="accent" onClick={() => ingestSelected()} disabled={running || selectedCount === 0}>
            Ingest Selected
          </Button>
          <Button variant="danger" onClick={stop} disabled={!running}>
            Stop
          </Button>
        </div>

        <div className="repo-ingestor-control-row">
          <label className="repo-ingestor-label">Min Stars: {config.minStars}</label>
          <input
            type="range"
            min={50}
            max={5000}
            step={50}
            value={config.minStars}
            onChange={(e) => updateConfig({ minStars: Number(e.target.value) })}
            className="settings-slider repo-ingestor-slider"
          />
          <label className="repo-ingestor-label">LLM Threshold: {config.llmScoreThreshold.toFixed(2)}</label>
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.01}
            value={config.llmScoreThreshold}
            onChange={(e) => updateConfig({ llmScoreThreshold: Number(e.target.value) })}
            className="settings-slider repo-ingestor-slider"
          />
          <Button variant="ghost" size="sm" onClick={selectAll} disabled={sortedCandidates.length === 0}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedCount === 0}>
            Clear Selection
          </Button>
        </div>

        <div className="repo-ingestor-control-row">
          <label className="repo-ingestor-toggle">
            <input
              type="checkbox"
              checked={config.exportMemoryAfterIngest}
              onChange={(e) => updateConfig({ exportMemoryAfterIngest: e.target.checked })}
              disabled={running}
            />
            <span>Export memory snapshot after ingest</span>
          </label>
          <label className="repo-ingestor-toggle">
            <input
              type="checkbox"
              checked={config.gitCommitAndPush}
              onChange={(e) => updateConfig({ gitCommitAndPush: e.target.checked })}
              disabled={running}
            />
            <span>Commit and push `Memory/latest.json`</span>
          </label>
          <label className="repo-ingestor-label">Git Root</label>
          <input
            className="settings-input repo-ingestor-path-input"
            value={config.gitRepoRoot}
            onChange={(e) => updateConfig({ gitRepoRoot: e.target.value })}
            placeholder="e.g. G:\\AGIPRIME"
            disabled={running}
          />
        </div>
      </div>

      <div className="repo-ingestor-stats-grid">
        <div className="repo-ingestor-stat-card">
          <span className="repo-ingestor-stat-label">Candidates</span>
          <span className="repo-ingestor-stat-value">{repoIngestor.stats.scanned}</span>
        </div>
        <div className="repo-ingestor-stat-card">
          <span className="repo-ingestor-stat-label">Accepted</span>
          <span className="repo-ingestor-stat-value">{repoIngestor.stats.accepted}</span>
        </div>
        <div className="repo-ingestor-stat-card">
          <span className="repo-ingestor-stat-label">Rejected</span>
          <span className="repo-ingestor-stat-value">{repoIngestor.stats.rejected}</span>
        </div>
        <div className="repo-ingestor-stat-card">
          <span className="repo-ingestor-stat-label">Stored Memories</span>
          <span className="repo-ingestor-stat-value">{repoIngestor.stats.storedMemories}</span>
        </div>
        <div className="repo-ingestor-stat-card">
          <span className="repo-ingestor-stat-label">Deduped</span>
          <span className="repo-ingestor-stat-value">{repoIngestor.stats.dedupedMemories}</span>
        </div>
        <div className="repo-ingestor-stat-card">
          <span className="repo-ingestor-stat-label">Phase</span>
          <span className="repo-ingestor-stat-value">{repoIngestor.phase.toUpperCase()}</span>
        </div>
      </div>

      <div className="repo-ingestor-content-grid">
        <section className="repo-ingestor-section">
          <div className="repo-ingestor-section-header">
            <h3>Candidates</h3>
            <span>{selectedCount} selected</span>
          </div>
          <div className="repo-ingestor-table">
            {sortedCandidates.length === 0 ? (
              <div className="repo-ingestor-empty">No candidates yet. Run discovery first.</div>
            ) : (
              sortedCandidates.map((candidate) => (
                <label key={candidate.fullName} className="repo-ingestor-row">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(candidate.fullName)}
                    onChange={() => toggleCandidate(candidate.fullName)}
                  />
                  <div className="repo-ingestor-row-main">
                    <a href={candidate.htmlUrl} target="_blank" rel="noreferrer">
                      {candidate.fullName}
                    </a>
                    <span>{candidate.description || 'No description provided.'}</span>
                  </div>
                  <div className="repo-ingestor-row-meta">
                    <span>{candidate.stars}★</span>
                    <span>{candidate.language || 'n/a'}</span>
                  </div>
                </label>
              ))
            )}
          </div>
        </section>

        <section className="repo-ingestor-section">
          <div className="repo-ingestor-section-header">
            <h3>Quality Dashboard / History</h3>
            <span>{qualityRows.length} runs</span>
          </div>
          <div className="repo-ingestor-history">
            {qualityRows.length === 0 ? (
              <div className="repo-ingestor-empty">No ingestion results yet.</div>
            ) : (
              qualityRows.map((result) => {
                const quality = result.quality;
                const score = quality ? `${(quality.overallScore * 100).toFixed(1)}%` : 'n/a';
                const statusClass = result.accepted ? 'accepted' : 'rejected';
                const reason = quality
                  ? [...quality.metadata.reasons, ...quality.structural.reasons, ...quality.llm.reasons][0]
                  : result.blockedReason || 'Rejected by policy.';
                return (
                  <div
                    key={`${result.repo?.fullName}-${score}`}
                    className={`repo-ingestor-history-item ${statusClass}`}
                  >
                    <div className="repo-ingestor-history-top">
                      <a href={result.repo?.htmlUrl || '#'} target="_blank" rel="noreferrer">
                        {result.repo?.fullName}
                      </a>
                      <span className={`repo-ingestor-pill ${statusClass}`}>
                        {result.accepted ? 'ACCEPTED' : 'REJECTED'}
                      </span>
                    </div>
                    <div className="repo-ingestor-history-meta">
                      <span>Quality: {score}</span>
                      <span>Stored: {result.storedMemories}</span>
                      <span>Deduped: {result.dedupedMemories}</span>
                      {result.gitPushExecuted && <span>Git: pushed</span>}
                    </div>
                    {result.gitCommitMessage && (
                      <div className="repo-ingestor-note">Commit: {result.gitCommitMessage}</div>
                    )}
                    {result.gitPushError && <div className="repo-ingestor-reason">Git: {result.gitPushError}</div>}
                    {!result.accepted && <div className="repo-ingestor-reason">{reason || 'No reason available.'}</div>}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="repo-ingestor-section repo-ingestor-logs">
        <div className="repo-ingestor-section-header">
          <h3>Ingestion Log</h3>
          <Button variant="ghost" size="sm" onClick={clearLogs}>
            Clear
          </Button>
        </div>
        <div className="repo-ingestor-log-stream">
          {repoIngestor.logs.length === 0 ? (
            <div className="repo-ingestor-empty">No logs yet.</div>
          ) : (
            repoIngestor.logs.slice(-120).map((line, idx) => (
              <div className="repo-ingestor-log-line" key={`${idx}-${line}`}>
                {line}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
