import React, { useState } from 'react';
import { NavigationPath, AgentDescriptor, ScopeMatrixRow, WireTraceEvent } from './types';
import { INITIAL_AGENTS, INITIAL_MATRIX, INITIAL_WIRE_TRACE } from './data/mockData';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { AuthView } from './components/views/AuthView';
import { TeamWorkspaceView } from './components/views/TeamWorkspaceView';
import { ConnectAgentsView } from './components/views/ConnectAgentsView';
import { FleetDashboardView } from './components/views/FleetDashboardView';
import { AuthProvider, useAuth } from './auth/AuthContext';

/**
 * The workspace shell. It only ever renders behind the sign-in gate below:
 * every view here belongs to a verified Gmail or GitHub identity, and the
 * header/sidebar reflect that session instead of a hard-coded flag.
 */
const Workspace: React.FC = () => {
  const { status, user, signOut } = useAuth();
  const [currentPath, setCurrentPath] = useState<NavigationPath>('team-workspace');
  const [agents, setAgents] = useState<AgentDescriptor[]>(INITIAL_AGENTS);
  const [matrixRows, setMatrixRows] = useState<ScopeMatrixRow[]>(INITIAL_MATRIX);
  const [wireTrace, setWireTrace] = useState<WireTraceEvent[]>(INITIAL_WIRE_TRACE);

  const handleToggleAgentStatus = (agentId: string) => {
    setAgents((prev) =>
      prev.map((ag) => {
        if (ag.id === agentId) {
          const nextStatus = ag.status === 'CONNECTED' ? 'READY TO PAIR' : 'CONNECTED';
          return {
            ...ag,
            status: nextStatus,
            portOrSocket:
              nextStatus === 'CONNECTED'
                ? 'PORT: 8099 // SYNCED'
                : 'PROBE: STANDBY',
            scopedRange:
              nextStatus === 'CONNECTED'
                ? ag.scopedRange || 'packages/common/*'
                : ag.scopedRange
          };
        }
        return ag;
      })
    );
  };

  const handleAddScope = (newScope: { module: string; file: string; lockType: 'EXCLUSIVE' | 'SHARED' }) => {
    const newRow: ScopeMatrixRow = {
      id: 'row-' + Date.now(),
      module: newScope.module,
      owner: user?.name ?? 'Unknown operator',
      assignedAgent: 'Cursor Composer',
      fileTarget: '.../' + newScope.file.split('/').pop(),
      lockType: newScope.lockType,
      timeHeld: '00m 02s'
    };
    setMatrixRows((prev) => [newRow, ...prev]);

    const logEvent: WireTraceEvent = {
      id: 'evt-' + Date.now(),
      timestamp: new Date().toTimeString().split(' ')[0] + '.000',
      type: 'scope.ad_hoc.claim',
      payload: {
        file: newScope.file,
        lock_type: newScope.lockType,
        granted: true,
        claimed_by: user?.id ?? 'unknown'
      },
      severity: 'info'
    };
    setWireTrace((prev) => [logEvent, ...prev]);
  };

  const handleReleaseMatrixRow = (id: string) => {
    setMatrixRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleForceReleaseAgent = (agentId: string) => {
    setAgents((prev) =>
      prev.map((ag) => {
        if (ag.id === agentId) {
          return {
            ...ag,
            lockType: undefined,
            fileLockType: undefined,
            directive: 'Idle standby. AST lock released.',
            tokensPerSec: 0,
            claimTtlRemaining: 'Released'
          };
        }
        return ag;
      })
    );
  };

  // ── Sign-in gate ────────────────────────────────────────────────────────
  // Without a verified session the workspace is unreachable: the only screen on
  // offer is the Gmail / GitHub sign-in surface.
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
    <div className="min-h-screen bg-[#121315] text-[#e3e2e3] font-sans flex flex-col selection:bg-white selection:text-[#121315]">
      {/* Top Fixed Header with exact order: Team & Workspace -> Connect Agents -> Fleet Dashboard */}
      <Header
        currentPath={currentPath}
        onNavigate={setCurrentPath}
        user={user}
        onSignOut={() => void signOut()}
      />

      <div className="flex-1 flex w-full pt-16">
        {/* Left Sidebar (clean workflow flow) */}
        <Sidebar
          currentPath={currentPath}
          onNavigate={setCurrentPath}
          clusterHealth="100% NOMINAL"
          user={user}
        />

        {/* Main Content Area with generous whitespace and breathable padding */}
        <main className="flex-1 w-full min-h-[calc(100vh-4rem)] overflow-y-auto lg:pl-60">
          {currentPath === 'team-workspace' && (
            <TeamWorkspaceView onNavigate={setCurrentPath} />
          )}

          {currentPath === 'connect-agents' && (
            <ConnectAgentsView
              agents={agents}
              onToggleAgentStatus={handleToggleAgentStatus}
              onNavigate={setCurrentPath}
            />
          )}

          {currentPath === 'agent-fleet-dashboard' && (
            <FleetDashboardView
              agents={agents}
              matrixRows={matrixRows}
              wireTrace={wireTrace}
              onAddScope={handleAddScope}
              onReleaseMatrixRow={handleReleaseMatrixRow}
              onForceReleaseAgent={handleForceReleaseAgent}
            />
          )}

          {currentPath === 'auth' && <AuthView onNavigate={setCurrentPath} />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Workspace />
    </AuthProvider>
  );
}
