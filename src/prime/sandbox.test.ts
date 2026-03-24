// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Path Sandboxing & Command Validation Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { isPathForbidden, validateSandboxedPath, isCommandAllowlisted, validateCommand } from './sandbox';

describe('isPathForbidden', () => {
  it('blocks Windows system directories', () => {
    expect(isPathForbidden('C:\\Windows\\System32\\cmd.exe', 'win32')).toBe(true);
    expect(isPathForbidden('C:\\Program Files\\App', 'win32')).toBe(true);
    expect(isPathForbidden('C:\\Program Files (x86)\\App', 'win32')).toBe(true);
    expect(isPathForbidden('C:\\ProgramData\\secrets', 'win32')).toBe(true);
  });

  it('blocks Unix system directories', () => {
    expect(isPathForbidden('/etc/passwd', 'linux')).toBe(true);
    expect(isPathForbidden('/bin/sh', 'linux')).toBe(true);
    expect(isPathForbidden('/boot/grub', 'linux')).toBe(true);
    expect(isPathForbidden('/proc/1/status', 'linux')).toBe(true);
    expect(isPathForbidden('/root/.ssh', 'linux')).toBe(true);
  });

  it('blocks path traversal', () => {
    expect(isPathForbidden('C:\\Users\\me\\..\\..\\Windows\\System32', 'win32')).toBe(true);
    expect(isPathForbidden('/home/user/../../etc/shadow', 'linux')).toBe(true);
  });

  it('blocks null bytes', () => {
    expect(isPathForbidden('C:\\Users\\me\\file\0.txt', 'win32')).toBe(true);
  });

  it('allows user home directories', () => {
    expect(isPathForbidden('C:\\Users\\Aaron\\Documents\\project', 'win32')).toBe(false);
    expect(isPathForbidden('/home/user/projects/app', 'linux')).toBe(false);
  });
});

describe('validateSandboxedPath', () => {
  it('blocks forbidden paths even without explicit sandbox', () => {
    const result = validateSandboxedPath('C:\\Windows\\System32\\evil.exe', [], 'win32');
    expect(result.allowed).toBe(false);
  });

  it('allows paths within sandbox roots', () => {
    const result = validateSandboxedPath('C:\\Users\\Aaron\\project\\file.txt', ['C:\\Users\\Aaron\\project'], 'win32');
    expect(result.allowed).toBe(true);
  });

  it('blocks paths outside sandbox roots', () => {
    const result = validateSandboxedPath('D:\\other\\secret.txt', ['C:\\Users\\Aaron\\project'], 'win32');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('outside');
  });
});

describe('isCommandAllowlisted', () => {
  it('allows common safe commands', () => {
    expect(isCommandAllowlisted('dir C:\\')).toBe(true);
    expect(isCommandAllowlisted('Get-ChildItem')).toBe(true);
    expect(isCommandAllowlisted('echo hello')).toBe(true);
    expect(isCommandAllowlisted('npm install')).toBe(true);
    expect(isCommandAllowlisted('git status')).toBe(true);
    expect(isCommandAllowlisted('node --version')).toBe(true);
    expect(isCommandAllowlisted('python script.py')).toBe(true);
  });

  it('rejects unknown/unlisted commands', () => {
    expect(isCommandAllowlisted('evil-binary --hack')).toBe(false);
    expect(isCommandAllowlisted('custom-exploit.exe')).toBe(false);
  });
});

describe('validateCommand', () => {
  it('rejects empty commands', () => {
    const result = validateCommand('');
    expect(result.allowed).toBe(false);
  });

  it('rejects overly long commands', () => {
    const result = validateCommand('a'.repeat(9000));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('length');
  });

  it('marks allowlisted commands', () => {
    const result = validateCommand('npm install express');
    expect(result.isAllowlisted).toBe(true);
  });

  it('marks non-allowlisted commands for gate evaluation', () => {
    const result = validateCommand('some-custom-binary');
    expect(result.isAllowlisted).toBe(false);
    expect(result.reason).toContain('gate evaluation');
  });
});
