// ═══════════════════════════════════════════════════════════════
//  Sidebar — Module Navigation
//  Each icon is an independent OS module of the AGI
// ═══════════════════════════════════════════════════════════════

import { memo } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import type { ModuleId } from '../types';

interface SidebarItem {
  id: ModuleId;
  icon: string;
  label: string;
  className?: string;
}

const MODULES: SidebarItem[] = [
  { id: 'nexus', icon: '⬡', label: 'NEXUS — Chat' },
  { id: 'memory', icon: '◍', label: 'MEMORY — Chronicle', className: 'memory-btn' },
  { id: 'heart', icon: '♥', label: 'HEART — Soul', className: 'heart-btn' },
  { id: 'mind', icon: '◈', label: 'MIND — Arena', className: 'mind-btn' },
  { id: 'hands', icon: '✧', label: 'HANDS — Agent', className: 'hands-btn' },
  { id: 'forge', icon: '⚒', label: 'FORGE — Pipeline', className: 'forge-btn' },
  { id: 'gauntlet', icon: '⚔', label: 'GAUNTLET — Capabilities', className: 'gauntlet-btn' },
  { id: 'sovereign', icon: '◆', label: 'SOVEREIGN — Command', className: 'sovereign-btn' },
  { id: 'spark', icon: '⚡', label: 'SPARK — Cognitive Kernel', className: 'spark-btn' },
  { id: 'voice', icon: '◎', label: 'VOICE — Living Presence', className: 'voice-btn' },
  { id: 'oracle', icon: '☿', label: 'ORACLE — Psychic Prime', className: 'mind-btn' },
];

function getStatusClass(state: string): string {
  if (state === 'processing') return 'processing';
  if (state === 'offline') return 'offline';
  return '';
}

export default memo(function Sidebar() {
  const activeModule = useStore((s) => s.activeModule);
  const setActiveModule = useStore((s) => s.setActiveModule);
  const moduleStates = useStore(useShallow((s) => s.moduleStates));

  return (
    <nav className="sidebar">
      <div className="sidebar-top">
        {MODULES.map((mod) => (
          <button
            key={mod.id}
            className={`sidebar-btn ${mod.className || ''} ${activeModule === mod.id ? 'active' : ''}`}
            onClick={() => setActiveModule(mod.id)}
            title={mod.label}
          >
            {mod.icon}
            <span className={`status-dot ${getStatusClass(moduleStates[mod.id])}`} />
            <span className="sidebar-tooltip">{mod.label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-divider" />
        <button
          className={`sidebar-btn creed-btn ${activeModule === 'creed' ? 'active' : ''}`}
          onClick={() => setActiveModule('creed')}
          title="THE CREED — Faith & Soul"
        >
          ✝
          <span className="sidebar-tooltip">THE CREED</span>
        </button>
        <button
          className={`sidebar-btn ${activeModule === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveModule('settings')}
          title="Settings"
        >
          ⚙
          <span className="sidebar-tooltip">SETTINGS</span>
        </button>
      </div>
    </nav>
  );
});
