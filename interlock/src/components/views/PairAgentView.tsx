// src/components/views/PairAgentView.tsx — Step 3: pair a REAL coding agent.
// Shows this user's pairing token for the active workspace, formatted as the
// exact MCP config block to paste into Cursor / Claude Code, with copy and
// regenerate actions. The token is the auth — no login ever happens inside the
// agent; every tool call resolves back to this user + workspace server-side.
import React, { useCallback, useEffect, useState } from 'react';
import { NavigationPath } from '../../types';
import { useWorkspace } from '../../state/WorkspaceContext';
import { Pairing, getPairing, regeneratePairing } from '../../lib/pairingClient';
import { describeApiError } from '../../lib/apiClient';

interface PairAgentViewProps {
  onNavigate: (path: NavigationPath) => void;
}

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API can be unavailable (http origins, permissions) — fall back
    // to the legacy execCommand path so the button still works.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
};

const formatWhen = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

const CopyButton: React.FC<{ label: string; getText: () => string; className?: string }> = ({ label, getText, className }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (await copyToClipboard(getText())) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <button
      onClick={() => void handleCopy()}
      className={className ?? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#121315] font-semibold text-xs hover:bg-[#e2e2e2] transition-colors cursor-pointer shadow'}
    >
      <span className="material-symbols-outlined text-[16px]">{copied ? 'check' : 'content_copy'}</span>
      <span>{copied ? 'Copied!' : label}</span>
    </button>
  );
};

