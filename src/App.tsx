// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Main Application Shell
//  The operating system for artificial general intelligence
// ═══════════════════════════════════════════════════════════════

import { useEffect, memo, type ComponentType } from 'react';
import { useStore } from './store';
import Sidebar from './components/Sidebar';
import agiPrimeLogo from './assets/agi-prime-logo.svg';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { getRuntimeInfo, shouldUseCompactChrome } from './runtime';
import type { ModuleId } from './types';

// Packaged Electron loads the UI from file:// inside asar. Dynamic
// React.lazy code-splitting each sidebar screen into a separate chunk;
// a missed or stalled chunk paints an empty dark main pane and looks
// like a freeze. Import screens statically so switching is instant.
import NexusPanel from './components/NexusPanel';
import MemoryPanel from './components/MemoryPanel';
import HeartPanel from './components/HeartPanel';
import MindPanel from './components/MindPanel';
import HandsPanel from './components/HandsPanel';
import ForgePanel from './components/ForgePanel';
import GauntletPanel from './components/GauntletPanel';
import SovereignPanel from './components/SovereignPanel';
import SparkPanel from './components/SparkPanel';
import RepoIngestorPanel from './components/RepoIngestorPanel';
import VoiceBox from './components/VoiceBox';
import OraclePanel from './components/OraclePanel';
import CreedPanel from './components/CreedPanel';
import SettingsPanel from './components/SettingsPanel';

const PANELS: Record<ModuleId, ComponentType> = {
  nexus: NexusPanel,
  memory: MemoryPanel,
  heart: HeartPanel,
  mind: MindPanel,
  hands: HandsPanel,
  forge: ForgePanel,
  gauntlet: GauntletPanel,
  sovereign: SovereignPanel,
  spark: SparkPanel,
  repo: RepoIngestorPanel,
  voice: VoiceBox,
  oracle: OraclePanel,
  creed: CreedPanel,
  settings: SettingsPanel,
};

function TitleBar() {
  const runtime = getRuntimeInfo();
  const nativeTrafficLights = runtime.platform === 'darwin';

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-brand">
          <div className="titlebar-logo">
            <img src={agiPrimeLogo} alt="AGI PRIME logo" className="titlebar-logo-image" />
          </div>
          <span className="titlebar-text">AGI PRIME</span>
          <span className="titlebar-version">v{runtime.version}</span>
        </div>
      </div>
      {!nativeTrafficLights && (
        <div className="titlebar-controls">
          <button className="titlebar-btn minimize" aria-label="Minimize" onClick={() => window.api?.window.minimize()}>
            <svg width="10" height="1">
              <rect width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button className="titlebar-btn maximize" aria-label="Maximize" onClick={() => window.api?.window.maximize()}>
            <svg width="10" height="10">
              <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="titlebar-btn close" aria-label="Close" onClick={() => window.api?.window.close()}>
            <svg width="10" height="10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

const ActivePanel = memo(function ActivePanel() {
  const activeModule = useStore((s) => s.activeModule);
  const Panel = PANELS[activeModule] || NexusPanel;
  return <Panel />;
});

export default function App() {
  const initialize = useStore((s) => s.initialize);
  const initialized = useStore((s) => s.initialized);
  const compactMode = useStore((s) => s.settings.compactMode);
  const activeModule = useStore((s) => s.activeModule);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const runtime = getRuntimeInfo();
    document.documentElement.dataset.platform = runtime.platform;
    document.documentElement.dataset.host = runtime.isSteamDeck ? 'steamdeck' : runtime.platform;
    document.documentElement.dataset.density = shouldUseCompactChrome(compactMode) ? 'compact' : 'comfortable';
  }, [compactMode]);

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <AppErrorBoundary>
          <Sidebar />
        </AppErrorBoundary>
        <AppErrorBoundary resetKey={activeModule}>
          <main className="main-content">
            {initialized ? (
              <ActivePanel />
            ) : (
              <div className="boot-screen">
                <div className="boot-logo">
                  <img src={agiPrimeLogo} alt="AGI PRIME logo" className="boot-logo-image" />
                </div>
                <div className="boot-text">INITIALIZING AGI PRIME</div>
                <div className="boot-bar">
                  <div className="boot-bar-fill" />
                </div>
                <div className="boot-status">Loading consciousness modules...</div>
              </div>
            )}
          </main>
        </AppErrorBoundary>
      </div>
    </div>
  );
}
