import React, { useState } from 'react';
import { NavigationPath, AgentDescriptor } from '../../types';

interface ConnectAgentsViewProps {
  agents: AgentDescriptor[];
  onToggleAgentStatus: (agentId: string) => void;
  onNavigate: (path: NavigationPath) => void;
}

export const ConnectAgentsView: React.FC<ConnectAgentsViewProps> = ({
  agents,
  onToggleAgentStatus,
  onNavigate,
}) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const cliSnippet =
    'curl -fsSL https://interlock.sh/install.sh | bash && interlock connect --team 794218';

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(cliSnippet).catch(() => {});
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleConnect = (agentId: string) => {
    setConnectingId(agentId);
    setTimeout(() => {
      onToggleAgentStatus(agentId);
      setConnectingId(null);
    }, 500);
  };

  const connectedCount = agents.filter((a) => a.status === 'CONNECTED').length;

  return (
    <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col gap-10">
      {/* Clean Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 bg-[#292a2b] rounded text-white font-mono text-xs uppercase tracking-wider">
            Step 2 of 3
          </span>
          <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">
            Agent Fleet Integration
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl text-white font-semibold tracking-tight">
              Connect Developer Agents
            </h1>
            <p className="text-sm sm:text-base text-[#c4c7c8] mt-1 max-w-2xl leading-relaxed">
              Link your local coding tools so they automatically register file and AST locks before writing code.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto px-3.5 py-1.5 bg-[#171819] border border-[#444748]/30 rounded-xl font-mono text-xs text-white">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span>{connectedCount} of {agents.length} Connected</span>
          </div>
        </div>
      </div>

      {/* Fast CLI Connect Banner */}
      <div className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono text-[#8e9192] uppercase tracking-wider">
            Terminal Quick Connect
          </span>
          <code className="text-xs sm:text-sm font-mono text-white select-all">
            {cliSnippet}
          </code>
        </div>
        <button
          onClick={handleCopyCmd}
          className="self-start sm:self-auto px-4 py-2.5 bg-[#292a2b] hover:bg-[#343536] text-white rounded-xl text-xs font-mono transition-colors flex items-center gap-2 cursor-pointer border border-[#444748]/40"
        >
          <span className="material-symbols-outlined text-[16px]">content_copy</span>
          <span>{copySuccess ? 'Copied!' : 'Copy Command'}</span>
        </button>
      </div>

      {/* Agents Grid (2 Columns, Spacious & Clean) */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg text-white font-medium">Available Connectors</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {agents.map((agent) => {
            const isConnected = agent.status === 'CONNECTED';
            const isConnecting = connectingId === agent.id;

            return (
              <div
                key={agent.id}
                className={`p-6 rounded-2xl border transition-all flex flex-col justify-between gap-6 ${
                  isConnected
                    ? 'bg-[#171819] border-[#444748]/30'
                    : 'bg-[#121315] border-[#444748]/20 opacity-80 hover:opacity-100'
                }`}
              >
                <div className="flex flex-col gap-4">
                  {/* Top: Icon, Name, Status Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isConnected
                            ? 'bg-white text-[#121315]'
                            : 'bg-[#292a2b] text-[#c4c7c8]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {agent.name.includes('Cursor')
                            ? 'terminal'
                            : agent.name.includes('Claude')
                            ? 'psychology'
                            : agent.name.includes('Copilot')
                            ? 'smart_toy'
                            : agent.name.includes('MCP')
                            ? 'memory'
                            : 'code'}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white">{agent.name}</h3>
                        <p className="text-xs text-[#8e9192] font-mono">{agent.clientType}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-medium ${
                        isConnected
                          ? 'bg-[#292a2b] text-white border border-[#444748]/40'
                          : 'bg-[#1b1c1d] text-[#8e9192]'
                      }`}
                    >
                      {isConnected ? 'Active' : 'Standby'}
                    </span>
                  </div>

                  {/* Scoped Range or Description */}
                  <div className="p-3 bg-[#0d0e0f] rounded-xl border border-[#444748]/20 flex flex-col gap-1 font-mono text-xs">
                    <span className="text-[10px] text-[#8e9192] uppercase">Scope Target</span>
                    <span className="text-white truncate">
                      {agent.scopedRange || 'packages/common/*'}
                    </span>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="flex items-center justify-between pt-2 border-t border-[#444748]/20">
                  <span className="text-xs text-[#8e9192] font-mono">
                    {isConnected ? agent.hostMachine : 'Ready to pair'}
                  </span>

                  {isConnected ? (
                    <button
                      onClick={() => onToggleAgentStatus(agent.id)}
                      className="px-3.5 py-1.5 bg-[#292a2b] hover:bg-[#38393a] text-white text-xs font-mono rounded-lg transition-colors cursor-pointer border border-[#444748]/40"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(agent.id)}
                      disabled={isConnecting}
                      className="px-4 py-1.5 bg-white hover:bg-[#e2e2e2] text-[#121315] text-xs font-mono font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isConnecting ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proceed Banner */}
      <div className="p-6 bg-[#171819] border border-[#444748]/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
        <div>
          <h3 className="text-base font-semibold text-white">Agent Fleet Ready</h3>
          <p className="text-xs sm:text-sm text-[#c4c7c8] mt-0.5">
            Proceed to the dashboard to monitor live lock acquisitions and collision prevention.
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
