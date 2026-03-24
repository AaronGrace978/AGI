// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Path Sandboxing & Command Allowlist
//  Restricts file operations to approved directories and
//  commands to a strict allowlist. Defense-in-depth.
// ═══════════════════════════════════════════════════════════════

// ─── Path Sandboxing ───────────────────────────────────────────

const FORBIDDEN_PATHS_WIN = [
  /^[a-z]:\\windows/i,
  /^[a-z]:\\program files/i,
  /^[a-z]:\\program files \(x86\)/i,
  /^[a-z]:\\programdata/i,
  /^[a-z]:\\recovery/i,
  /^[a-z]:\\system volume information/i,
  /^[a-z]:\\\\?\$recycle\.bin/i,
  /\\system32/i,
  /\\syswow64/i,
  /\\boot\.ini$/i,
  /\\ntldr$/i,
  /\\bootmgr$/i,
];

const FORBIDDEN_PATHS_UNIX = [
  /^\/etc/,
  /^\/bin/,
  /^\/sbin/,
  /^\/usr\/bin/,
  /^\/usr\/sbin/,
  /^\/boot/,
  /^\/dev/,
  /^\/proc/,
  /^\/sys/,
  /^\/var\/log/,
  /^\/root/,
];

export function isPathForbidden(inputPath: string, platform: string = 'win32'): boolean {
  const normalized = inputPath.replace(/\\/g, '/').replace(/\/+/g, '/');
  // Block path traversal attempts
  if (normalized.includes('..')) return true;
  // Block null bytes
  if (inputPath.includes('\0')) return true;

  const patterns = platform === 'win32' ? FORBIDDEN_PATHS_WIN : FORBIDDEN_PATHS_UNIX;
  const testPath = platform === 'win32' ? inputPath : normalized;
  return patterns.some((p) => p.test(testPath));
}

export function validateSandboxedPath(
  inputPath: string,
  allowedRoots: string[],
  platform: string = 'win32',
): { allowed: boolean; reason: string } {
  if (isPathForbidden(inputPath, platform)) {
    return { allowed: false, reason: `Path "${inputPath}" is in a protected system directory.` };
  }

  if (allowedRoots.length === 0) {
    // No explicit sandbox — just block forbidden dirs
    return { allowed: true, reason: 'No sandbox configured; system paths blocked.' };
  }

  const normInput = inputPath.replace(/\\/g, '/').toLowerCase();
  const inRoot = allowedRoots.some((root) => {
    const normRoot = root.replace(/\\/g, '/').toLowerCase();
    return normInput.startsWith(normRoot);
  });

  if (!inRoot) {
    return {
      allowed: false,
      reason: `Path "${inputPath}" is outside the allowed sandbox roots: ${allowedRoots.join(', ')}`,
    };
  }

  return { allowed: true, reason: 'Path is within allowed sandbox.' };
}

// ─── Command Allowlist ─────────────────────────────────────────

export const COMMAND_ALLOWLIST_PATTERNS = [
  // Safe read-only commands
  /^(dir|ls|cat|type|get-content|get-childitem|get-item|get-process|get-service)\b/i,
  /^(echo|write-output|write-host|select-string|find|findstr|where|grep)\b/i,
  /^(hostname|whoami|ipconfig|ifconfig|nslookup|ping|tracert|netstat|tasklist)\b/i,
  /^(node|python|pip|npm|npx|yarn|pnpm|git|code|cursor)\b/i,
  /^(mkdir|new-item|copy|copy-item|move|move-item|rename|rename-item)\b/i,
  // Scoped destructive (will also be caught by gate)
  /^(remove-item|del|rm)\b/i,
  /^(start-process|invoke-webrequest|invoke-restmethod|curl|wget|fetch)\b/i,
];

export function isCommandAllowlisted(command: string): boolean {
  const trimmed = command.trim();
  return COMMAND_ALLOWLIST_PATTERNS.some((p) => p.test(trimmed));
}

export interface CommandValidation {
  allowed: boolean;
  reason: string;
  isAllowlisted: boolean;
}

export function validateCommand(command: string): CommandValidation {
  const trimmed = command.trim();

  // Empty check
  if (!trimmed) {
    return { allowed: false, reason: 'Empty command', isAllowlisted: false };
  }

  // Length sanity
  if (trimmed.length > 8000) {
    return { allowed: false, reason: 'Command exceeds maximum length (8000 chars)', isAllowlisted: false };
  }

  // Check against blocked patterns (imported from gate.ts via BLOCKED_COMMANDS check at call site)
  const isAllowlisted = isCommandAllowlisted(trimmed);

  return {
    allowed: true, // Final block decision is made by gate.ts + BLOCKED_COMMANDS
    reason: isAllowlisted ? 'Command matches allowlist' : 'Command not in allowlist — gate evaluation required',
    isAllowlisted,
  };
}
