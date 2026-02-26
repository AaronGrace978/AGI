function createRunTelemetry() {
  return {
    startedAt: Date.now(),
    actionCalls: 0,
    totalActionMs: 0,
    parallelBranches: 0,
    dagPlans: 0,
    dagNodesExecuted: 0,
    dagParallelWaves: 0,
    subloopsSpawned: 0,
    maxSubloopDepth: 0,
    recoveryAttempts: 0,
    recoverySuccesses: 0,
    verifyPasses: 0,
    verifyFails: 0,
  };
}

function avgActionMs(runTelemetry) {
  return runTelemetry.actionCalls > 0
    ? Math.round(runTelemetry.totalActionMs / runTelemetry.actionCalls)
    : 0;
}

function makeEmitTelemetryStep(sendStep) {
  return (label, data, goalProgress = 0) => {
    const payload = {
      ...data,
      emittedAt: Date.now(),
    };
    sendStep({
      type: 'observe',
      content: `[Telemetry] ${label}`,
      timestamp: Date.now(),
      actionType: 'telemetry',
      actionResult: {
        success: true,
        output: JSON.stringify(payload).slice(0, 1000),
      },
      goalProgress,
    });
  };
}

module.exports = {
  createRunTelemetry,
  avgActionMs,
  makeEmitTelemetryStep,
};
