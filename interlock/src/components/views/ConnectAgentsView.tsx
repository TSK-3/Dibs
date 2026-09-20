// src/components/views/ConnectAgentsView.tsx — Step 2: a REAL agent mesh.
// The roster is live WebSocket presence from the live-interrupt backend; every
// launcher card runs an actual agent client (scripts/agent.mjs) that connects,
// posts an intent, and shows up here within a second.
import React, { useState } from 'react';
import { NavigationPath } from '../../types';
import { useLive } from '../../state/LiveContext';
import { useWorkspace } from '../../state/WorkspaceContext';

interface ConnectAgentsViewProps {
  onNavigate: (path: NavigationPath) => void;
}

const STATUS_STYLES: Record<string, string> = {
  idle: 'text-[#8e9192]',
  connecting: 'text-[#c4c7c8]',
  online: 'text-white',
  offline: 'text-[#ffdad6]',
};

export const ConnectAgentsView: React.FC<ConnectAgentsViewProps> = ({ onNavigate }) => {
  const { activeWorkspace } = useWorkspace();
  const { status, roster, userId } = useLive();
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? '<workspace-id>';
  const connectedCount = roster.length;

  const launchers = [
    {
      id: 'cursor',
      name: 'Cursor / Composer',
      icon: 'edit',
      command: `node scripts/agent.mjs --user cursor-ide --team ${workspaceId} --scope auth --summary "Refactoring token validation middleware"`,
    },
    {
      id: 'claude',
      name: 'Claude Code CLI',
      icon: 'terminal',
      command: `node scripts/agent.mjs --user claude-cli --team ${workspaceId} --scope ml --summary "Running the local verification runner"`,
    },
    {
      id: 'copilot',
      name: 'GitHub Copilot',
      icon: 'smart_toy',
      command: `node scripts/agent.mjs --user copilot-agent --team ${workspaceId} --scope ui --summary "Wiring the interrupt-dismiss flow"`,
    },
    {
      id: 'mcp',
      name: 'Custom MCP / automation',
      icon: 'api',
      command: `node scripts/agent.mjs --user mcp-bot --team ${workspaceId} --scope infra --summary "Nightly dependency scan"`,
    },
  ];

  const copyCommand = (id: string, command: string) => {
    navigator.clipboard.writeText(command).catch(() => {});
    setCopiedCommand(id);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  return (
    <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col gap-10">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 bg-[#292a2b] rounded text-white font-mono text-xs uppercase tracking-wider">
            Step 2 of 3
          </span>
          <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">Agent Fleet Integration</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl text-white font-semibold tracking-tight">Connect Developer Agents</h1>
            <p className="text-sm sm:text-base text-[#c4c7c8] mt-1 max-w-2xl leading-relaxed">
              This console is itself an agent on the live mesh. Launch any client below and it registers on the roster,
              claims scopes, and collides — for real — with everyone else in{' '}
              <span className="font-mono text-white">{activeWorkspace?.name ?? 'the workspace'}</span>.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto px-3.5 py-1.5 bg-[#171819] border border-[#444748]/30 rounded-xl font-mono text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'online' ? 'bg-white animate-pulse' : status === 'offline' ? 'bg-[#93000a]' : 'bg-[#8e9192]'
              }`}
            ></span>
            <span className={STATUS_STYLES[status] ?? 'text-[#8e9192]'}>
              {status === 'online'
                ? `${connectedCount} live on mesh`
                : status === 'connecting'
                  ? 'connecting…'
                  : status === 'offline'
                    ? 'mesh offline'
                    : 'no workspace'}
            </span>
          </div>
        </div>
      </div>

      {/* LIVE roster — real presence from the WebSocket backend */}
      <div className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-[#8e9192] uppercase tracking-wider">Live Roster</span>
          <span className="font-mono text-[10px] text-[#8e9192]">team {workspaceId}</span>
        </div>

        {roster.length === 0 ? (
          <div className="p-4 bg-[#0d0e0f] border border-[#444748]/20 rounded-xl font-mono text-xs text-[#8e9192]">
            {status === 'online'
              ? 'No agents on the mesh yet — launch one of the clients below.'
              : 'Waiting for a live mesh connection…'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {roster.map((agent) => (
              <div
                key={agent.user_id}
                className="p-3 bg-[#0d0e0f] rounded-xl border border-[#444748]/20 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      agent.user_id === userId ? 'bg-white animate-pulse' : 'bg-[#c4c7c8]'
                    }`}
                  ></span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-mono text-white truncate">
                      {agent.user_id}
                      {agent.user_id === userId ? ' (you · this console)' : ''}
                    </span>
                    <span className="text-[10px] font-mono text-[#8e9192]">
                      joined {new Date(agent.connected_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#121315] border border-[#444748]/30 text-[#c4c7c8] shrink-0">
                  {agent.client ?? 'client'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Launchers — real CLI commands */}
      <div className="flex flex-col gap-5">
        <h2 className="text-lg text-white font-medium">Launch a real agent</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {launchers.map((launcher) => (
            <div key={launcher.id} className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#0d0e0f] border border-[#444748]/30 rounded-xl">
                    <span className="material-symbols-outlined text-white text-[20px]">{launcher.icon}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white">{launcher.name}</h3>
                </div>
                <button
                  onClick={() => copyCommand(launcher.id, launcher.command)}
                  className="px-3 py-1.5 bg-[#292a2b] hover:bg-[#343536] text-white text-xs font-mono rounded-lg transition-colors cursor-pointer border border-[#444748]/40"
                >
                  {copiedCommand === launcher.id ? 'Copied!' : 'Copy command'}
                </button>
              </div>
              <code className="block p-3 bg-[#0d0e0f] border border-[#444748]/20 rounded-xl text-[11px] sm:text-xs font-mono text-[#c4c7c8] leading-relaxed break-all select-all">
                {launcher.command}
              </code>
              <p className="text-[11px] text-[#8e9192] font-mono">
                Run from the repo root. The agent claims its scope for real — overlapping claims interrupt both sides.
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Proceed banner */}
      <div className="p-6 bg-[#171819] border border-[#444748]/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
        <div>
          <h3 className="text-base font-semibold text-white">Agent Fleet Ready</h3>
          <p className="text-xs sm:text-sm text-[#c4c7c8] mt-0.5">
            Head to the dashboard to watch live claims, collisions, and interrupts as they happen.
          </p>
        </div>

        <button
          onClick={() => onNavigate('agent-fleet-dashboard')}
          className="w-full sm:w-auto px-6 py-3.5 bg-white text-[#121315] font-semibold text-sm rounded-xl hover:bg-[#e2e2e2] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow"
        >
          <span>Go to Fleet Dashboard</span>
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
};

export default ConnectAgentsView;
