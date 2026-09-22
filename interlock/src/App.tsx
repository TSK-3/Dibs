// src/App.tsx — the workspace shell.
//
// Providers, outside-in: AuthProvider (who is signed in) → WorkspaceProvider
// (which workspace is active) → LiveProvider (the live agent mesh socket).
// Every view consumes those contexts directly — there is no mock state anywhere
// in this file, and Connect Agents / Fleet Dashboard are gated on an active
// workspace because they are meaningless without one.
import React, { useState } from 'react';
import { NavigationPath } from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { AuthView } from './components/views/AuthView';
import { TeamWorkspaceView } from './components/views/TeamWorkspaceView';
import { ConnectAgentsView } from './components/views/ConnectAgentsView';
import { PairAgentView } from './components/views/PairAgentView';
import { FleetDashboardView } from './components/views/FleetDashboardView';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { WorkspaceProvider, useWorkspace } from './state/WorkspaceContext';
import { LiveProvider, useLive } from './state/LiveContext';

/** The signed-in shell: header, sidebar, and the routed main surface. */
const WorkspaceShell: React.FC = () => {
  const { user, signOut } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { status: liveStatus } = useLive();
  const [currentPath, setCurrentPath] = useState<NavigationPath>('team-workspace');

  return (
    <div className="min-h-screen bg-[#121315] text-[#e3e2e3] font-sans flex flex-col selection:bg-white selection:text-[#121315]">
      <Header
        currentPath={currentPath}
        onNavigate={setCurrentPath}
        user={user}
        onSignOut={() => void signOut()}
      />

      <div className="flex-1 flex w-full pt-16">
        <Sidebar
          currentPath={currentPath}
          onNavigate={setCurrentPath}
          clusterHealth={liveStatus === 'online' ? 'LIVE MESH' : liveStatus === 'connecting' ? 'SYNCING…' : 'OFFLINE'}
          user={user}
        />

        <main className="flex-1 w-full min-h-[calc(100vh-4rem)] overflow-y-auto lg:pl-60">
          {currentPath === 'team-workspace' && <TeamWorkspaceView onNavigate={setCurrentPath} />}

          {currentPath === 'connect-agents' &&
            (activeWorkspace ? (
              <ConnectAgentsView onNavigate={setCurrentPath} />
            ) : (
              <WorkspaceRequired onNavigate={setCurrentPath} />
            ))}

          {currentPath === 'pair-agent' &&
            (activeWorkspace ? (
              <PairAgentView onNavigate={setCurrentPath} />
            ) : (
              <WorkspaceRequired onNavigate={setCurrentPath} />
            ))}

          {currentPath === 'agent-fleet-dashboard' &&
            (activeWorkspace ? <FleetDashboardView /> : <WorkspaceRequired onNavigate={setCurrentPath} />)}

          {currentPath === 'auth' && <AuthView onNavigate={setCurrentPath} />}
        </main>
      </div>
    </div>
  );
};

/** Shown when Connect Agents / Fleet Dashboard is opened with no workspace. */
const WorkspaceRequired: React.FC<{ onNavigate: (path: NavigationPath) => void }> = ({ onNavigate }) => (
  <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col items-center gap-6 text-center">
    <span className="material-symbols-outlined text-[40px] text-[#8e9192]">meeting_room</span>
    <h1 className="text-2xl text-white font-semibold">No workspace selected</h1>
    <p className="text-sm text-[#c4c7c8] max-w-md leading-relaxed">
      Agents, claims, and collisions live inside a workspace. Create one (bound to one of your GitHub repositories) or
      join a teammate's with an invite code first.
    </p>
    <button
      onClick={() => onNavigate('team-workspace')}
      className="px-6 py-3 bg-white text-[#121315] font-semibold text-sm rounded-xl hover:bg-[#e2e2e2] transition-colors cursor-pointer shadow"
    >
      Set up a workspace
    </button>
  </div>
);

/** Loading screen while the session is being probed on first paint. */
const SessionLoading: React.FC = () => (
  <div className="min-h-screen bg-[#121315] text-[#8e9192] font-sans flex items-center justify-center">
    <span className="font-mono text-xs uppercase tracking-widest animate-pulse">Checking session…</span>
  </div>
);

const Workspace: React.FC = () => {
  const { status, user } = useAuth();
  const [currentPath, setCurrentPath] = useState<NavigationPath>('team-workspace');

  // ── Sign-in gate ────────────────────────────────────────────────────────
  // Without a verified session the workspace is unreachable: the only screen on
  // offer is the Gmail / GitHub sign-in surface.
  if (status === 'loading') return <SessionLoading />;

  if (status !== 'authenticated' || !user) {
    return (
      <div className="min-h-screen bg-[#121315] text-[#e3e2e3] font-sans flex flex-col selection:bg-white selection:text-[#121315]">
        <Header currentPath="auth" onNavigate={setCurrentPath} user={null} />
        <div className="flex-1 flex w-full pt-16">
          <main className="flex-1 w-full min-h-[calc(100vh-4rem)] overflow-y-auto">
            <AuthView onNavigate={setCurrentPath} />
          </main>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider>
      <LiveProvider user={user}>
        <WorkspaceShell />
      </LiveProvider>
    </WorkspaceProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Workspace />
    </AuthProvider>
  );
}
