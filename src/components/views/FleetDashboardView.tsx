import React, { useState } from 'react';
import { AgentDescriptor, ScopeMatrixRow, WireTraceEvent } from '../../types';

interface FleetDashboardViewProps {
  agents: AgentDescriptor[];
  matrixRows: ScopeMatrixRow[];
  wireTrace: WireTraceEvent[];
  onAddScope: (scope: { module: string; file: string; lockType: 'EXCLUSIVE' | 'SHARED' }) => void;
  onReleaseMatrixRow: (id: string) => void;
  onForceReleaseAgent: (agentId: string) => void;
}

export const FleetDashboardView: React.FC<FleetDashboardViewProps> = ({
  agents,
  matrixRows,
  wireTrace,
  onAddScope,
  onReleaseMatrixRow,
  onForceReleaseAgent,
}) => {
  const [scopeFilter, setScopeFilter] = useState<'all' | 'claimed' | 'intercepted'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);

  // New scope form
  const [newModule, setNewModule] = useState('billing/stripe');
  const [newFile, setNewFile] = useState('src/billing/checkout.ts');
  const [newLockType, setNewLockType] = useState<'EXCLUSIVE' | 'SHARED'>('EXCLUSIVE');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const activeAgents = agents.filter((ag) => ag.status === 'CONNECTED');
  const filteredAgents = activeAgents.filter((ag) => {
    if (scopeFilter === 'claimed') return ag.lockType?.includes('EXCLUSIVE');
    if (scopeFilter === 'intercepted') return ag.lockType?.includes('INTERCEPTED');
    return true;
  });

  return (
    <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col gap-10">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-white text-[#121315] font-medium text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-white">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">
              Step 3 of 3 • Real-Time Monitoring
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl text-white font-semibold tracking-tight">
            Fleet Dashboard
          </h1>
          <p className="text-sm text-[#c4c7c8] mt-1">
            Deterministic AST lock tracking, agent coordination, and zero-collision protection.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Clean Filter Dropdown */}
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as any)}
            className="bg-[#171819] border border-[#444748]/30 text-white font-mono text-xs px-3 py-2.5 rounded-xl focus:outline-none cursor-pointer"
          >
            <option value="all">All Agents ({activeAgents.length})</option>
            <option value="claimed">Exclusive Locks</option>
            <option value="intercepted">Collision Alerts</option>
          </select>

          {/* Claim Scope Button */}
          <button
            onClick={() => setShowClaimModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-[#121315] font-semibold text-xs font-mono rounded-xl hover:bg-[#e2e2e2] transition-colors cursor-pointer shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Claim Scope</span>
          </button>
        </div>
      </div>

      {/* 4 Clean Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <div className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col justify-between shadow-sm">
          <span className="font-mono text-xs text-[#8e9192] uppercase">Active Agents</span>
          <div className="mt-4">
            <span className="text-3xl font-bold text-white tracking-tight">4</span>
            <span className="text-sm text-[#8e9192] font-mono ml-1.5">/ 6 online</span>
          </div>
        </div>

        <div className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col justify-between shadow-sm">
          <span className="font-mono text-xs text-[#8e9192] uppercase">Scopes Claimed</span>
          <div className="mt-4">
            <span className="text-3xl font-bold text-white tracking-tight">3</span>
            <span className="text-sm text-[#8e9192] font-mono ml-1.5">active files</span>
          </div>
        </div>

        <div className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col justify-between shadow-sm">
          <span className="font-mono text-xs text-[#8e9192] uppercase">Collisions Prevented</span>
          <div className="mt-4">
            <span className="text-3xl font-bold text-white tracking-tight">14</span>
            <span className="text-sm text-[#8e9192] font-mono ml-1.5">past 24h</span>
          </div>
        </div>

        <div className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col justify-between shadow-sm">
          <span className="font-mono text-xs text-[#8e9192] uppercase">Tokens Preserved</span>
          <div className="mt-4">
            <span className="text-3xl font-bold text-white tracking-tight">~420k</span>
            <span className="text-sm text-[#8e9192] font-mono ml-1.5">saved</span>
          </div>
        </div>
      </div>

      {/* Live Agent Workstreams (2 Columns, Spacious & Legible) */}
      <div className="flex flex-col gap-5">
        <h2 className="text-lg text-white font-medium">Active Agent Workstreams</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredAgents.map((agent) => {
            const isIntercepted = agent.lockType === 'INTERCEPTED & PAUSED';
            const isExclusive = agent.lockType === 'LOCKING EXCLUSIVE';

            return (
              <div
                key={agent.id}
                className={`p-6 rounded-2xl border flex flex-col justify-between gap-6 shadow-sm ${
                  isIntercepted
                    ? 'bg-[#171819] border-white/40'
                    : 'bg-[#171819] border-[#444748]/25'
                }`}
              >
                <div className="flex flex-col gap-4">
                  {/* Title & Lock Type Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-white">{agent.name}</h3>
                      <p className="text-xs text-[#8e9192] font-mono">Owner: {agent.owner}</p>
                    </div>

                    {isIntercepted ? (
                      <span className="px-3 py-1 bg-white text-[#121315] font-mono text-xs font-bold rounded-full">
                        Collision Intercepted
                      </span>
                    ) : isExclusive ? (
                      <span className="px-3 py-1 bg-white text-[#121315] font-mono text-xs font-semibold rounded-full">
                        Exclusive Lock
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-[#292a2b] text-white font-mono text-xs rounded-full border border-[#444748]/30">
                        Shared Lock
                      </span>
                    )}
                  </div>

                  {/* Target File */}
                  <div className="p-3 bg-[#0d0e0f] rounded-xl border border-[#444748]/20 flex items-center justify-between font-mono text-xs">
                    <span className="text-white truncate">{agent.targetFile}</span>
                    <span className="text-[#8e9192] text-[11px] shrink-0 ml-2">{agent.fileLockType}</span>
                  </div>

                  {/* Directive */}
                  <p className="text-xs sm:text-sm text-[#c4c7c8] leading-relaxed">
                    {agent.directive}
                  </p>
                </div>

                {/* Footer Controls */}
                <div className="pt-4 border-t border-[#444748]/20 flex items-center justify-between">
                  <span className="text-xs text-[#8e9192] font-mono">
                    TTL: {agent.claimTtlRemaining}
                  </span>

                  {isIntercepted ? (
                    <button
                      onClick={() => triggerToast('Agent re-routed to ephemeral branch')}
                      className="px-3.5 py-1.5 bg-white text-[#121315] hover:bg-[#e2e2e2] text-xs font-mono font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Re-route Scope
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        onForceReleaseAgent(agent.id);
                        triggerToast(`Released lock for ${agent.name}`);
                      }}
                      className="px-3.5 py-1.5 bg-[#292a2b] hover:bg-[#38393a] text-white text-xs font-mono rounded-lg transition-colors cursor-pointer border border-[#444748]/30"
                    >
                      Release Lock
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monorepo Scope Allocation Matrix (Clean, Spacious Table) */}
      <div className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-[#444748]/20">
          <h2 className="text-base font-semibold text-white">Monorepo Scope Matrix</h2>
          <span className="text-xs font-mono text-[#8e9192]">{matrixRows.length} active leases</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="text-[#8e9192] border-b border-[#444748]/20">
                <th className="py-3 px-3">Module</th>
                <th className="py-3 px-3">Owner</th>
                <th className="py-3 px-3">Assigned Agent</th>
                <th className="py-3 px-3">File Target</th>
                <th className="py-3 px-3">Lock Type</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#444748]/20 text-[#e3e2e3]">
              {matrixRows.map((row) => (
                <tr key={row.id} className="hover:bg-[#1f2021]/50 transition-colors">
                  <td className="py-3.5 px-3 font-semibold text-white">{row.module}</td>
                  <td className="py-3.5 px-3 text-[#c4c7c8]">{row.owner}</td>
                  <td className="py-3.5 px-3 text-white">{row.assignedAgent}</td>
                  <td className="py-3.5 px-3 text-[#c4c7c8]">{row.fileTarget}</td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        row.lockType === 'EXCLUSIVE'
                          ? 'bg-white text-[#121315]'
                          : 'bg-[#292a2b] text-[#c4c7c8]'
                      }`}
                    >
                      {row.lockType}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <button
                      onClick={() => {
                        onReleaseMatrixRow(row.id);
                        triggerToast(`Released scope on ${row.module}`);
                      }}
                      className="px-3 py-1 bg-[#292a2b] hover:bg-[#343536] text-white rounded text-xs transition-colors cursor-pointer border border-[#444748]/30"
                    >
                      Release
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Claim Scope Modal */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#171819] border border-[#444748] rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between pb-2 border-b border-[#444748]/30">
              <h3 className="text-white font-semibold text-lg">Claim Monorepo Scope</h3>
              <button
                onClick={() => setShowClaimModal(false)}
                className="text-[#8e9192] hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-xs text-[#c4c7c8] leading-relaxed">
              Broadcast an immediate AST write-lock lease to all connected peers.
            </p>

            <div className="flex flex-col gap-4 font-mono text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-[#8e9192] uppercase text-[10px]">Module Path</label>
                <input
                  type="text"
                  value={newModule}
                  onChange={(e) => setNewModule(e.target.value)}
                  className="bg-[#0d0e0f] border border-[#444748]/40 rounded-xl p-3 text-white outline-none focus:border-white"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[#8e9192] uppercase text-[10px]">File Target</label>
                <input
                  type="text"
                  value={newFile}
                  onChange={(e) => setNewFile(e.target.value)}
                  className="bg-[#0d0e0f] border border-[#444748]/40 rounded-xl p-3 text-white outline-none focus:border-white"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[#8e9192] uppercase text-[10px]">Lock Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewLockType('EXCLUSIVE')}
                    className={`py-2.5 rounded-xl cursor-pointer border ${
                      newLockType === 'EXCLUSIVE'
                        ? 'bg-white text-[#121315] border-white font-bold'
                        : 'bg-[#0d0e0f] text-[#c4c7c8] border-[#444748]'
                    }`}
                  >
                    EXCLUSIVE
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewLockType('SHARED')}
                    className={`py-2.5 rounded-xl cursor-pointer border ${
                      newLockType === 'SHARED'
                        ? 'bg-white text-[#121315] border-white font-bold'
                        : 'bg-[#0d0e0f] text-[#c4c7c8] border-[#444748]'
                    }`}
                  >
                    SHARED
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#444748]/30">
              <button
                onClick={() => setShowClaimModal(false)}
                className="px-4 py-2 bg-[#292a2b] text-[#c4c7c8] hover:text-white rounded-xl text-xs font-mono cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onAddScope({ module: newModule, file: newFile, lockType: newLockType });
                  setShowClaimModal(false);
                  triggerToast(`Acquired lease on ${newFile}`);
                }}
                className="px-5 py-2.5 bg-white text-[#121315] font-semibold rounded-xl text-xs font-mono cursor-pointer"
              >
                Broadcast Lease
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
