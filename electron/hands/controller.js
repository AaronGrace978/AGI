function createControllerState() {
  return {
    profile: 'standard',
    modeIndicator: 'STANDARD',
    startedAt: Date.now(),
  };
}

function applyOwnerDirectProfile(runtimeControls) {
  return {
    ...runtimeControls,
    profile: 'owner-direct',
    consentMode: 'auto',
    requireConsentForRiskyActions: false,
    conscienceEnabled: true,
    ethicalOverrideAllowed: true,
    allowNetworkCalls: true,
    allowFileSystemWrites: true,
    allowProcessExecution: true,
    allowScreenCapture: true,
    allowInputSimulation: true,
    allowToolCreation: true,
    allowLimitedExecOnly: false,
    executionTierLimit: 'high-risk',
  };
}

module.exports = {
  createControllerState,
  applyOwnerDirectProfile,
};
