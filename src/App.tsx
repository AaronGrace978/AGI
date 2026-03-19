// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Main Application Shell
//  The operating system for artificial general intelligence
// ═══════════════════════════════════════════════════════════════

import { useEffect, lazy, Suspense, memo } from 'react';
import { useStore } from './store';
import Sidebar from './components/Sidebar';
import agiPrimeLogo from './assets/agi-prime-logo.svg';
import { AppErrorBoundary } from './components/AppErrorBoundary';

const NexusPanel = lazy(() => import('./components/NexusPanel'));
const MemoryPanel = lazy(() => import('./components/MemoryPanel'));
const HeartPanel = lazy(() => import('./components/HeartPanel'));
const MindPanel = lazy(() => import('./components/MindPanel'));
const HandsPanel = lazy(() => import('./components/HandsPanel'));
const ForgePanel = lazy(() => import('./components/ForgePanel'));
const GauntletPanel = lazy(() => import('./components/GauntletPanel'));
const SovereignPanel = lazy(() => import('./components/SovereignPanel'));
const SparkPanel = lazy(() => import('./components/SparkPanel'));
const VoiceBox = lazy(() => import('./components/VoiceBox'));
const OraclePanel = lazy(() => import('./components/OraclePanel'));
const CreedPanel = lazy(() => import('./components/CreedPanel'));
const SettingsPanel = lazy(() => import('./components/SettingsPanel'));

function PanelLoader() {
  return (
    <div className="panel-loader">
      <div className="panel-loader-dot" />
    </div>
  );
}

function TitleBar() {
  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-brand">
          <div className="titlebar-logo">
            <img src={agiPrimeLogo} alt="AGI PRIME logo" className="titlebar-logo-image" />
          </div>
          <span className="titlebar-text">AGI PRIME</span>
          <span className="titlebar-version">v1.0</span>
        </div>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn minimize" onClick={() => window.api.window.minimize()}>
          <svg width="10" height="1"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button className="titlebar-btn maximize" onClick={() => window.api.window.maximize()}>
          <svg width="10" height="10"><rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
        </button>
        <button className="titlebar-btn close" onClick={() => window.api.window.close()}>
          <svg width="10" height="10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const ActivePanel = memo(function ActivePanel() {
  const activeModule = useStore((s) => s.activeModule);

  let panel: React.ReactNode;
  switch (activeModule) {
    case 'nexus':    panel = <NexusPanel />; break;
    case 'memory':   panel = <MemoryPanel />; break;
    case 'heart':    panel = <HeartPanel />; break;
    case 'mind':     panel = <MindPanel />; break;
    case 'hands':    panel = <HandsPanel />; break;
    case 'forge':    panel = <ForgePanel />; break;
    case 'gauntlet': panel = <GauntletPanel />; break;
    case 'sovereign': panel = <SovereignPanel />; break;
    case 'spark':    panel = <SparkPanel />; break;
    case 'voice':    panel = <VoiceBox />; break;
    case 'oracle':   panel = <OraclePanel />; break;
    case 'creed':    panel = <CreedPanel />; break;
    case 'settings': panel = <SettingsPanel />; break;
    default:         panel = <NexusPanel />;
  }

  return <Suspense fallback={<PanelLoader />}>{panel}</Suspense>;
});

export default function App() {
  const initialize = useStore((s) => s.initialize);
  const initialized = useStore((s) => s.initialized);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <AppErrorBoundary>
          <Sidebar />
        </AppErrorBoundary>
        <AppErrorBoundary>
          <main className="main-content">
            {initialized ? <ActivePanel /> : (
              <div className="boot-screen">
                <div className="boot-logo">
                  <img src={agiPrimeLogo} alt="AGI PRIME logo" className="boot-logo-image" />
                </div>
                <div className="boot-text">INITIALIZING AGI PRIME</div>
                <div className="boot-bar"><div className="boot-bar-fill" /></div>
                <div className="boot-status">Loading consciousness modules...</div>
              </div>
            )}
          </main>
        </AppErrorBoundary>
      </div>
    </div>
  );
}
