import React from 'react';
import { NavigationPath } from '../types';
import { AuthUser } from '../lib/authClient';

interface SidebarProps {
  currentPath: NavigationPath;
  onNavigate: (path: NavigationPath) => void;
  clusterHealth?: string;
  user?: AuthUser | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  clusterHealth = '100% NOMINAL',
  user = null,
}) => {
  const menuItems = [
    { id: 'team-workspace' as NavigationPath, label: 'Team & Workspace', icon: 'group', step: '01' },
    { id: 'connect-agents' as NavigationPath, label: 'Connect Agents', icon: 'hub', step: '02' },
    { id: 'pair-agent' as NavigationPath, label: 'Pair Your Agent', icon: 'key', step: '03' },
    { id: 'agent-fleet-dashboard' as NavigationPath, label: 'Fleet Dashboard', icon: 'grid_view', step: '04' },
    { id: 'auth' as NavigationPath, label: 'Login', icon: 'lock', step: '05' },
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
        {/* Signed-in identity (Gmail / GitHub) — the real session, not a mock */}
        <button
          onClick={() => onNavigate('auth')}
          className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left cursor-pointer ${
            currentPath === 'auth'
              ? 'bg-[#292a2b] border-white text-white'
              : 'bg-[#121315] border-[#444748]/25 hover:border-[#8e9192] text-[#c4c7c8]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-full object-cover border border-[#444748]/40 shrink-0"
              />
            ) : (
              <span className="material-symbols-outlined text-[16px] text-white">
                {user ? 'verified_user' : 'key'}
              </span>
            )}
            <div className="flex flex-col min-w-0">
              <span className="font-mono text-[9px] text-[#8e9192] uppercase">
                {user ? 'Signed in' : 'Session'}
              </span>
              <span className="font-mono text-xs text-white truncate">
                {user ? user.name : 'Not authenticated'}
              </span>
              <span className="font-mono text-[9px] text-[#8e9192] truncate">
                {user ? user.providerLabel.toUpperCase() : 'SIGN IN REQUIRED'}
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-[16px] text-[#8e9192]">chevron_right</span>
        </button>

        {/* Mesh Status */}
        <div className="p-3 bg-[#171819] rounded-lg flex items-center justify-between border border-[#444748]/20 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${user ? 'bg-white animate-pulse' : 'bg-[#8e9192]'}`}></span>
            <span className="text-[#8e9192] text-[11px]">Mesh Health</span>
          </div>
          <span className="text-white font-medium text-[11px]">{user ? clusterHealth : 'LOCKED'}</span>
        </div>
      </div>
    </aside>
  );
};
