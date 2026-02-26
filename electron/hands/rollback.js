function createRollbackManager({
  prepareRollbackForAction,
  registerRollbackEntry,
}) {
  function prepare(action, params) {
    try {
      return prepareRollbackForAction(action, params || {});
    } catch {
      return null;
    }
  }

  function registerFromDraft(draft) {
    if (!draft) return null;
    const entry = registerRollbackEntry({
      id: draft.id,
      action: draft.action,
      kind: draft.kind,
      affectedTargets: draft.affectedTargets || [],
      createdAt: Date.now(),
      status: 'ready',
      payload: draft.payload || {},
    });
    return {
      rollbackId: entry.id,
      rollbackStatus: entry.status,
      rollbackTargets: entry.affectedTargets || [],
    };
  }

  return { prepare, registerFromDraft };
}

module.exports = {
  createRollbackManager,
};
