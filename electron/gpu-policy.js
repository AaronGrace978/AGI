// ═══════════════════════════════════════════════════════════════
//  GPU / Chromium policy
//
//  1.1.1 disabled GPU compositing on Windows by default. That
//  painted a white slab over the window and froze Hands Settings
//  (backdrop-filter + position:fixed with no compositor).
//
//  Default: GPU stays ON. Windows only disables the native
//  occlusion feature that can freeze frameless Electron windows.
//
//  Force off (after a real kernel bugcheck): --safe-mode
//  or AGI_PRIME_DISABLE_GPU=1
// ═══════════════════════════════════════════════════════════════

function envEnabled(env, key) {
  const v = env[key];
  return v === '1' || v === 'true' || v === 'TRUE' || v === 'yes';
}

function windowsStabilitySwitches() {
  // Prevents some frameless Electron windows from freezing on Windows 10/11.
  return [['disable-features', 'CalculateNativeWinOcclusion']];
}

function gpuOffSwitches(platform) {
  // disableHardwareAcceleration() already implies --disable-gpu.
  // Do NOT add disable-gpu-compositing or disable-direct-composition:
  // those leave unpainted white regions and lock the UI.
  const switches = [['disable-gpu-shader-disk-cache']];
  if (platform === 'win32') {
    switches.push(...windowsStabilitySwitches());
  }
  return switches;
}

/**
 * @param {{ platform?: string, env?: NodeJS.ProcessEnv, argv?: string[] }} [input]
 */
function resolveGpuPolicy(input = {}) {
  const platform = input.platform || process.platform;
  const env = input.env || process.env;
  const argv = input.argv || process.argv;

  const safeMode = argv.includes('--safe-mode') || envEnabled(env, 'AGI_PRIME_DISABLE_GPU');
  const enableGpu = envEnabled(env, 'AGI_PRIME_ENABLE_GPU');

  if (safeMode) {
    return {
      disableHardwareAcceleration: true,
      reason: 'safe-mode',
      switches: gpuOffSwitches(platform),
    };
  }

  if (enableGpu) {
    return {
      disableHardwareAcceleration: false,
      reason: 'opt-in',
      switches: platform === 'win32' ? windowsStabilitySwitches() : [],
    };
  }

  if (platform === 'win32') {
    return {
      disableHardwareAcceleration: false,
      reason: 'windows-default',
      switches: windowsStabilitySwitches(),
    };
  }

  return {
    disableHardwareAcceleration: false,
    reason: 'default',
    switches: [],
  };
}

function applyGpuPolicy(app, policy) {
  if (policy.disableHardwareAcceleration) {
    app.disableHardwareAcceleration();
  }
  for (const sw of policy.switches || []) {
    if (!sw || !sw[0]) continue;
    if (sw.length > 1 && sw[1] != null && sw[1] !== '') {
      app.commandLine.appendSwitch(sw[0], sw[1]);
    } else {
      app.commandLine.appendSwitch(sw[0]);
    }
  }
}

module.exports = {
  envEnabled,
  gpuOffSwitches,
  windowsStabilitySwitches,
  resolveGpuPolicy,
  applyGpuPolicy,
};
