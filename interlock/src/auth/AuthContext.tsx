// src/auth/AuthContext.tsx — the SPA's single source of truth for "who is signed
// in". Wraps the fetch client in React state so no view has to re-implement
// loading, error or provider-discovery handling.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AuthProviderInfo,
  AuthSession,
  AuthUser,
  consumeAuthCallback,
  describeAuthError,
  endSession,
  fetchProviders,
  fetchSession,
  startSignIn,
} from '../lib/authClient';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  session: AuthSession | null;
  providers: AuthProviderInfo[];
  error: string | null;
  notice: string | null;
  busyProvider: string | null;
  signIn: (providerId: string) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Reads ?auth=… / ?auth_error=… before the first render and strips it.
  const [callback] = useState(() => consumeAuthCallback());
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [providers, setProviders] = useState<AuthProviderInfo[]>([]);
  const [error, setError] = useState<string | null>(() => describeAuthError(callback.error));
  const [notice, setNotice] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [available, current] = await Promise.all([fetchProviders(), fetchSession()]);
    setProviders(available);
    setSession(current);
    setStatus(current ? 'authenticated' : 'unauthenticated');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setSession(null);
      setStatus('unauthenticated');
      setBusyProvider(null);
      setError('Your sign-in expired. Please sign in again to continue.');
    };
    window.addEventListener('interlock:session-expired', handleSessionExpired);
    return () => window.removeEventListener('interlock:session-expired', handleSessionExpired);
  }, []);

  useEffect(() => {
    if (callback.status === 'success' && callback.provider) {
      setNotice(`Signed in with ${callback.provider}.`);
    }
  }, [callback]);

  const signIn = useCallback((providerId: string) => {
    setError(null);
    setBusyProvider(providerId);
    startSignIn(providerId);
  }, []);

  const signOut = useCallback(async () => {
    setBusyProvider(null);
    await endSession();
    setSession(null);
    setNotice(null);
    setStatus('unauthenticated');
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      providers,
      error,
      notice,
      busyProvider,
      signIn,
      signOut,
      refresh,
      clearError,
    }),
    [status, session, providers, error, notice, busyProvider, signIn, signOut, refresh, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
