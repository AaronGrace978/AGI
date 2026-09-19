import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../App.tsx'), 'utf8');

describe('packaged sidebar navigation', () => {
  it('eager-loads every screen instead of React.lazy code-splitting', () => {
    expect(appSource).not.toMatch(/\blazy\s*\(/);
    expect(appSource).toContain("import NexusPanel from './components/NexusPanel'");
    expect(appSource).toContain("import SettingsPanel from './components/SettingsPanel'");
    expect(appSource).toContain("import HandsPanel from './components/HandsPanel'");
    expect(appSource).toContain("import VoiceBox from './components/VoiceBox'");
  });
});
