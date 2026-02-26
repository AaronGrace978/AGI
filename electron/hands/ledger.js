function appendActionLedger({
  appendLedgerEntry,
  runId,
  action,
  params,
  result,
  tier,
  blocked,
  rollback,
}) {
  if (!runId) return;
  appendLedgerEntry(runId, 'hands_action', {
    action,
    params: params || {},
    success: !!result?.success,
    error: result?.error || '',
    output: String(result?.output || result?.stdout || result?.content || '').slice(0, 1200),
    tier: tier || 'high-risk',
    blocked: !!blocked,
    rollback: rollback || null,
    timestamp: Date.now(),
  });
}

module.exports = {
  appendActionLedger,
};
