// src/components/views/FleetDashboardView.tsx — Step 3: the live control room.
// Every number, claim, and trace row here comes from the WebSocket backend:
// claims via request_state/interrupts, agent counts via presence, and global
// counters via the backend's /stats metrics endpoint.
import React, { useMemo, useState } from 'react';
import { useLive, LiveClaim } from '../../state/LiveContext';
import { useWorkspace } from '../../state/WorkspaceContext';

interface FleetDashboardViewProps {
  onNavigate?: never; // reserved for future drill-downs
}

const heldFor = (receivedAt?: number) => {
  if (!receivedAt) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - receivedAt) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
};

const counter = (stats: ReturnType<typeof useLive>['stats'], name: string): number => {
  const value = stats?.counters?.[name];
  return typeof value === 'number' ? value : 0;
};

export const FleetDashboardView: React.FC<FleetDashboardViewProps> = () => {
  const { status, roster, claims, trace, stats, claim, release, check, userId } = useLive();
  const { activeWorkspace } = useWorkspace();
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [newScope, setNewScope] = useState('auth');
  const [newSummary, setNewSummary] = useState('');
  const [newRationale, setNewRationale] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const visibleClaims = useMemo(
    () => (filter === 'mine' ? claims.filter((c) => c.user_id === userId) : claims),
    [claims, filter, userId],
  );

  // Group claims by scope so a scope held by multiple agents reads as SHARED.
  const matrixRows = useMemo(() => {
    const byScope = new Map<string, LiveClaim[]>();
    for (const c of claims) {
      const list = byScope.get(c.scope) ?? [];
      list.push(c);
      byScope.set(c.scope, list);
    }
    return [...byScope.entries()].map(([scope, holders]) => ({
      scope,
      holders,
      lockType: holders.length > 1 ? 'SHARED' : 'EXCLUSIVE',
    }));
  }, [claims]);

  const statsCards = [
    { label: 'Agents Online', value: String(roster.length), suffix: status === 'online' ? 'live mesh' : status },
    { label: 'Active Claims', value: String(claims.length), suffix: 'held scopes' },
    { label: 'Conflicts Detected', value: String(counter(stats, 'conflicts_detected_total')), suffix: 'collisions' },
    { label: 'Interrupts Sent', value: String(counter(stats, 'interrupts_sent_total')), suffix: 'real-time pings' },
  ];

  const handleBroadcast = () => {
    const scope = newScope.trim().toLowerCase();
    if (!scope) return triggerToast('Enter a scope to claim.');
    if (!newSummary.trim()) return triggerToast('Add a short summary of the intent.');
    claim(scope, newSummary.trim(), newRationale.trim());
    setShowClaimModal(false);
    setNewSummary('');
    setNewRationale('');
    triggerToast(`Broadcasting intent on "${scope}"…`);
  };

  return (
    <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col gap-10">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-white text-[#121315] font-medium text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-white">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">
              Step 3 of 3 · Live Monitoring — {activeWorkspace?.name ?? ''}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl text-white font-semibold tracking-tight">Fleet Dashboard</h1>
          <p className="text-sm text-[#c4c7c8] mt-1">
            Real claims, real collisions, real interrupts — straight from the WebSocket backend.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'mine')}
            className="bg-[#171819] border border-[#444748]/30 text-white font-mono text-xs px-3 py-2.5 rounded-xl focus:outline-none cursor-pointer"
          >
            <option value="all">All claims ({claims.length})</option>
            <option value="mine">My claims</option>
          </select>

          <button
            onClick={() => setShowClaimModal(true)}
            disabled={status !== 'online'}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-[#121315] font-semibold text-xs font-mono rounded-xl hover:bg-[#e2e2e2] transition-colors cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Claim Scope</span>
          </button>
        </div>
      </div>

      {/* Real metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {statsCards.map((card) => (
          <div key={card.label} className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col justify-between shadow-sm">
            <span className="font-mono text-xs text-[#8e9192] uppercase">{card.label}</span>
            <div className="mt-4">
              <span className="text-3xl font-bold text-white tracking-tight">{card.value}</span>
              <span className="text-sm text-[#8e9192] font-mono ml-1.5">{card.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Scope matrix — live team claims */}
      <div className="p-6 bg-[#171819] border border-[#444748]/25 rounded-2xl flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-[#444748]/20">
          <h2 className="text-base font-semibold text-white">Scope Matrix</h2>
          <span className="text-xs font-mono text-[#8e9192]">{matrixRows.length} active scope(s)</span>
        </div>

        {visibleClaims.length === 0 ? (
          <div className="p-4 bg-[#0d0e0f] border border-[#444748]/20 rounded-xl font-mono text-xs text-[#8e9192]">
            {status === 'online'
              ? 'No claims held yet — hit "Claim Scope" or launch an agent.'
              : 'Waiting for a live mesh connection…'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="text-[#8e9192] border-b border-[#444748]/20">
                  <th className="py-3 px-3">Scope</th>
                  <th className="py-3 px-3">Holder</th>
                  <th className="py-3 px-3">Intent</th>
                  <th className="py-3 px-3">Lock</th>
                  <th className="py-3 px-3">Held</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#444748]/20 text-[#e3e2e3]">
                {visibleClaims.map((row) => {
                  const mine = row.user_id === userId;
                  return (
                    <tr key={`${row.scope}::${row.user_id}`} className="hover:bg-[#1f2021]/50 transition-colors">
                      <td className="py-3.5 px-3 font-semibold text-white">{row.scope}</td>
                      <td className="py-3.5 px-3 text-[#c4c7c8]">
                        {row.user_id}
                        {mine ? ' (you)' : ''}
                      </td>
                      <td className="py-3.5 px-3 text-[#c4c7c8] max-w-[240px] truncate">{row.summary}</td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            mine ? 'bg-white text-[#121315]' : 'bg-[#292a2b] text-[#c4c7c8]'
                          }`}
                        >
                          {mine ? 'MINE' : 'HELD'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-[#8e9192]">{heldFor(row.received_at)}</td>
                      <td className="py-3.5 px-3 text-right">
                        {mine ? (
                          <button
                            onClick={() => {
                              release(row.scope);
                              triggerToast(`Releasing ${row.scope}…`);
                            }}
                            className="px-3 py-1 bg-[#292a2b] hover:bg-[#343536] text-white rounded text-xs transition-colors cursor-pointer border border-[#444748]/30"
                          >
                            Release
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              check(row.scope);
                              triggerToast(`Inspecting ${row.scope} — holders listed in the trace.`);
                            }}
                            className="px-3 py-1 bg-[#292a2b] hover:bg-[#343536] text-[#c4c7c8] rounded text-xs transition-colors cursor-pointer border border-[#444748]/30"
                          >
                            Inspect
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live wire trace */}
      <div className="p-6 bg-[#0d0e0f] border border-[#444748]/25 rounded-2xl flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-[#444748]/20">
          <h2 className="text-base font-semibold text-white">Wire Trace</h2>
          <span className="font-mono text-[10px] text-[#8e9192]">newest first · {trace.length} event(s)</span>
        </div>
        <div className="flex flex-col max-h-80 overflow-y-auto">
          {trace.length === 0 ? (
            <span className="py-4 text-center font-mono text-xs text-[#8e9192]">No traffic yet.</span>
          ) : (
            trace.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 py-1.5 font-mono text-[11px]">
                <span className="text-[#8e9192] shrink-0">{entry.at}</span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded ${
                    entry.severity === 'crit'
                      ? 'bg-[#93000a]/40 text-[#ffdad6]'
                      : entry.severity === 'warn'
                        ? 'bg-[#93000a]/20 text-[#ffb4ab]'
                        : 'bg-[#292a2b] text-[#c4c7c8]'
                  }`}
                >
                  {entry.type}
                </span>
                <span className="text-[#c4c7c8] truncate">
                  {entry.type === 'interrupt'
                    ? `${entry.payload.from_user ?? '?'} → ${entry.payload.message ?? ''}`
                    : entry.type === 'ack'
                      ? `claimed ${entry.payload.scope ?? ''}`
                      : entry.type === 'scope_status'
                        ? `${String(entry.payload.scope ?? '')} ${
                            entry.payload.available
                              ? 'available'
                              : `held by ${Array.isArray(entry.payload.claimed_by_others) ? (entry.payload.claimed_by_others as string[]).join(', ') : 'others'}`
                          }`
                        : JSON.stringify(entry.payload).slice(0, 120)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Claim modal — real post_intent */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#171819] border border-[#444748] rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between pb-2 border-b border-[#444748]/30">
              <h3 className="text-white font-semibold text-lg">Claim a Scope</h3>
              <button onClick={() => setShowClaimModal(false)} className="text-[#8e9192] hover:text-white cursor-pointer">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-xs text-[#c4c7c8] leading-relaxed">
              Publishes a real <span className="font-mono">post_intent</span> on the mesh. If someone already holds an
              overlapping scope, BOTH sides get an interrupt immediately.
            </p>

            <div className="flex flex-col gap-4 font-mono text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-[#8e9192] uppercase text-[10px]">Scope (module or module/file)</label>
                <input
                  type="text"
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                  placeholder="auth or auth/login.tsx"
                  className="bg-[#0d0e0f] border border-[#444748]/40 rounded-xl p-3 text-white outline-none focus:border-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[#8e9192] uppercase text-[10px]">Summary</label>
                <input
                  type="text"
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder="Refactor token validation"
                  className="bg-[#0d0e0f] border border-[#444748]/40 rounded-xl p-3 text-white outline-none focus:border-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[#8e9192] uppercase text-[10px]">Rationale (optional)</label>
                <input
                  type="text"
                  value={newRationale}
                  onChange={(e) => setNewRationale(e.target.value)}
                  placeholder="Simplify the authorization flow"
                  className="bg-[#0d0e0f] border border-[#444748]/40 rounded-xl p-3 text-white outline-none focus:border-white"
                />
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
                onClick={handleBroadcast}
                className="px-5 py-2.5 bg-white text-[#121315] font-semibold rounded-xl text-xs font-mono cursor-pointer"
              >
                Broadcast Intent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetDashboardView;
