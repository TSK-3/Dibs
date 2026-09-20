import React from 'react';
import { NavigationPath } from '../../types';
import { BRAND_LOGO_URL } from '../../data/mockData';
import { useAuth } from '../../auth/AuthContext';
import { formatTimestamp } from '../../lib/authClient';

interface AuthViewProps {
  onNavigate: (path: NavigationPath) => void;
}

/**
 * Official Google "G" mark. Google's brand guidelines require the mark to keep
 * its own colours on a white button, so it is inlined verbatim, not themed.
 */
const GoogleMark: React.FC = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const GitHubMark: React.FC = () => (
  <svg className="w-5 h-5 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
    <path
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      fillRule="evenodd"
    />
  </svg>
);

const ProviderMark: React.FC<{ id: string }> = ({ id }) => (id === 'google' ? <GoogleMark /> : <GitHubMark />);

const Banner: React.FC<{ tone: 'error' | 'notice'; children: React.ReactNode; onDismiss?: () => void }> = ({
  tone,
  children,
  onDismiss,
}) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={`flex items-start gap-2.5 px-3.5 py-3 rounded-xl border text-xs leading-relaxed ${
      tone === 'error'
        ? 'bg-[#93000a]/15 border-[#ffb4ab]/40 text-[#ffdad6]'
        : 'bg-[#1b1c1d] border-[#444748]/30 text-[#c4c7c8]'
    }`}
  >
    <span className="material-symbols-outlined text-[16px] mt-px">{tone === 'error' ? 'error' : 'passkey'}</span>
    <span className="flex-1">{children}</span>
    {onDismiss ? (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="text-[#8e9192] hover:text-white transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    ) : null}
  </div>
);

/** Signed-in state: everything the server actually knows about this session. */
const SessionPanel: React.FC<AuthViewProps> = ({ onNavigate }) => {
  const { user, session, providers, signIn, signOut, busyProvider } = useAuth();
  const current = session?.session ?? null;
  if (!user || !current) return null;

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: 'Identity', value: user.id, mono: true },
    { label: 'Provider', value: user.providerLabel },
    { label: 'Account', value: user.username ? `@${user.username}` : user.email ?? '—', mono: true },
    { label: 'Email verified', value: user.emailVerified ? 'yes' : 'no' },
    { label: 'Session issued', value: formatTimestamp(current.issuedAt), mono: true },
    { label: 'Session expires', value: formatTimestamp(current.expiresAt), mono: true },
    { label: 'Sign-ins', value: String(user.loginCount) },
  ];

  return (
    <div className="w-full max-w-lg flex flex-col gap-4">
      <div className="bg-[#171819] border border-[#444748]/30 rounded-2xl shadow-2xl p-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="w-12 h-12 rounded-full border border-[#444748]/40 object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#292a2b] border border-[#444748]/40 flex items-center justify-center text-white font-semibold">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-white font-semibold truncate">{user.name}</span>
            <span className="font-mono text-[11px] text-[#8e9192] truncate">
              {user.email ?? user.username ?? user.providerLabel}
            </span>
          </div>
          <span className="ml-auto px-2.5 py-1 rounded-full bg-[#1b1c1d] border border-[#444748]/30 font-mono text-[10px] text-white">
            {user.providerLabel.toUpperCase()}
          </span>
        </div>

        <div className="flex flex-col divide-y divide-[#444748]/20 border-y border-[#444748]/20">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
              <span className="font-mono text-[11px] text-[#8e9192] uppercase">{row.label}</span>
              <span className={`text-xs text-[#e3e2e3] truncate ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('team-workspace')}
            className="flex-1 h-11 rounded-xl bg-white text-[#121315] font-semibold text-sm hover:bg-[#e2e2e2] transition-colors cursor-pointer"
          >
            Back to workspace
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="h-11 px-4 rounded-xl bg-[#1b1c1d] border border-[#444748]/30 text-[#e3e2e3] text-sm font-medium hover:border-[#8e9192] transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            Sign out
          </button>
        </div>
      </div>

      <div className="bg-[#0d0e0f] border border-[#444748]/20 rounded-2xl p-5 flex flex-col gap-3">
        <span className="font-mono text-[10px] text-[#8e9192] uppercase">Switch account</span>
        <div className="flex flex-col sm:flex-row gap-2">
          {providers.filter((p) => p.configured).map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled={busyProvider !== null}
              onClick={() => signIn(provider.id)}
              className="flex-1 h-10 rounded-xl bg-[#1b1c1d] border border-[#444748]/30 text-[#e3e2e3] text-xs font-medium hover:border-[#8e9192] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <ProviderMark id={provider.id} />
              {provider.label}
            </button>
          ))}
        </div>
        <p className="font-mono text-[10px] text-[#8e9192] leading-relaxed">
          SESSIONS ARE SIGNED WITH HMAC-SHA256, STORED IN AN HTTP-ONLY COOKIE, AND VALID FOR 12 HOURS
        </p>
      </div>
    </div>
  );
};

/**
 * The sign-in surface. Two real OAuth 2.0 providers — Gmail/Google and GitHub —
 * driven by whatever the identity service reports as configured, so the UI can
 * never promise a provider the server cannot complete.
 */
export const AuthView: React.FC<AuthViewProps> = ({ onNavigate }) => {
  const { status, user, providers, error, notice, busyProvider, signIn, clearError } = useAuth();

  if (status === 'authenticated' && user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] w-full flex items-center justify-center p-6">
        <SessionPanel onNavigate={onNavigate} />
      </div>
    );
  }

  const loading = status === 'loading';
  // Only providers the server can actually complete render as buttons; the rest
  // surface as an actionable setup note instead of dead UI.
  const ready = providers.filter((p) => p.configured);
  const pending = providers.filter((p) => !p.configured);

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full flex items-center justify-center p-6">
      <div className="flex flex-col w-full items-center justify-center max-w-md gap-4">
        <div className="w-full bg-[#171819] border border-[#444748]/30 rounded-2xl shadow-2xl p-8 flex flex-col gap-6">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 flex items-center justify-center p-2 rounded-xl bg-[#292a2b] border border-[#444748]/30">
              <img
                alt="Interlock Logo"
                className="w-full h-full object-contain filter contrast-200"
                src={BRAND_LOGO_URL}
              />
            </div>
            <h1 className="text-2xl text-white font-semibold tracking-tight mt-2">Sign in to Interlock</h1>
            <p className="text-xs text-[#c4c7c8] max-w-xs leading-relaxed">
              Use your Gmail or GitHub account. Only the profile fields needed to identify you in a shared workspace
              are read.
            </p>
          </div>

          {error ? (
            <Banner tone="error" onDismiss={clearError}>
              {error}
            </Banner>
          ) : null}
          {notice ? <Banner tone="notice">{notice}</Banner> : null}

          <div className="flex flex-col gap-3">
            {providers.length === 0 && !loading ? (
              <Banner tone="error">
                The identity service is unreachable. Start it with{' '}
                <span className="font-mono">npm run auth</span> (or{' '}
                <span className="font-mono">npm run dev:full</span>).
              </Banner>
            ) : null}

            {providers.length > 0 && ready.length === 0 ? (
              <Banner tone="error">
                No sign-in provider is configured yet. Add{' '}
                <span className="font-mono">GITHUB_CLIENT_ID</span> /{' '}
                <span className="font-mono">GITHUB_CLIENT_SECRET</span> (and/or{' '}
                <span className="font-mono">GOOGLE_CLIENT_ID</span> /{' '}
                <span className="font-mono">GOOGLE_CLIENT_SECRET</span>) to{' '}
                <span className="font-mono">.env.local</span>, then restart the identity service.
              </Banner>
            ) : null}

            {ready.map((provider) => {
              const busy = busyProvider === provider.id;
              const disabled = !provider.configured || busyProvider !== null || loading;
              const isGoogle = provider.id === 'google';
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => signIn(provider.id)}
                  disabled={disabled}
                  title={provider.configured ? undefined : `Set ${provider.setupEnv.join(' + ')}`}
                  className={`w-full h-12 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default ${
                    isGoogle
                      ? 'bg-white text-[#121315] hover:bg-[#e9e9e9] shadow-sm'
                      : 'bg-[#1b1c1d] border border-[#444748]/40 text-white hover:border-[#8e9192]'
                  }`}
                >
                  <ProviderMark id={provider.id} />
                  <span className="flex flex-col items-start leading-tight">
                    <span>
                      {busy
                        ? `Opening ${provider.label}…`
                        : provider.configured
                          ? `Continue with ${provider.label}`
                          : `${provider.label} sign-in unavailable`}
                    </span>
                    <span
                      className={`font-mono text-[10px] font-normal ${isGoogle ? 'text-[#5f6368]' : 'text-[#8e9192]'}`}
                    >
                      {provider.configured ? provider.accountLabel : `set ${provider.setupEnv.join(' + ')}`}
                    </span>
                  </span>
                </button>
              );
            })}

            {ready.length > 0 && pending.length > 0 ? (
              <p className="font-mono text-[10px] text-[#8e9192] leading-relaxed">
                Available after setup:
                {pending.map((p) => ` ${p.label.toUpperCase()} — set ${p.setupEnv.join(' + ')}`).join(' · ')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-[#444748]/20 pt-4">
            <p className="font-mono text-[10px] text-[#8e9192] leading-relaxed">
              OAUTH 2.0 AUTHORIZATION CODE{providers.some((p) => p.pkce) ? ' · PKCE S256' : ''} · STATE VALIDATED ·
              HTTP-ONLY SESSION COOKIE
            </p>
          </div>
        </div>

        {loading ? (
          <p className="font-mono text-[10px] text-[#8e9192] uppercase">Checking for an existing session…</p>
        ) : null}
      </div>
    </div>
  );
};


