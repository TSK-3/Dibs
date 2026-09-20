// src/lib/authClient.ts — the only place the SPA talks to the identity service.
//
// Every call is same-origin (`/api/...`): proxied to the auth server by Vite in
// development, served by the auth server itself in production. That keeps the
// HttpOnly session cookie first-party, which is what makes this flow safe.

export type ProviderId = string;

export interface AuthProviderInfo {
  id: ProviderId;
  label: string;
  accountLabel: string;
  scopes: string[];
  pkce: boolean;
  /** False when the server has no client credentials for this provider. */
  configured: boolean;
  /** Env vars an operator must set while `configured` is false (names only). */
  setupEnv: string[];
}

export interface AuthUser {
  id: string;
  provider: ProviderId;
  providerLabel: string;
  name: string;
  username: string | null;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string;
  loginCount: number;
}

export interface AuthSessionInfo {
  id: string;
  provider: ProviderId;
  issuedAt: number;
  expiresAt: number;
}

export interface AuthSession {
  user: AuthUser;
  session: AuthSessionInfo;
}

export interface AuthCallback {
  status: 'success' | null;
  error: string | null;
  provider: string | null;
}

const BASE = '/api/auth';

async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  let body: T | null = null;
  try {
    body = text ? (JSON.parse(text) as T) : null;
  } catch {
    body = null; // a proxy or gateway error page: treat as "no data"
  }
  return { status: response.status, body };
}

/** Which providers the server can actually complete a sign-in with. */
export async function fetchProviders(): Promise<AuthProviderInfo[]> {
  try {
    const { status, body } = await getJson<{ ok: boolean; providers: AuthProviderInfo[] }>('/providers');
    if (status !== 200 || !body?.ok) return [];
    return body.providers ?? [];
  } catch {
    return [];
  }
}

/** Current session, or null when signed out (401 is an expected answer). */
export async function fetchSession(): Promise<AuthSession | null> {
  try {
    const { status, body } = await getJson<{ ok: boolean; user: AuthUser; session: AuthSessionInfo }>('/me');
    if (status === 200 && body?.ok && body.user) {
      return { user: body.user, session: body.session };
    }
    return null;
  } catch {
    return null;
  }
}

export async function endSession(): Promise<void> {
  try {
    await fetch(`${BASE}/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
    /* offline: the server-side cookie still expires, the UI just reloads */
  }
}

/**
 * OAuth needs a top-level navigation — the provider has to render its own
 * consent screen — so this is a full-page redirect, not a fetch.
 */
export function startSignIn(providerId: ProviderId, returnTo?: string): void {
  const target = new URL(`${BASE}/${providerId}/start`, window.location.origin);
  const requested = returnTo ?? `${window.location.pathname}${window.location.search}`;
  target.searchParams.set('returnTo', requested.startsWith('/') && !requested.startsWith('//') ? requested : '/');
  window.location.assign(target.toString());
}

let consumedCallback: AuthCallback | null = null;

/** Reads `?auth=…` / `?auth_error=…` exactly once, then cleans the URL. */
export function consumeAuthCallback(): AuthCallback {
  if (consumedCallback) return consumedCallback;
  const result: AuthCallback = { status: null, error: null, provider: null };
  consumedCallback = result;

  if (typeof window === 'undefined') return result;
  const params = new URLSearchParams(window.location.search);
  const status = params.get('auth');
  if (status === 'success') result.status = status;
  result.error = params.get('auth_error');
  result.provider = params.get('auth_provider');

  if (status || result.error) {
    params.delete('auth');
    params.delete('auth_error');
    params.delete('auth_provider');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }
  return result;
}

/** Server-side error codes → copy a human can act on. */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: 'That sign-in attempt expired or was tampered with. Please try again.',
  provider_denied: 'Sign-in was cancelled at the provider.',
  provider_error: 'The provider rejected the sign-in. Please try again.',
  provider_unreachable: 'Could not reach the provider. Check the connection and retry.',
  missing_code: 'The provider did not return an authorization code.',
  google_not_configured:
    'Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local, then restart the identity service.',
  github_not_configured:
    'GitHub sign-in is not configured on this server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.local, then restart the identity service.',
  server_error: 'The identity service hit an unexpected error. Check its logs.',
};

export const describeAuthError = (code: string | null | undefined): string | null => {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? `Sign-in failed (${code}).`;
};

export const formatTimestamp = (ms: number): string => new Date(ms).toLocaleString();
