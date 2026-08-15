// ═══════════════════════════════════════════════════════════════
//  Sidebar — Module Navigation
//  Each icon is an independent OS module of the AGI
// ═══════════════════════════════════════════════════════════════

import { memo } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import type { ModuleId } from '../types';
import { StatusDot, type StatusDotStatus } from './ui';

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
  { id: 'repo', icon: '⎇', label: 'REPO — Knowledge Ingestor', className: 'repo-btn' },
  { id: 'voice', icon: '◎', label: 'VOICE — Living Presence', className: 'voice-btn' },
  { id: 'oracle', icon: '☿', label: 'ORACLE — Psychic Prime', className: 'mind-btn' },
];

function toStatusDot(state: string): StatusDotStatus {
  if (state === 'processing') return 'processing';
  if (state === 'offline') return 'offline';
  return 'online';
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
            type="button"
            key={mod.id}
            className={`sidebar-btn ${mod.className || ''} ${activeModule === mod.id ? 'active' : ''}`}
            onClick={() => setActiveModule(mod.id)}
            title={mod.label}
          >
            {mod.icon}
            <StatusDot status={toStatusDot(moduleStates[mod.id])} size={5} />
            <span className="sidebar-tooltip">{mod.label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-divider" />
        <button
          type="button"
          className={`sidebar-btn creed-btn ${activeModule === 'creed' ? 'active' : ''}`}
          onClick={() => setActiveModule('creed')}
          title="THE CREED — Faith & Soul"
        >
          ✝<span className="sidebar-tooltip">THE CREED</span>
        </button>
        <button
          type="button"
          className={`sidebar-btn ${activeModule === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveModule('settings')}
          title="Settings"
        >
          ⚙<span className="sidebar-tooltip">SETTINGS</span>
        </button>
      </div>
    </nav>
  );
});