export const PairAgentView: React.FC<PairAgentViewProps> = ({ onNavigate }) => {
  const { activeWorkspace } = useWorkspace();
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const workspaceId = activeWorkspace?.id ?? null;

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setPairing(await getPairing(id));
    } catch (err) {
      setError(describeApiError(err));
      setPairing(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workspaceId) void load(workspaceId);
  }, [workspaceId, load]);

  const handleRegenerate = async () => {
    if (!workspaceId || !pairing) return;
    if (!window.confirm('Regenerate the pairing token? Every agent still using the old token loses access immediately.')) return;
    setRegenerating(true);
    setError(null);
    try {
      setPairing(await regeneratePairing(workspaceId));
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setRegenerating(false);
    }
  };

  // ── No workspace: pairing is meaningless without a team to post into ────
  if (!activeWorkspace) {
    return (
      <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col items-center gap-6 text-center">
        <span className="material-symbols-outlined text-[40px] text-[#8e9192]">key_off</span>
        <h1 className="text-2xl text-white font-semibold">No workspace selected</h1>
        <p className="text-sm text-[#c4c7c8] max-w-md leading-relaxed">
          A pairing token is bound to one workspace — it is what lets your coding agent post claims as you. Set up a
          workspace first.
        </p>
        <button
          onClick={() => onNavigate('team-workspace')}
          className="px-6 py-3 bg-white text-[#121315] font-semibold text-sm rounded-xl hover:bg-[#e2e2e2] transition-colors cursor-pointer shadow"
        >
          Set up a workspace
        </button>
      </div>
    );
  }

  const configText = pairing ? JSON.stringify(pairing.config, null, 2) : '';

  return (
    <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col gap-8">
      {/* HEADER */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">Step 3 of 4 · Agent Pairing</span>
        <h1 className="text-3xl text-white font-semibold tracking-tight">Pair Your Coding Agent</h1>
        <p className="text-sm text-[#c4c7c8] max-w-2xl leading-relaxed">
          Connect the AI agent you actually work with — Cursor, Claude Code, any MCP client — to{' '}
          <span className="text-white font-medium">{activeWorkspace.name}</span>. Paste the config block below into its
          MCP server settings. The token is the credential: it resolves to{' '}
          <span className="font-mono text-[12px] text-white">you + this workspace</span>, so the agent never logs in and
          never passes identity — every intent it posts is attributed to you automatically.
        </p>
      </div>

      {error ? (
        <div role="alert" className="px-4 py-3 rounded-xl border border-[#ffb4ab]/40 bg-[#93000a]/15 text-[#ffdad6] text-xs leading-relaxed">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="font-mono text-xs uppercase tracking-widest text-[#8e9192] animate-pulse">Loading pairing token…</span>
        </div>
      ) : pairing ? (
        <>
          {/* CARD 1: THE MCP CONFIG BLOCK */}
          <div className="bg-[#171819] border border-[#444748]/25 rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">1 · Paste into your agent</span>
                <h2 className="text-xl text-white font-semibold mt-1">MCP Server Config</h2>
              </div>
              <CopyButton label="Copy config" getText={() => configText} />
            </div>

            <pre className="bg-[#0d0e0f] border border-[#444748]/40 rounded-xl p-4 overflow-x-auto text-[12.5px] leading-relaxed font-mono text-[#e3e2e3]">
              {configText}
            </pre>

            <div className="flex flex-col gap-2 text-xs text-[#c4c7c8] leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#8e9192]">terminal</span>
                <span>
                  <span className="text-white font-medium">Cursor:</span> paste into{' '}
                  <code className="font-mono text-[11px] bg-[#0d0e0f] px-1.5 py-0.5 rounded">~/.cursor/mcp.json</code>{' '}
                  (or the project's <code className="font-mono text-[11px] bg-[#0d0e0f] px-1.5 py-0.5 rounded">.cursor/mcp.json</code>),
                  then reload MCP servers.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#8e9192]">terminal</span>
                <span>
                  <span className="text-white font-medium">Claude Code:</span> add the same entry to the{' '}
                  <code className="font-mono text-[11px] bg-[#0d0e0f] px-1.5 py-0.5 rounded">mcpServers</code> section of
                  your MCP settings.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#8e9192]">bolt</span>
                <span>
                  Once connected, the agent gets three tools —{' '}
                  <code className="font-mono text-[11px] bg-[#0d0e0f] px-1.5 py-0.5 rounded">post_intent</code>,{' '}
                  <code className="font-mono text-[11px] bg-[#0d0e0f] px-1.5 py-0.5 rounded">check_intent</code>,{' '}
                  <code className="font-mono text-[11px] bg-[#0d0e0f] px-1.5 py-0.5 rounded">complete_intent</code> — all
                  attributed to you.
                </span>
              </div>
            </div>
          </div>

          {/* CARD 2: THE TOKEN ITSELF + SAFETY */}
          <div className="bg-[#171819] border border-[#444748]/25 rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">2 · The credential</span>
                <h2 className="text-xl text-white font-semibold mt-1">Pairing Token</h2>
                <p className="text-xs sm:text-sm text-[#c4c7c8] mt-1.5 leading-relaxed max-w-xl">
                  Treat this like an API key — anyone holding it can post intents as you. It never expires, but you can
                  invalidate it instantly by regenerating.
                </p>
              </div>
              <CopyButton label="Copy token" getText={() => pairing.token} />
            </div>

            <div className="bg-[#0d0e0f] border border-[#444748]/40 rounded-xl p-4 font-mono text-[12.5px] text-[#e3e2e3] break-all">
              {pairing.token}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[10px] text-[#8e9192] uppercase tracking-wider">
              <div className="bg-[#121315] border border-[#444748]/25 rounded-lg p-3">
                <div>Issued</div>
                <div className="text-[#e3e2e3] normal-case tracking-normal mt-1">{formatWhen(pairing.meta?.createdAt) ?? '—'}</div>
              </div>
              <div className="bg-[#121315] border border-[#444748]/25 rounded-lg p-3">
                <div>Last rotated</div>
                <div className="text-[#e3e2e3] normal-case tracking-normal mt-1">{formatWhen(pairing.meta?.rotatedAt) ?? 'never'}</div>
              </div>
              <div className="bg-[#121315] border border-[#444748]/25 rounded-lg p-3">
                <div>Last used by an agent</div>
                <div className="text-[#e3e2e3] normal-case tracking-normal mt-1">{formatWhen(pairing.meta?.lastUsedAt) ?? 'never'}</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <button
                onClick={() => void handleRegenerate()}
                disabled={regenerating}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#292a2b] hover:bg-[#343536] border border-[#444748]/40 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>{regenerating ? 'Regenerating…' : 'Regenerate token'}</span>
              </button>
              <span className="text-xs text-[#8e9192] leading-relaxed">
                The old token stops working immediately — anything still configured with it gets rejected on its next
                tool call.
              </span>
            </div>
          </div>

          {/* NEXT STEP */}
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-xs text-[#8e9192]">
              Agent paired? Watch it appear on the roster the moment it posts its first intent.
            </p>
            <button
              onClick={() => onNavigate('agent-fleet-dashboard')}
              className="flex items-center gap-2 px-6 py-3 bg-white text-[#121315] font-semibold text-sm rounded-xl hover:bg-[#e2e2e2] transition-colors cursor-pointer shadow"
            >
              <span>Open Fleet Dashboard</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default PairAgentView;
