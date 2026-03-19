function summarizeRuntimeIssuesFromEntries(entries = []) {
  const buckets = new Map();
  for (const entry of entries) {
    const detailText = String(entry?.detail || entry?.message || entry?.error || '').slice(0, 180);
    const key = String(entry?.kind || entry?.type || 'unknown');
    if (!buckets.has(key)) {
      buckets.set(key, { key, count: 0, lastSeenAt: null, samples: [] });
    }
    const current = buckets.get(key);
    current.count += 1;
    current.lastSeenAt = Math.max(current.lastSeenAt || 0, Number(entry?.timestamp || entry?.emittedAt || 0) || 0);
    if (detailText && current.samples.length < 2) current.samples.push(detailText);
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((item) => ({
      key: item.key,
      count: item.count,
      lastSeenAt: item.lastSeenAt || null,
      samples: item.samples,
      severity: item.key.includes('error') || item.key.includes('fail') || item.key.includes('block')
        ? 'error'
        : item.key.includes('warn')
          ? 'warn'
          : 'info',
    }));
}

function buildRuntimeHealthSummary(params) {
  const {
    dataDir,
    auditLogPath,
    orchestratorEventsPath,
    auditEntries = [],
    orchestratorEntries = [],
    neuralBridgeReady = false,
    rendererResponsive = true,
  } = params || {};
  const issues = summarizeRuntimeIssuesFromEntries([...auditEntries, ...orchestratorEntries]);
  return {
    generatedAt: Date.now(),
    dataDir,
    auditLogPath,
    orchestratorEventsPath,
    totalAuditEntries: Array.isArray(auditEntries) ? auditEntries.length : 0,
    totalOrchestratorEvents: Array.isArray(orchestratorEntries) ? orchestratorEntries.length : 0,
    issues,
    services: {
      neuralBridgeReady: Boolean(neuralBridgeReady),
      rendererResponsive: Boolean(rendererResponsive),
    },
  };
}

module.exports = {
  summarizeRuntimeIssuesFromEntries,
  buildRuntimeHealthSummary,
};
