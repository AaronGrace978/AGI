export type HostPlatform = 'darwin' | 'win32' | 'linux' | 'web';

export interface RuntimeInfo {
  platform: HostPlatform;
  arch: string;
  version: string;
  isPackaged: boolean;
  isSteamDeck: boolean;
  hostLabel: string;
  compact: boolean;
  gpuHardwareAcceleration?: boolean;
  gpuPolicyReason?: string;
}

const PACKAGE_VERSION = '1.1.4';

function fallbackRuntime(): RuntimeInfo {
  return {
    platform: 'web',
    arch: '',
    version: PACKAGE_VERSION,
    isPackaged: false,
    isSteamDeck: false,
    hostLabel: 'Web',
    compact: false,
  };
}

export function getRuntimeInfo(): RuntimeInfo {
  const rt = typeof window !== 'undefined' ? window.agiRuntime : undefined;
  if (!rt) return fallbackRuntime();
  const platform = (
    rt.platform === 'darwin' || rt.platform === 'win32' || rt.platform === 'linux' ? rt.platform : 'web'
  ) as HostPlatform;
  return {
    platform,
    arch: rt.arch || '',
    version: rt.version || PACKAGE_VERSION,
    isPackaged: Boolean(rt.isPackaged),
    isSteamDeck: Boolean(rt.isSteamDeck),
    hostLabel: rt.hostLabel || platform,
    compact: Boolean(rt.compact),
    gpuHardwareAcceleration: rt.gpuHardwareAcceleration,
    gpuPolicyReason: rt.gpuPolicyReason,
  };
}

export function shouldUseCompactChrome(compactMode?: boolean): boolean {
  if (compactMode === true) return true;
  if (compactMode === false) return false;
  return getRuntimeInfo().compact;
}
