import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { yieldToRenderer } from '../store/slices/forge';

const root = dirname(fileURLToPath(import.meta.url));

describe('Forge click must not freeze the UI', () => {
  it('does not start the pipeline when switching modules', () => {
    const chat = readFileSync(join(root, '../store/slices/chat.ts'), 'utf8');
    expect(chat).toMatch(/setActiveModule:\s*\(m:\s*string\)\s*=>\s*set\(\{\s*activeModule:/);
    expect(chat).toContain('never start Forge');
  });

  it('defers pipeline work after the click frame', () => {
    const panel = readFileSync(join(root, '../components/ForgePanel.tsx'), 'utf8');
    expect(panel).toContain('window.setTimeout(() => {');
    expect(panel).toContain('void startForge(');
  });

  it('uses startTransition for sidebar navigation', () => {
    const sidebar = readFileSync(join(root, '../components/Sidebar.tsx'), 'utf8');
    expect(sidebar).toContain('startTransition(() => setActiveModule(mod.id))');
  });

  it('keeps forge flex children shrinkable so layout cannot lock', () => {
    const css = readFileSync(join(root, '../App.css'), 'utf8');
    expect(css).toMatch(/\.forge-panel \{[\s\S]*?min-height: 0;/);
    expect(css).toMatch(/\.forge-grid \{[\s\S]*?min-height: 0;/);
  });

  it('yieldToRenderer resolves without blocking', async () => {
    const started = Date.now();
    await yieldToRenderer(5);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4);
  });
});
