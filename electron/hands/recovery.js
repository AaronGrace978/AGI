async function runRecoveryPlan({
  action,
  params,
  executeSingleAction,
  analyzeScreen,
  emitTelemetryStep,
  goalProgress,
}) {
  // Bounded recovery attempts only.
  const attempts = [];

  // Common strategy: re-observe context before retry.
  try {
    const obs = await analyzeScreen('Briefly identify actionable UI elements and whether the last action likely failed.');
    attempts.push({ type: 'observe', success: !!obs?.success });
  } catch {
    attempts.push({ type: 'observe', success: false });
  }

  if (action === 'mouse_click' && typeof params?.x === 'number' && typeof params?.y === 'number') {
    // Tiny coordinate jitter retry to recover from stale coordinates.
    const retryParams = { ...params, x: params.x + 2, y: params.y + 2 };
    const retry = await executeSingleAction(action, retryParams);
    emitTelemetryStep('recovery retry', {
      action,
      strategy: 'coordinate-jitter',
      success: !!retry?.success,
    }, goalProgress || 0);
    return { success: !!retry?.success, result: retry, attempts };
  }

  if (action === 'keyboard_type' && typeof params?.text === 'string') {
    const retry = await executeSingleAction(action, params);
    emitTelemetryStep('recovery retry', {
      action,
      strategy: 'retype',
      success: !!retry?.success,
    }, goalProgress || 0);
    return { success: !!retry?.success, result: retry, attempts };
  }

  emitTelemetryStep('recovery skipped', { action, strategy: 'none' }, goalProgress || 0);
  return { success: false, result: null, attempts };
}

module.exports = {
  runRecoveryPlan,
};
