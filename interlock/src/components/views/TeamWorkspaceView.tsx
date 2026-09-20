// src/components/views/TeamWorkspaceView.tsx — Step 1: create a workspace bound
// to one of your REAL GitHub repositories, or join one with a 6-digit invite
// code verified server-side. Everything here talks to the identity service.
import React, { useState } from 'react';
import { NavigationPath } from '../../types';
import { RepoSummary } from '../../lib/githubClient';
import { useAuth } from '../../auth/AuthContext';
import { useWorkspace } from '../../state/WorkspaceContext';
import { RepoSelect } from './RepoSelect';

interface TeamWorkspaceViewProps {
  onNavigate: (path: NavigationPath) => void;
}

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

export const TeamWorkspaceView: React.FC<TeamWorkspaceViewProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { activeWorkspace, workspaces, create, join, select, regenerateInvite, remove, busy } = useWorkspace();
  const [name, setName] = useState('');
  const [repo, setRepo] = useState<RepoSummary | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const [joinCode, setJoinCode] = useState<string[]>(['', '', '', '', '', '']);
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinCodeValue = joinCode.join('');

  const handleCreate = async () => {
    setCreateError(null);
    if (!name.trim()) return setCreateError('Give the workspace a name first.');
    if (!repo) return setCreateError('Pick one of your GitHub repositories to bind.');
    try {
      const { workspace, inviteCode } = await create({
        name: name.trim(),
        repo: {
          fullName: repo.fullName,
          private: repo.private,
          defaultBranch: repo.defaultBranch,
          htmlUrl: repo.htmlUrl,
        },
      });
      setRevealedCode(inviteCode);
      void workspace;
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the workspace.');
    }
  };

  const handleJoinDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...joinCode];
    next[index] = digit;
    setJoinCode(next);
    setJoinError(null);
    if (digit && index < 5) {
      const inputs = document.querySelectorAll<HTMLInputElement>('input[data-join-digit]');
      inputs[index + 1]?.focus();
    }
  };

  const handleJoin = async () => {
    setJoinError(null);
    if (joinCodeValue.length !== 6) return setJoinError('Enter the full 6-digit invite code.');
    try {
      await join(joinCodeValue);
      setJoinCode(['', '', '', '', '', '']);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join that workspace.');
    }
  };

  const handleRegenerate = async () => {
    if (!activeWorkspace) return;
    try {
      setRevealedCode(await regenerateInvite(activeWorkspace.id));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not rotate the invite code.');
    }
  };

  const handleDelete = async () => {
    if (!activeWorkspace) return;
    if (!window.confirm(`Delete workspace "${activeWorkspace.name}"? Members lose access immediately.`)) return;
    try {
      await remove(activeWorkspace.id);
      setRevealedCode(null);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not delete the workspace.');
    }
  };

  const copyCode = () => {
    if (!revealedCode) return;
    navigator.clipboard.writeText(revealedCode).catch(() => {});
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  // ── Active workspace: real overview card ─────────────────────────────────
  if (activeWorkspace) {
    const isOwner = user?.id === activeWorkspace.ownerUserId;
    return (
      <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-[#292a2b] rounded text-white font-mono text-xs uppercase tracking-wider">
              Step 1 of 3
            </span>
            <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">
              Organization &amp; Workspace Setup
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl text-white font-semibold tracking-tight">{activeWorkspace.name}</h1>
          <p className="text-sm sm:text-base text-[#c4c7c8] max-w-2xl leading-relaxed">
            Bound to <span className="font-mono text-white">{activeWorkspace.repo.fullName}</span> — invites are verified
            server-side, and every member shares this workspace's live agent mesh.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Workspace card */}
          <div className="bg-[#171819] border border-[#444748]/25 rounded-2xl p-8 flex flex-col justify-between shadow-xl">
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">Workspace</span>
                  <h2 className="text-xl text-white font-semibold">{activeWorkspace.name}</h2>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#0d0e0f] border border-[#444748]/30 font-mono text-[10px] text-[#8e9192]">
                  {activeWorkspace.repo.private ? 'PRIVATE REPO' : 'PUBLIC REPO'}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] text-[#8e9192] uppercase">Repository</span>
                <div className="p-3 bg-[#0d0e0f] border border-[#444748]/20 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-white font-mono truncate">{activeWorkspace.repo.fullName}</span>
                    {activeWorkspace.repo.defaultBranch ? (
                      <span className="text-[10px] text-[#8e9192] font-mono">
                        default: {activeWorkspace.repo.defaultBranch}
                      </span>
                    ) : null}
                  </div>
                  {activeWorkspace.repo.htmlUrl ? (
                    <a
                      href={activeWorkspace.repo.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[#292a2b] hover:bg-[#343536] text-white text-xs font-mono border border-[#444748]/40 transition-colors cursor-pointer"
                    >
                      Open ↗
                    </a>
                  ) : null}
                </div>
              </div>

              {/* Real members */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] text-[#8e9192] uppercase">
                  Members ({activeWorkspace.members.length}) — verified identities
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeWorkspace.members.map((member) => (
                    <div
                      key={member.userId}
                      className="p-2.5 bg-[#0d0e0f] rounded-lg border border-[#444748]/20 flex items-center gap-2.5"
                    >
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-full object-cover border border-[#444748]/40"
                        />
                      ) : (
                        <span className="w-7 h-7 rounded-full bg-[#292a2b] border border-[#444748]/40 flex items-center justify-center text-[10px] font-semibold text-white">
                          {member.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-white truncate">
                          {member.name}
                          {member.userId === activeWorkspace.ownerUserId ? ' · owner' : ''}
                          {member.userId === user?.id ? ' · you' : ''}
                        </span>
                        <span className="text-[10px] text-[#8e9192] font-mono truncate">
                          {member.username ?? member.provider}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {workspaces.length > 1 ? (
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] text-[#8e9192] uppercase">
                    Your other workspaces ({workspaces.length - 1})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {workspaces
                      .filter((w) => w.id !== activeWorkspace.id)
                      .map((w) => (
                        <button
                          key={w.id}
                          onClick={() => select(w.id)}
                          className="px-3 py-1.5 rounded-lg bg-[#0d0e0f] border border-[#444748]/30 text-[#c4c7c8] hover:text-white hover:border-[#8e9192] text-xs font-mono transition-colors cursor-pointer"
                        >
                          {w.name}
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="pt-8 flex flex-col gap-2">
              {isOwner ? (
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="w-full py-2.5 rounded-xl border border-[#93000a]/50 text-[#ffdad6] hover:bg-[#93000a]/20 text-xs font-mono transition-colors cursor-pointer disabled:opacity-50"
                >
                  Delete workspace
                </button>
              ) : null}
              <button
                onClick={() => onNavigate('connect-agents')}
                className="w-full flex items-center justify-center gap-2 py-4 bg-white hover:bg-[#e2e2e2] text-[#121315] font-semibold text-sm rounded-xl transition-all shadow-md cursor-pointer"
              >
                <span>Connect Agents</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </div>

          {/* Invite code card */}
          <div className="bg-[#171819] border border-[#444748]/25 rounded-2xl p-8 flex flex-col justify-between shadow-xl">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">Invite Code</span>
                <h2 className="text-xl text-white font-semibold">Bring teammates in</h2>
                <p className="text-xs sm:text-sm text-[#c4c7c8] mt-1 leading-relaxed">
                  The 6-digit code is generated server-side and only ever shown once. Rotate it any time — the old code
                  stops working immediately.
                </p>
              </div>

              {revealedCode ? (
                <div className="flex items-center justify-between bg-[#0d0e0f] border border-white/30 px-5 py-4 rounded-xl">
                  <div className="text-2xl font-mono font-medium text-white tracking-widest select-all">
                    {revealedCode.slice(0, 3)} • {revealedCode.slice(3)}
                  </div>
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-2 px-3.5 py-2 bg-[#292a2b] hover:bg-[#343536] text-white rounded-lg text-xs font-mono transition-colors cursor-pointer border border-[#444748]/40"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    <span>{copyFeedback ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-[#0d0e0f] border border-[#444748]/20 rounded-xl font-mono text-xs text-[#8e9192] leading-relaxed">
                  The current code is hidden (stored hashed on the server). Rotate it to reveal a fresh one.
                </div>
              )}

              <button
                onClick={handleRegenerate}
                disabled={busy}
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#292a2b] hover:bg-[#343536] text-white rounded-xl text-sm font-mono transition-colors cursor-pointer border border-[#444748]/40 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">cached</span>
                <span>{revealedCode ? 'Rotate & show new code' : 'Reveal a new code'}</span>
              </button>

              <div className="p-3 bg-[#0d0e0f] border border-[#444748]/20 rounded-xl font-mono text-[10px] text-[#8e9192] leading-relaxed">
                CREATED {formatWhen(activeWorkspace.createdAt)} · LAST CHANGE {formatWhen(activeWorkspace.updatedAt)}
              </div>
            </div>

            <div className="pt-8">
              <button
                onClick={() => select(null)}
                className="w-full py-2.5 rounded-xl border border-[#444748]/40 text-[#c4c7c8] hover:text-white hover:border-[#8e9192] text-xs font-mono transition-colors cursor-pointer"
              >
                Create or join another workspace instead
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── No workspace yet: create or join ─────────────────────────────────────
  return (
    <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col gap-10">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 bg-[#292a2b] rounded text-white font-mono text-xs uppercase tracking-wider">
            Step 1 of 3
          </span>
          <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">
            Organization &amp; Workspace Setup
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl text-white font-semibold tracking-tight">Team &amp; Workspace</h1>

        <p className="text-sm sm:text-base text-[#c4c7c8] max-w-2xl leading-relaxed">
          Create a workspace bound to one of your GitHub repositories, or join an existing one with a teammate's 6-digit
          invite code. Everything is verified server-side — no demo data anywhere.
        </p>
      </div>

      {createError ? (
        <div role="alert" className="px-4 py-3 rounded-xl border border-[#ffb4ab]/40 bg-[#93000a]/15 text-[#ffdad6] text-xs leading-relaxed">
          {createError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        {/* CARD 1: CREATE WORKSPACE */}
        <div className="bg-[#171819] border border-[#444748]/25 rounded-2xl p-8 flex flex-col justify-between shadow-xl">
          <div className="flex flex-col gap-6">
            <div>
              <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">Option A</span>
              <h2 className="text-xl text-white font-semibold mt-1">Create Workspace</h2>
              <p className="text-xs sm:text-sm text-[#c4c7c8] mt-1.5 leading-relaxed">
                Name it, bind one of your GitHub repositories, and get a server-generated invite code.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-[#c4c7c8] uppercase">Workspace Name</label>
                <div className="flex items-center bg-[#0d0e0f] border border-[#444748]/30 rounded-xl px-4 py-3 focus-within:border-white transition-colors">
                  <span className="material-symbols-outlined text-[#8e9192] text-[20px] mr-3">domain</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={64}
                    placeholder="e.g. Core Platform"
                    className="w-full bg-transparent text-sm text-white outline-none font-mono"
                  />
                </div>
              </div>

              {/* REAL repository dropdown — your GitHub repos via /api/github/repos */}
              <RepoSelect value={repo} onChange={setRepo} />
            </div>
          </div>

          <div className="pt-8">
            <button
              onClick={handleCreate}
              disabled={busy || !name.trim() || !repo}
              className="w-full flex items-center justify-center gap-2 py-4 bg-white hover:bg-[#e2e2e2] text-[#121315] font-semibold text-sm rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>{busy ? 'Creating…' : 'Create Workspace'}</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* CARD 2: JOIN WORKSPACE — server-verified 6-digit code */}
        <div className="bg-[#171819] border border-[#444748]/25 rounded-2xl p-8 flex flex-col justify-between shadow-xl">
          <div className="flex flex-col gap-6">
            <div>
              <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">Option B</span>
              <h2 className="text-xl text-white font-semibold mt-1">Join Existing Workspace</h2>
              <p className="text-xs sm:text-sm text-[#c4c7c8] mt-1.5 leading-relaxed">
                Enter a teammate's 6-digit invite code. The server checks the code's hash — wrong codes are rejected.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-[#c4c7c8] uppercase">6-Digit Invite Code</label>
                <div className="grid grid-cols-6 gap-3 py-2">
                  {joinCode.map((digit, index) => (
                    <input
                      key={index}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleJoinDigit(index, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !joinCode[index] && index > 0) {
                          const prev = document.querySelectorAll<HTMLInputElement>('input[data-join-digit]');
                          prev[index - 1]?.focus();
                        }
                        if (e.key === 'Enter') void handleJoin();
                      }}
                      data-join-digit
                      className="h-14 text-center text-xl font-mono font-semibold bg-[#0d0e0f] border border-[#444748]/40 text-white rounded-xl outline-none focus:border-white focus:bg-[#1f2021] transition-all"
                    />
                  ))}
                </div>
              </div>

              {joinError ? (
                <div role="alert" className="px-3.5 py-3 rounded-xl border border-[#ffb4ab]/40 bg-[#93000a]/15 text-[#ffdad6] text-xs leading-relaxed">
                  {joinError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="pt-8">
            <button
              onClick={handleJoin}
              disabled={busy || joinCodeValue.length !== 6}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#292a2b] hover:bg-[#343536] text-white font-medium text-sm rounded-xl transition-all cursor-pointer border border-[#444748]/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{busy ? 'Verifying…' : 'Verify & Join Workspace'}</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamWorkspaceView;
