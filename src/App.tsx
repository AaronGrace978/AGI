// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Main Application Shell
//  The operating system for artificial general intelligence
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { useStore } from './store';
import MatrixRain from './components/MatrixRain';
import Sidebar from './components/Sidebar';
import NexusPanel from './components/NexusPanel';
import HeartPanel from './components/HeartPanel';
import MindPanel from './components/MindPanel';
import HandsPanel from './components/HandsPanel';
import ForgePanel from './components/ForgePanel';
import GauntletPanel from './components/GauntletPanel';
import SovereignPanel from './components/SovereignPanel';
import SparkPanel from './components/SparkPanel';
import VoiceBox from './components/VoiceBox';
import CreedPanel from './components/CreedPanel';
import SettingsPanel from './components/SettingsPanel';

function TitleBar() {
  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-brand">
          <div className="titlebar-logo">◆</div>
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

function ActivePanel() {
  const activeModule = useStore((s) => s.activeModule);

  switch (activeModule) {
    case 'nexus':
      return <NexusPanel />;
    case 'heart':
      return <HeartPanel />;
    case 'mind':
      return <MindPanel />;
    case 'hands':
      return <HandsPanel />;
    case 'forge':
      return <ForgePanel />;
    case 'gauntlet':
      return <GauntletPanel />;
    case 'sovereign':
      return <SovereignPanel />;
    case 'spark':
      return <SparkPanel />;
    case 'voice':
      return <VoiceBox />;
    case 'creed':
      return <CreedPanel />;
    case 'settings':
      return <SettingsPanel />;
    default:
      return <NexusPanel />;
  }
}

export default function App() {
  const initialize = useStore((s) => s.initialize);
  const initialized = useStore((s) => s.initialized);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="app">
      <MatrixRain />
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="main-content">
          {initialized ? <ActivePanel /> : (
            <div className="boot-screen">
              <div className="boot-logo">◆</div>
              <div className="boot-text">INITIALIZING AGI PRIME</div>
              <div className="boot-bar"><div className="boot-bar-fill" /></div>
              <div className="boot-status">Loading consciousness modules...</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
