import React from 'react';
import { NavigationPath } from '../types';

interface SidebarProps {
  currentPath: NavigationPath;
  onNavigate: (path: NavigationPath) => void;
  clusterHealth?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  clusterHealth = '100% NOMINAL'
}) => {
  const menuItems = [
    { id: 'team-workspace' as NavigationPath, label: 'Team & Workspace', icon: 'group', step: '01' },
    { id: 'connect-agents' as NavigationPath, label: 'Connect Agents', icon: 'hub', step: '02' },
    { id: 'agent-fleet-dashboard' as NavigationPath, label: 'Fleet Dashboard', icon: 'grid_view', step: '03' },
    { id: 'auth' as NavigationPath, label: 'Login', icon: 'lock', step: '04' },
  ];

  return (
    <aside className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-60 bg-[#0d0e0f] border-r border-[#444748]/20 z-40 hidden lg:flex flex-col justify-between py-6 px-4">
      <div className="flex flex-col gap-6">
        <div className="px-2 font-mono text-[10px] text-[#8e9192] uppercase tracking-wider">
          Workspace Flow
        </div>

        <nav className="flex flex-col gap-1.5">
          {menuItems.map((item) => {
            const isActive = currentPath === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer w-full ${
                  isActive
                    ? 'bg-[#292a2b] text-white font-medium shadow-sm'
                    : 'text-[#c4c7c8] hover:bg-[#1f2021] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[18px]">
                    {item.icon}
                  </span>
                  <span className="text-sm">{item.label}</span>
                </div>
                <span className="font-mono text-[10px] text-[#8e9192]">{item.step}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3">
        {/* Node Auth Status */}
        <button
          onClick={() => onNavigate('auth')}
          className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left cursor-pointer ${
            currentPath === 'auth'
              ? 'bg-[#292a2b] border-white text-white'
              : 'bg-[#121315] border-[#444748]/25 hover:border-[#8e9192] text-[#c4c7c8]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[16px] text-white">key</span>
            <div className="flex flex-col">
              <span className="font-mono text-[9px] text-[#8e9192] uppercase">Node Security</span>
              <span className="font-mono text-xs text-white">Auth Credentials</span>
            </div>
          </div>
          <span className="material-symbols-outlined text-[16px] text-[#8e9192]">chevron_right</span>
        </button>

        {/* Mesh Status */}
        <div className="p-3 bg-[#171819] rounded-lg flex items-center justify-between border border-[#444748]/20 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span className="text-[#8e9192] text-[11px]">Mesh Health</span>
          </div>
          <span className="text-white font-medium text-[11px]">{clusterHealth}</span>
        </div>
      </div>
    </aside>
  );
};
