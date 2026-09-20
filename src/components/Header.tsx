import React from 'react';
import { NavigationPath } from '../types';
import { BRAND_LOGO_URL } from '../data/mockData';

interface HeaderProps {
  currentPath: NavigationPath;
  onNavigate: (path: NavigationPath) => void;
  authenticated: boolean;
  onToggleAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPath,
  onNavigate,
  authenticated,
}) => {
  const navItems: { id: NavigationPath; label: string }[] = [
    { id: 'team-workspace', label: 'Team & Workspace' },
    { id: 'connect-agents', label: 'Connect Agents' },
    { id: 'agent-fleet-dashboard', label: 'Fleet Dashboard' },
    { id: 'auth', label: 'Login' },
  ];

  return (
    <header className="fixed top-0 w-full z-50 bg-[#121315]/90 backdrop-blur-xl border-b border-[#444748]/20">
      <div className="h-16 w-full px-6 lg:px-10 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => onNavigate('team-workspace')}
            className="flex items-center gap-3 cursor-pointer group text-left"
          >
            <img
              alt="Interlock Logo"
              className="h-8 w-auto object-contain filter contrast-125 group-hover:opacity-90 transition-opacity"
              src={BRAND_LOGO_URL}
            />
            <span className="font-headline-sm text-lg font-semibold text-white tracking-tight">
              INTERLOCK
            </span>
          </button>
          
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#1b1c1d] rounded-full font-mono text-[10px] text-[#c4c7c8] border border-[#444748]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
            <span>P2P MESH ACTIVE</span>
          </div>
        </div>

        {/* Center Desktop Navigation in the requested order */}
        <div className="flex items-center gap-6 sm:gap-8">
          <nav className="flex items-center gap-2 sm:gap-4">
            {navItems.map((item) => {
              const isActive = currentPath === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#292a2b] text-white font-medium shadow-sm'
                      : 'text-[#c4c7c8] hover:text-white hover:bg-[#1b1c1d]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Node Auth Status Button */}
          <div className="flex items-center pl-4 border-l border-[#444748]/30">
            <button
              onClick={() => onNavigate('auth')}
              title="Inspect Node Authentication"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
                currentPath === 'auth'
                  ? 'bg-white text-[#121315] border-white font-semibold'
                  : 'bg-[#1b1c1d] text-[#e3e2e3] border-[#444748]/30 hover:border-[#8e9192]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {authenticated ? 'verified_user' : 'lock'}
              </span>
              <span className="hidden md:inline">
                {authenticated ? 'NODE AUTH' : 'SIGN IN'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
