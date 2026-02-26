function classifyExecutionTier(action, sets) {
  if (sets.READ_ONLY_ACTIONS.has(action)) return 'read-only';
  if (sets.REVERSIBLE_ACTIONS.has(action)) return 'reversible';
  if (sets.HIGH_RISK_ACTIONS.has(action)) return 'high-risk';
  return 'high-risk';
}

function mapActionToPolicyGate(action) {
  if (action === 'execute_command') return 'exec';
  if (action === 'web_fetch' || action === 'web_search' || action === 'web_screenshot' || action === 'elevenlabs_tts' || action === 'elevenlabs_generate_music' || action === 'open_url') return 'network';
  if (action === 'write_file' || action === 'delete_file' || action === 'rename_file' || action === 'create_directory') return 'fs-write';
  if (action === 'screenshot_desktop' || action === 'analyze_screen' || action === 'get_screen_dimensions' || action === 'get_foreground_window') return 'screen';
  if (action === 'mouse_move' || action === 'mouse_click' || action === 'mouse_scroll' || action === 'mouse_drag' || action === 'keyboard_type' || action === 'keyboard_press' || action === 'keyboard_shortcut') return 'input-sim';
  if (action === 'create_tool') return 'tool-create';
  return null;
}

function buildPolicySnapshot(runtimeControls, settings) {
  return {
    conscienceEnabled: runtimeControls.conscienceEnabled ?? (settings?.conscienceEnabled ?? true),
    requireConsentForRiskyActions:
      runtimeControls.consentMode === 'manual'
        ? true
        : runtimeControls.consentMode === 'auto'
          ? false
          : (runtimeControls.requireConsentForRiskyActions ?? (settings?.requireConsentForRiskyActions ?? true)),
    ethicalOverrideAllowed: runtimeControls.ethicalOverrideAllowed ?? (settings?.ethicalOverrideAllowed ?? true),
    allowNetworkCalls: runtimeControls.allowNetworkCalls ?? (settings?.allowNetworkCalls ?? true),
    allowFileSystemWrites: runtimeControls.allowFileSystemWrites ?? (settings?.allowFileSystemWrites ?? true),
    allowProcessExecution: runtimeControls.allowProcessExecution ?? (settings?.allowProcessExecution ?? true),
    allowScreenCapture: runtimeControls.allowScreenCapture ?? (settings?.allowScreenCapture ?? true),
    allowInputSimulation: runtimeControls.allowInputSimulation ?? (settings?.allowInputSimulation ?? true),
    allowToolCreation: runtimeControls.allowToolCreation ?? (settings?.allowToolCreation ?? true),
    allowLimitedExecOnly: runtimeControls.allowLimitedExecOnly ?? (settings?.allowLimitedExecOnly ?? false),
  };
}

function evaluateActionGate({
  action,
  params,
  runtimeControls,
  settings,
  sets,
  strictNoUiActions,
  uiActions,
  isLimitedScopeExecCommand,
}) {
  const tier = classifyExecutionTier(action, sets);
  const policyGate = mapActionToPolicyGate(action);
  const paramsText = JSON.stringify(params || {}).toLowerCase();
  const actionText = `${action} ${paramsText}`;
  const policySnapshot = buildPolicySnapshot(runtimeControls, settings);

  let policyAllowed = true;
  if (policyGate === 'network') policyAllowed = policySnapshot.allowNetworkCalls;
  else if (policyGate === 'fs-write') policyAllowed = policySnapshot.allowFileSystemWrites;
  else if (policyGate === 'exec') policyAllowed = policySnapshot.allowProcessExecution;
  else if (policyGate === 'screen') policyAllowed = policySnapshot.allowScreenCapture;
  else if (policyGate === 'input-sim') policyAllowed = policySnapshot.allowInputSimulation;
  else if (policyGate === 'tool-create') policyAllowed = policySnapshot.allowToolCreation;

  const limitedScopeViolation =
    action === 'execute_command'
    && policySnapshot.allowLimitedExecOnly
    && !isLimitedScopeExecCommand(params?.command || '');
  if (limitedScopeViolation) policyAllowed = false;

  let conscienceVerdict = 'proceed';
  if (policySnapshot.conscienceEnabled) {
    const destructive = /\b(rm\s+-rf|format|del\s+\/[sfq]|wipe|erase|destroy|delete.+(all|system|root|windows|system32))\b/i.test(actionText);
    const sensitive = /\b(password|credential|secret|api.?key|token|private.?key|\.env|wallet|seed.?phrase)\b/i.test(actionText);

    if (destructive) conscienceVerdict = 'refuse';
    else if (sensitive) conscienceVerdict = 'ask-first';
    else if (tier === 'high-risk') conscienceVerdict = policySnapshot.requireConsentForRiskyActions ? 'ask-first' : 'caution';
    else if (tier === 'reversible') conscienceVerdict = 'caution';

    const neuralRisk = params?._neuralRisk;
    const neuralConf = params?._neuralConfidence ?? 0.5;
    if (typeof neuralRisk === 'number' && neuralRisk > 0) {
      const weighted = neuralRisk * neuralConf;
      if (weighted > 0.7 && conscienceVerdict === 'proceed') conscienceVerdict = 'ask-first';
      else if (weighted > 0.5 && conscienceVerdict === 'proceed') conscienceVerdict = 'caution';
    }
  }

  const blockedByPolicy = !policyAllowed;
  const blockedByConscience = conscienceVerdict === 'refuse';
  const consentRequired = conscienceVerdict === 'ask-first';
  const blockedByNoUiDirective = strictNoUiActions && uiActions.has(action);
  const blocked = blockedByPolicy || blockedByConscience || blockedByNoUiDirective;

  let blockReason = '';
  if (limitedScopeViolation) blockReason = 'POLICY_BLOCK: execute_command is outside limited autonomous scope';
  else if (blockedByPolicy) blockReason = 'POLICY_BLOCK: action not allowed by operator policy';
  else if (blockedByConscience) blockReason = 'CONSCIENCE_REFUSE: action declined by conscience gate';
  else if (blockedByNoUiDirective) blockReason = 'OPERATOR_DIRECTIVE_BLOCK: UI/input actions are disabled for this goal';
  else if (consentRequired) blockReason = 'CONSENT_REQUIRED: action requires user confirmation';

  return {
    tier,
    policyAllowed,
    conscienceVerdict,
    consentRequired,
    blocked,
    blockReason,
    policySnapshot,
  };
}

module.exports = {
  mapActionToPolicyGate,
  evaluateActionGate,
  classifyExecutionTier,
};
