import React, { useState } from 'react';
import { NavigationPath } from '../../types';
import { BRAND_LOGO_URL } from '../../data/mockData';

interface AuthViewProps {
  onAuthenticated: () => void;
  onNavigate: (path: NavigationPath) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthenticated, onNavigate }) => {
  const [showSecret, setShowSecret] = useState(false);
  const [secretKey, setSecretKey] = useState('intl_live_sec_89f02c984a1e94b2');
  const [keepDaemonActive, setKeepDaemonActive] = useState(true);
  const [authStatus, setAuthStatus] = useState<'idle' | 'verifying' | 'authenticated'>('idle');

  const handleGenerateKey = (e: React.MouseEvent) => {
    e.preventDefault();
    const randomHex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setSecretKey(`intl_live_sec_${randomHex}`);
  };

  const handleAuth = (type: 'token' | 'github' | 'passkey' = 'token') => {
    setAuthStatus('verifying');
    setTimeout(() => {
      setAuthStatus('authenticated');
      onAuthenticated();
      setTimeout(() => {
        onNavigate('team-workspace');
      }, 700);
    }, 900);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full flex items-center justify-center p-6 relative">
      <div className="flex flex-col w-full items-center justify-center max-w-md">
        {/* Main Authentication Card */}
        <div className="w-full bg-[#171819] border border-[#444748]/30 rounded-2xl shadow-2xl p-8 flex flex-col gap-6">
          {/* Header & Logo */}
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 flex items-center justify-center p-2 rounded-xl bg-[#292a2b] border border-[#444748]/30">
              <img
                alt="Interlock Logo"
                className="w-full h-full object-contain filter contrast-200"
                src={BRAND_LOGO_URL}
              />
            </div>
            <h1 className="text-2xl text-white font-semibold tracking-tight mt-2">
              Sign in to Interlock
            </h1>
            <p className="text-xs text-[#c4c7c8] max-w-xs leading-relaxed">
              Deterministic P2P monorepo intent locking and collision protection.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => handleAuth('github')}
              disabled={authStatus !== 'idle'}
              className="w-full h-11 px-4 rounded-xl bg-white text-[#121315] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#e2e2e2] transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              type="button"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  fillRule="evenodd"
                ></path>
              </svg>
              <span>Continue with GitHub</span>
            </button>

            <button
              onClick={() => handleAuth('passkey')}
              disabled={authStatus !== 'idle'}
              className="w-full h-11 px-4 rounded-xl bg-[#292a2b] hover:bg-[#343536] border border-[#444748]/30 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">key</span>
              <span>Continue with Hardware Key / Passkey</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-[#444748]/30"></div>
            <span className="absolute bg-[#171819] px-3 font-mono text-[10px] text-[#8e9192] uppercase">
              OR SESSION TOKEN
            </span>
          </div>

          {/* Token Form */}
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleAuth('token');
            }}
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono text-[#c4c7c8] uppercase" htmlFor="cli_secret">
                  Developer Secret Key
                </label>
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  className="text-[11px] font-mono text-[#8e9192] hover:text-white transition-colors cursor-pointer"
                >
                  Generate Key
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  id="cli_secret"
                  name="cli_secret"
                  type={showSecret ? 'text' : 'password'}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  autoComplete="off"
                  placeholder="intl_live_sec_..."
                  className="w-full h-11 bg-[#0d0e0f] border border-[#444748]/30 px-3.5 pr-10 rounded-xl text-white font-mono text-xs outline-none focus:border-white transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 text-[#8e9192] hover:text-white cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showSecret ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Daemon checkbox */}
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-[#c4c7c8] hover:text-white">
              <input
                type="checkbox"
                checked={keepDaemonActive}
                onChange={(e) => setKeepDaemonActive(e.target.checked)}
                className="rounded accent-white"
              />
              <span>Keep daemon background connection active</span>
            </label>

            <button
              type="submit"
              disabled={authStatus !== 'idle'}
              className="mt-2 w-full h-11 rounded-xl bg-white text-[#121315] font-semibold text-sm hover:bg-[#e2e2e2] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow disabled:opacity-50"
            >
              {authStatus === 'verifying' ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                  <span>Verifying Node...</span>
                </>
              ) : authStatus === 'authenticated' ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  <span>Authenticated</span>
                </>
              ) : (
                <>
                  <span>Authenticate Node</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
