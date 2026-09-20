import React, { useState, useRef } from 'react';
import { NavigationPath } from '../../types';

interface TeamWorkspaceViewProps {
  onNavigate: (path: NavigationPath) => void;
}

export const TeamWorkspaceView: React.FC<TeamWorkspaceViewProps> = ({ onNavigate }) => {
  const [workspaceName, setWorkspaceName] = useState('Team Insomniacs // Core Platform');
  const [selectedRepo, setSelectedRepo] = useState('org/interlock-monorepo');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [passcode, setPasscode] = useState('794 • 218');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [pinDigits, setPinDigits] = useState(['7', '9', '4', '2', '1', '8']);
  const [pinVerified, setPinVerified] = useState(true);
  const [verifyingRoom, setVerifyingRoom] = useState(false);

  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const handleRegenerate = () => {
    const p1 = Math.floor(100 + Math.random() * 900);
    const p2 = Math.floor(100 + Math.random() * 900);
    setPasscode(`${p1} • ${p2}`);
  };

  const handleCopy = () => {
    const rawCode = passcode.replace(/[^\d]/g, '');
    navigator.clipboard.writeText(rawCode).catch(() => {});
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handlePinChange = (index: number, val: string) => {
    const digit = val.replace(/[^\d]/g, '').slice(-1);
    const updated = [...pinDigits];
    updated[index] = digit;
    setPinDigits(updated);

    if (digit && index < 5) {
      pinInputRefs[index + 1].current?.focus();
    }

    const fullCode = updated.join('');
    if (fullCode.length === 6) {
      setPinVerified(fullCode === '794218' || fullCode.length === 6);
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  const handleJoinRoom = () => {
    setVerifyingRoom(true);
    setTimeout(() => {
      setVerifyingRoom(false);
      onNavigate('connect-agents');
    }, 600);
  };

  return (
    <div className="w-full px-6 lg:px-12 py-10 max-w-6xl mx-auto flex flex-col gap-10">
      {/* Clean, Readable Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 bg-[#292a2b] rounded text-white font-mono text-xs uppercase tracking-wider">
            Step 1 of 3
          </span>
          <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">
            Organization & Workspace Setup
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl text-white font-semibold tracking-tight">
          Team & Workspace
        </h1>

        <p className="text-sm sm:text-base text-[#c4c7c8] max-w-2xl leading-relaxed">
          Create a shared coordination workspace for your monorepo or join an existing peer session using a 6-digit sync code.
        </p>
      </div>

      {/* Spacious 2-Column Bento Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        {/* CARD 1: CREATE WORKSPACE */}
        <div className="bg-[#171819] border border-[#444748]/25 rounded-2xl p-8 flex flex-col justify-between shadow-xl">
          <div className="flex flex-col gap-6">
            <div>
              <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">Option A</span>
              <h2 className="text-xl text-white font-semibold mt-1">
                Create Workspace
              </h2>
              <p className="text-xs sm:text-sm text-[#c4c7c8] mt-1.5 leading-relaxed">
                Generate an invite passcode and bind your monorepo for synchronized agent locking.
              </p>
            </div>

            {/* Inputs */}
            <div className="flex flex-col gap-5">
              {/* Workspace Identity */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-[#c4c7c8] uppercase">
                  Workspace Name
                </label>
                <div className="flex items-center bg-[#0d0e0f] border border-[#444748]/30 rounded-xl px-4 py-3 focus-within:border-white transition-colors">
                  <span className="material-symbols-outlined text-[#8e9192] text-[20px] mr-3">domain</span>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Workspace Name"
                    className="w-full bg-transparent text-sm text-white outline-none font-mono"
                  />
                </div>
              </div>

              {/* Target Repository */}
              <div className="flex flex-col gap-2 relative">
                <label className="text-xs font-mono text-[#c4c7c8] uppercase">
                  Monorepo Repository
                </label>
                <div
                  onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                  className="flex items-center justify-between bg-[#0d0e0f] border border-[#444748]/30 rounded-xl px-4 py-3 cursor-pointer hover:border-[#8e9192] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#8e9192] text-[20px]">account_tree</span>
                    <span className="text-sm text-white font-mono">{selectedRepo}</span>
                  </div>
                  <span className="material-symbols-outlined text-[#8e9192] text-[20px]">expand_more</span>
                </div>

                {repoDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#1f2021] border border-[#444748] rounded-xl shadow-2xl z-20 overflow-hidden font-mono text-xs">
                    {['org/interlock-monorepo', 'org/distributed-inference', 'org/ast-engine'].map((repo) => (
                      <div
                        key={repo}
                        onClick={() => {
                          setSelectedRepo(repo);
                          setRepoDropdownOpen(false);
                        }}
                        className="px-4 py-3 hover:bg-[#292a2b] text-white cursor-pointer flex items-center justify-between"
                      >
                        <span>{repo}</span>
                        {selectedRepo === repo && <span className="text-white text-xs">CURRENT</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Passcode Box */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-[#c4c7c8] uppercase">
                    Mesh Invite Passcode
                  </label>
                  <button
                    onClick={handleRegenerate}
                    className="flex items-center gap-1 text-xs font-mono text-[#8e9192] hover:text-white transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">cached</span>
                    <span>Regenerate</span>
                  </button>
                </div>
                <div className="flex items-center justify-between bg-[#0d0e0f] border border-[#444748]/30 px-5 py-4 rounded-xl">
                  <div className="text-2xl font-mono font-medium text-white tracking-widest select-all">
                    {passcode}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-3.5 py-2 bg-[#292a2b] hover:bg-[#343536] text-white rounded-lg text-xs font-mono transition-colors cursor-pointer border border-[#444748]/40"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    <span>{copyFeedback ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Active Team Members List */}
              <div className="flex flex-col gap-2 pt-1">
                <span className="text-xs font-mono text-[#8e9192] uppercase">
                  Connected Team Members (3)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 bg-[#0d0e0f] rounded-lg border border-[#444748]/20 flex flex-col">
                    <span className="text-xs font-medium text-white truncate">Karthik</span>
                    <span className="text-[10px] text-[#8e9192] font-mono">Lead (You)</span>
                  </div>
                  <div className="p-2.5 bg-[#0d0e0f] rounded-lg border border-[#444748]/20 flex flex-col">
                    <span className="text-xs font-medium text-white truncate">Surya</span>
                    <span className="text-[10px] text-[#8e9192] font-mono">AI Pipeline</span>
                  </div>
                  <div className="p-2.5 bg-[#0d0e0f] rounded-lg border border-[#444748]/20 flex flex-col">
                    <span className="text-xs font-medium text-white truncate">Tejashwin</span>
                    <span className="text-[10px] text-[#8e9192] font-mono">Mobile Shell</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Primary CTA */}
          <div className="pt-8">
            <button
              onClick={() => onNavigate('connect-agents')}
              className="w-full flex items-center justify-center gap-2 py-4 bg-white hover:bg-[#e2e2e2] text-[#121315] font-semibold text-sm rounded-xl transition-all shadow-md cursor-pointer"
            >
              <span>Initialize Workspace & Connect Agents</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* CARD 2: JOIN WORKSPACE */}
        <div className="bg-[#171819] border border-[#444748]/25 rounded-2xl p-8 flex flex-col justify-between shadow-xl">
          <div className="flex flex-col gap-6">
            <div>
              <span className="font-mono text-xs text-[#8e9192] uppercase tracking-wider">Option B</span>
              <h2 className="text-xl text-white font-semibold mt-1">
                Join Existing Workspace
              </h2>
              <p className="text-xs sm:text-sm text-[#c4c7c8] mt-1.5 leading-relaxed">
                Enter a 6-digit room code from a teammate to connect your local environment.
              </p>
            </div>

            {/* Clean PIN input */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-[#c4c7c8] uppercase">
                  6-Digit Invite Code
                </label>
                <div className="grid grid-cols-6 gap-3 py-2">
                  {pinDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={pinInputRefs[index]}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(index, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(index, e)}
                      className="h-14 sm:h-16 text-center text-xl sm:text-2xl font-mono font-semibold bg-[#0d0e0f] border border-[#444748]/40 text-white rounded-xl outline-none focus:border-white focus:bg-[#1f2021] transition-all"
                    />
                  ))}
                </div>
              </div>

              {/* Verified Room Card */}
              <div className="p-4 bg-[#0d0e0f] border border-[#444748]/30 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white text-[#121315] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">check</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white">Team Insomniacs Verified</span>
                    <span className="text-xs text-[#8e9192] font-mono">Cluster hash matched • Ready to connect</span>
                  </div>
                </div>
                <span className="font-mono text-xs text-white bg-[#292a2b] px-2.5 py-1 rounded">
                  ONLINE
                </span>
              </div>
            </div>
          </div>

          {/* Join CTA */}
          <div className="pt-8">
            <button
              onClick={handleJoinRoom}
              disabled={verifyingRoom}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#292a2b] hover:bg-[#343536] text-white font-medium text-sm rounded-xl transition-all cursor-pointer border border-[#444748]/40 disabled:opacity-50"
            >
              {verifyingRoom ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <span>Verify & Join Room</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
