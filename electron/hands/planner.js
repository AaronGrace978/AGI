function isParallelSafeAction(action, PARALLEL_SAFE_ACTIONS) {
  return PARALLEL_SAFE_ACTIONS.has(action);
}

function normalizeDecisionPayload(decisionPayload) {
  const d = decisionPayload || {};
  return {
    thought: d.thought || '',
    action: d.action || '',
    params: d.params || {},
    sequence: Array.isArray(d.sequence) ? d.sequence : [],
    parallel: Array.isArray(d.parallel) ? d.parallel : [],
    plan: d.plan && Array.isArray(d.plan.nodes) ? d.plan : null,
    subgoal: d.subgoal || null,
    verifyAfter: !!d.verifyAfter,
    goalProgress: Number.isFinite(Number(d.goalProgress)) ? Number(d.goalProgress) : 0,
    shouldStop: !!d.shouldStop,
  };
}

module.exports = {
  isParallelSafeAction,
  normalizeDecisionPayload,
};
