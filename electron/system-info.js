// ═══════════════════════════════════════════════════════════════
//  Slim system:info payload
//
//  Never send soul / consciousness / other memory graphs over IPC.
//  Those objects can be huge or non-cloneable and have hung or
//  crashed the renderer when Settings opened.
// ═══════════════════════════════════════════════════════════════

function buildSystemInfo(input = {}) {
  const memory = input.memory && typeof input.memory === 'object'
    ? {
        rss: Number(input.memory.rss) || 0,
        heapTotal: Number(input.memory.heapTotal) || 0,
        heapUsed: Number(input.memory.heapUsed) || 0,
        external: Number(input.memory.external) || 0,
        arrayBuffers: Number(input.memory.arrayBuffers) || 0,
      }
    : null;

  const paths = input.paths && typeof input.paths === 'object'
    ? {
        userData: String(input.paths.userData || ''),
        dataDir: String(input.paths.dataDir || ''),
        memoryFile: String(input.paths.memoryFile || ''),
        vectorFile: String(input.paths.vectorFile || ''),
        settingsFile: String(input.paths.settingsFile || ''),
        sparkFile: String(input.paths.sparkFile || ''),
      }
    : {};

  return {
    uptime: Number(input.uptime) || 0,
    platform: String(input.platform || ''),
    arch: String(input.arch || ''),
    version: String(input.version || ''),
    isPackaged: Boolean(input.isPackaged),
    isSteamDeck: Boolean(input.isSteamDeck),
    hostLabel: String(input.hostLabel || ''),
    nodeVersion: String(input.nodeVersion || ''),
    electronVersion: String(input.electronVersion || ''),
    memory,
    paths,
    gpuHardwareAcceleration: Boolean(input.gpuHardwareAcceleration),
    gpuPolicyReason: String(input.gpuPolicyReason || ''),
  };
}

module.exports = { buildSystemInfo };
