// ═══════════════════════════════════════════════════════════════
//  GPU / Chromium policy
//
//  Windows bugcheck 0x139 (KERNEL_SECURITY_CHECK_VIOLATION) with
//  parameter 0x1d has been observed when Chromium hardware
//  acceleration hits a GPU / display driver. Hardware acceleration
//  is therefore OFF by default on Windows.
//
//  Opt in:  AGI_PRIME_ENABLE_GPU=1
//  Force off: --safe-mode  or  AGI_PRIME_DISABLE_GPU=1
// ═══════════════════════════════════════════════════════════════

function envEnabled(env, key) {
  const v = env[key];
  return v === '1' || v === 'true' || v === 'TRUE' || v === 'yes';
}

function gpuOffSwitches(platform) {
  const switches = [
    ['disable-gpu'],
    ['disable-gpu-compositing'],
    ['disable-gpu-shader-disk-cache'],
  ];
  if (platform === 'win32') {
    // Avoid DWM / DirectComposition paths that have triggered kernel checks.
    switches.push(['disable-direct-composition']);
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
      switches: [],
    };
  }

  if (platform === 'win32') {
    return {
      disableHardwareAcceleration: true,
      reason: 'windows-default',
      switches: gpuOffSwitches(platform),
    };
  }

  // Do not set ozone-platform-hint=auto — that path has crashed NVIDIA Linux stacks.
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
  resolveGpuPolicy,
  applyGpuPolicy,
};
